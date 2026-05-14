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
    private let logSink: RuntimeLogSink?
    public private(set) var state: SaySoRuntimeState = .stopped

    public init(logSink: RuntimeLogSink? = nil) {
        self.logSink = logSink
    }

    public static var quickJSVersion: String {
        String(cString: sayso_qjs_quickjs_version())
    }

    public static var bytecodeFormatVersion: String {
        String(cString: sayso_qjs_bytecode_format_version())
    }

    public static func supportsBytecodeArtifact(_ artifact: SourceRuntimeArtifact) -> Bool {
        bytecodeCompatibilityMismatchReason(artifact) == nil
    }

    static func bytecodeCompatibilityMismatchReason(_ artifact: SourceRuntimeArtifact) -> String? {
        if artifact.kind != "runtime-bytecode" {
            return "kind mismatch: artifact=\(artifact.kind), host=runtime-bytecode"
        }
        if artifact.language.id != "javascript" {
            return "language.id mismatch: artifact=\(artifact.language.id), host=javascript"
        }
        if artifact.language.version != "ES2023" {
            return "language.version mismatch: artifact=\(artifact.language.version), host=ES2023"
        }
        if artifact.language.profile != "sayso-runtime-single-script" {
            return "language.profile mismatch: artifact=\(artifact.language.profile), host=sayso-runtime-single-script"
        }
        if artifact.bytecode.engine != "quickjs" {
            return "engine mismatch: artifact=\(artifact.bytecode.engine), host=quickjs"
        }
        if artifact.bytecode.engineVersion != quickJSVersion {
            return "engineVersion mismatch: artifact=\(artifact.bytecode.engineVersion), host=\(quickJSVersion)"
        }
        if artifact.bytecode.format != "quickjs-binary-json-bytecode" {
            return "format mismatch: artifact=\(artifact.bytecode.format), host=quickjs-binary-json-bytecode"
        }
        if artifact.bytecode.formatVersion != bytecodeFormatVersion {
            return "formatVersion mismatch: artifact=\(artifact.bytecode.formatVersion), host=\(bytecodeFormatVersion)"
        }
        if artifact.bytecode.evalType != "global" {
            return "evalType mismatch: artifact=\(artifact.bytecode.evalType), host=global"
        }
        if artifact.bytecode.mediaType != "application/vnd.sayso.quickjs-bytecode" {
            return "mediaType mismatch: artifact=\(artifact.bytecode.mediaType), host=application/vnd.sayso.quickjs-bytecode"
        }
        return nil
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

    private func appendRuntimeLog(_ line: String) {
        guard let logSink else { return }
        Task {
            await logSink.appendRuntimeLog(line)
        }
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
        if let mismatchReason = Self.bytecodeCompatibilityMismatchReason(artifact) {
            appendRuntimeLog("QuickJS bytecode skipped for \(artifact.bytecodePath): \(mismatchReason); using source fallback.")
            return try start(source: sourceFallback, params: params)
        }
        appendRuntimeLog("QuickJS bytecode selected for \(artifact.bytecodePath).")
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
            appendRuntimeLog("QuickJS bytecode load failed for \(artifact.bytecodePath): \(message)")
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
            appendRuntimeLog("QuickJS bytecode loaded for \(artifact.bytecodePath).")
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
    private let logSink: RuntimeLogSink?

    public init(store: InstalledAppStore, logSink: RuntimeLogSink? = nil) {
        self.store = store
        self.logSink = logSink
    }

    @discardableResult
    public func start(_ manifest: InstalledSaySoAppManifest) throws -> RuntimeApplicationMetadata {
        let source = try store.entrypointSource(for: manifest)
        let entrypointBytecodeArtifacts = try store.bytecodeArtifacts(for: manifest)
            .filter { candidate in candidate.artifact.sourcePath == manifest.entrypoint }
        let bytecodeArtifact = entrypointBytecodeArtifacts.first { candidate in
            QuickJSRuntimeInstance.supportsBytecodeArtifact(candidate.artifact)
        } ?? entrypointBytecodeArtifacts.first
        let runtime = QuickJSRuntimeInstance(logSink: logSink)
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
