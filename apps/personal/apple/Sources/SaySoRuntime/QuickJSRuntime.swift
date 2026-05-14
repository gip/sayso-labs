import CQuickJS
import Combine
import Foundation
import SaySoCore

public struct RuntimeApplicationMetadata: Codable, Equatable, Sendable {
    public let appId: String
    public let runtimeSkillId: String
    public let abiVersion: String
    public let source: RuntimeSource?
}

public enum SaySoRuntimeState: Equatable, Sendable {
    case stopped
    case running(RuntimeApplicationMetadata)
    case crashed(String)
}

public enum SaySoRuntimeError: Error, LocalizedError, Equatable {
    case loadFailed(String)
    case notRunning

    public var errorDescription: String? {
        switch self {
        case .loadFailed(let message):
            return message
        case .notRunning:
            return "Runtime is not running."
        }
    }
}

public protocol RuntimeLogSink: Sendable {
    func appendRuntimeLog(_ line: String) async
}

public final class QuickJSRuntimeInstance: @unchecked Sendable {
    private var context: OpaquePointer?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    public private(set) var state: SaySoRuntimeState = .stopped

    public init() {}

    public static var quickJSVersion: String {
        String(cString: sayso_qjs_quickjs_version())
    }

    public static var bytecodeFormatVersion: String {
        String(cString: sayso_qjs_bytecode_format_version())
    }

    public static func supportsBytecodeArtifact(_ artifact: SourceRuntimeArtifact) -> Bool {
        artifact.kind == "runtime-bytecode" &&
            artifact.language.id == "javascript" &&
            artifact.language.version == "ES2023" &&
            artifact.language.profile == "sayso-runtime-single-script" &&
            artifact.bytecode.engine == "quickjs" &&
            artifact.bytecode.engineVersion == quickJSVersion &&
            artifact.bytecode.format == "quickjs-binary-json-bytecode" &&
            artifact.bytecode.formatVersion == bytecodeFormatVersion &&
            artifact.bytecode.evalType == "global" &&
            artifact.bytecode.mediaType == "application/vnd.sayso.quickjs-bytecode"
    }

    public static func compileBytecode(source: String) throws -> Data {
        var errorBuffer = [CChar](repeating: 0, count: 512)
        var bytecodeLength = 0
        guard let bytecodePointer = source.withCString({ sourcePointer in
            sayso_qjs_compile_bytecode(sourcePointer, &bytecodeLength, &errorBuffer, Int32(errorBuffer.count))
        }) else {
            throw SaySoRuntimeError.loadFailed(String(cString: errorBuffer))
        }
        defer { sayso_qjs_free_bytes(bytecodePointer) }
        return Data(bytes: bytecodePointer, count: bytecodeLength)
    }

    deinit {
        stop()
    }

    public func start(source: String, params: JSONValue = .object([:])) throws -> RuntimeApplicationMetadata {
        stop()
        guard let context = sayso_qjs_create() else {
            throw SaySoRuntimeError.loadFailed("Unable to create QuickJS context.")
        }
        var errorBuffer = [CChar](repeating: 0, count: 512)
        let paramsJSON = try String(data: encoder.encode(params), encoding: .utf8) ?? "{}"
        let paramsSet = paramsJSON.withCString { paramsPointer in
            sayso_qjs_set_params_json(context, paramsPointer, &errorBuffer, Int32(errorBuffer.count))
        }
        guard paramsSet == 1 else {
            sayso_qjs_destroy(context)
            let message = String(cString: errorBuffer)
            state = .crashed(message)
            throw SaySoRuntimeError.loadFailed(message)
        }
        let loaded = source.withCString { sourcePointer in
            sayso_qjs_load(context, sourcePointer, &errorBuffer, Int32(errorBuffer.count))
        }
        guard loaded == 1 else {
            sayso_qjs_destroy(context)
            let message = String(cString: errorBuffer)
            state = .crashed(message)
            throw SaySoRuntimeError.loadFailed(message)
        }
        do {
            let metadata: RuntimeApplicationMetadata
            if let jsonPointer = sayso_qjs_registered_application_json(context) {
                metadata = try RuntimeMetadataExtractor.application(fromRegisteredJSON: String(cString: jsonPointer))
            } else {
                metadata = try RuntimeMetadataExtractor.application(from: source)
            }
            self.context = context
            state = .running(metadata)
            return metadata
        } catch {
            sayso_qjs_destroy(context)
            let message = error.localizedDescription
            state = .crashed(message)
            throw error
        }
    }

    public func start(bytecode: Data, artifact: SourceRuntimeArtifact, sourceFallback: String, params: JSONValue = .object([:])) throws -> RuntimeApplicationMetadata {
        guard Self.supportsBytecodeArtifact(artifact) else {
            return try start(source: sourceFallback, params: params)
        }
        stop()
        guard let context = sayso_qjs_create() else {
            throw SaySoRuntimeError.loadFailed("Unable to create QuickJS context.")
        }
        var errorBuffer = [CChar](repeating: 0, count: 512)
        let paramsJSON = try String(data: encoder.encode(params), encoding: .utf8) ?? "{}"
        let paramsSet = paramsJSON.withCString { paramsPointer in
            sayso_qjs_set_params_json(context, paramsPointer, &errorBuffer, Int32(errorBuffer.count))
        }
        guard paramsSet == 1 else {
            sayso_qjs_destroy(context)
            let message = String(cString: errorBuffer)
            state = .crashed(message)
            throw SaySoRuntimeError.loadFailed(message)
        }
        let loaded = bytecode.withUnsafeBytes { rawBuffer -> Int32 in
            guard let pointer = rawBuffer.bindMemory(to: UInt8.self).baseAddress else { return 0 }
            return sayso_qjs_load_bytecode(context, pointer, rawBuffer.count, &errorBuffer, Int32(errorBuffer.count))
        }
        guard loaded == 1 else {
            sayso_qjs_destroy(context)
            let message = String(cString: errorBuffer)
            state = .crashed(message)
            throw SaySoRuntimeError.loadFailed(message)
        }
        do {
            let metadata: RuntimeApplicationMetadata
            if let jsonPointer = sayso_qjs_registered_application_json(context) {
                metadata = try RuntimeMetadataExtractor.application(fromRegisteredJSON: String(cString: jsonPointer))
            } else {
                metadata = try RuntimeMetadataExtractor.application(from: sourceFallback)
            }
            self.context = context
            state = .running(metadata)
            return metadata
        } catch {
            sayso_qjs_destroy(context)
            let message = error.localizedDescription
            state = .crashed(message)
            throw error
        }
    }

    public func call(_ method: String, input: JSONValue = .object([:])) throws -> JSONValue {
        guard let context else { throw SaySoRuntimeError.notRunning }
        let inputJSON = try String(data: encoder.encode(input), encoding: .utf8) ?? "{}"
        var errorBuffer = [CChar](repeating: 0, count: 512)
        guard let outputPointer = method.withCString({ methodPointer in
            inputJSON.withCString { inputPointer in
                sayso_qjs_call_application(context, methodPointer, inputPointer, &errorBuffer, Int32(errorBuffer.count))
            }
        }) else {
            throw SaySoRuntimeError.loadFailed(String(cString: errorBuffer))
        }
        defer { sayso_qjs_free_string(outputPointer) }
        let outputJSON = String(cString: outputPointer)
        return try decoder.decode(JSONValue.self, from: Data(outputJSON.utf8))
    }

    public func stop() {
        if let context {
            sayso_qjs_destroy(context)
        }
        context = nil
        state = .stopped
    }
}

public final class RuntimeSupervisor: ObservableObject {
    @Published public private(set) var states: [String: SaySoRuntimeState] = [:]
    private var runtimes: [String: QuickJSRuntimeInstance] = [:]
    private let store: InstalledAppStore

    public init(store: InstalledAppStore) {
        self.store = store
    }

    @discardableResult
    public func start(_ manifest: InstalledSaySoAppManifest) throws -> RuntimeApplicationMetadata {
        let source = try store.entrypointSource(for: manifest)
        let bytecodeArtifact = try store.bytecodeArtifacts(for: manifest)
            .first { candidate in
                candidate.artifact.sourcePath == manifest.entrypoint &&
                    QuickJSRuntimeInstance.supportsBytecodeArtifact(candidate.artifact)
            }
        let runtime = QuickJSRuntimeInstance()
        do {
            let metadata: RuntimeApplicationMetadata
            if let bytecodeArtifact {
                metadata = try runtime.start(
                    bytecode: bytecodeArtifact.data,
                    artifact: bytecodeArtifact.artifact,
                    sourceFallback: source
                )
            } else {
                metadata = try runtime.start(source: source)
            }
            runtimes[manifest.id] = runtime
            states[manifest.id] = .running(metadata)
            var updated = manifest
            updated.state = .running
            updated.lastError = nil
            try store.write(updated)
            return metadata
        } catch {
            states[manifest.id] = .crashed(error.localizedDescription)
            var updated = manifest
            updated.state = .crashed
            updated.lastError = error.localizedDescription
            try? store.write(updated)
            throw error
        }
    }

    public func stop(_ manifest: InstalledSaySoAppManifest) throws {
        runtimes[manifest.id]?.stop()
        runtimes[manifest.id] = nil
        states[manifest.id] = .stopped
        var updated = manifest
        updated.state = .stopped
        updated.lastError = nil
        try store.write(updated)
    }
}
