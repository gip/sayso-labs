import CryptoKit
import Foundation

public struct SourceFileEntry: Codable, Equatable, Sendable {
    public let path: String
    public let kind: String
    public let sizeBytes: Int
    public let sha256: String
    public let chunks: Int
    public let mediaType: String?
    public let executable: Bool?
}

public struct SourceRuntimeArtifactLanguage: Codable, Equatable, Sendable {
    public let id: String
    public let version: String
    public let profile: String

    public init(id: String, version: String, profile: String) {
        self.id = id
        self.version = version
        self.profile = profile
    }
}

public struct SourceRuntimeBytecode: Codable, Equatable, Sendable {
    public let engine: String
    public let engineVersion: String
    public let format: String
    public let formatVersion: String
    public let evalType: String
    public let mediaType: String

    public init(engine: String, engineVersion: String, format: String, formatVersion: String, evalType: String, mediaType: String) {
        self.engine = engine
        self.engineVersion = engineVersion
        self.format = format
        self.formatVersion = formatVersion
        self.evalType = evalType
        self.mediaType = mediaType
    }
}

public struct SourceRuntimeArtifact: Codable, Equatable, Sendable {
    public let artifactId: String
    public let kind: String
    public let language: SourceRuntimeArtifactLanguage
    public let sourcePath: String
    public let bytecodePath: String
    public let bytecode: SourceRuntimeBytecode

    public init(artifactId: String, kind: String, language: SourceRuntimeArtifactLanguage, sourcePath: String, bytecodePath: String, bytecode: SourceRuntimeBytecode) {
        self.artifactId = artifactId
        self.kind = kind
        self.language = language
        self.sourcePath = sourcePath
        self.bytecodePath = bytecodePath
        self.bytecode = bytecode
    }
}

public struct SourceManifestRequestPayload: Codable, Equatable, Sendable {
    public let requestId: String
    public let format: String?
    public let include: [String]?
    public let exclude: [String]?
    public let maxChunkSizeBytes: Int?

    public init(requestId: String, format: String? = "files", include: [String]? = nil, exclude: [String]? = nil, maxChunkSizeBytes: Int? = 65536) {
        self.requestId = requestId
        self.format = format
        self.include = include
        self.exclude = exclude
        self.maxChunkSizeBytes = maxChunkSizeBytes
    }
}

public struct SourceManifestResponsePayload: Codable, Equatable, Sendable {
    public let requestId: String
    public let status: String
    public let snapshotId: String?
    public let createdAt: String?
    public let expiresAt: String?
    public let chunkSizeBytes: Int?
    public let files: [SourceFileEntry]?
    public let runtimeArtifacts: [SourceRuntimeArtifact]?
    public let error: SourceError?

    public init(
        requestId: String,
        status: String,
        snapshotId: String? = nil,
        createdAt: String? = nil,
        expiresAt: String? = nil,
        chunkSizeBytes: Int? = nil,
        files: [SourceFileEntry]? = nil,
        runtimeArtifacts: [SourceRuntimeArtifact]? = nil,
        error: SourceError? = nil
    ) {
        self.requestId = requestId
        self.status = status
        self.snapshotId = snapshotId
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.chunkSizeBytes = chunkSizeBytes
        self.files = files
        self.runtimeArtifacts = runtimeArtifacts
        self.error = error
    }
}

public struct SourceChunkRequestPayload: Codable, Equatable, Sendable {
    public let requestId: String
    public let snapshotId: String
    public let target: SourceChunkTarget
    public let chunkIndex: Int

    public init(requestId: String, snapshotId: String, path: String, chunkIndex: Int) {
        self.requestId = requestId
        self.snapshotId = snapshotId
        target = SourceChunkTarget(kind: "file", path: path, format: nil)
        self.chunkIndex = chunkIndex
    }
}

public struct SourceChunkTarget: Codable, Equatable, Sendable {
    public let kind: String
    public let path: String?
    public let format: String?
}

public struct SourceChunkResponsePayload: Codable, Equatable, Sendable {
    public let requestId: String
    public let status: String
    public let snapshotId: String?
    public let target: SourceChunkTarget?
    public let chunkIndex: Int?
    public let chunkCount: Int?
    public let sha256: String?
    public let bytesBase64: String?
    public let error: SourceError?
}

public struct SourceError: Codable, Equatable, Sendable {
    public let code: String
    public let message: String
}

public protocol SaySoSourceTransport: Sendable {
    func requestSourceManifest(_ request: SourceManifestRequestPayload, agent: NetworkAgent) async throws -> SourceManifestResponsePayload
    func requestSourceChunk(_ request: SourceChunkRequestPayload, agent: NetworkAgent) async throws -> SourceChunkResponsePayload
}

public struct VerifiedSourceSnapshot: Equatable, Sendable {
    public let snapshotId: String
    public let files: [String: Data]
    public let entries: [SourceFileEntry]
    public let runtimeArtifacts: [SourceRuntimeArtifact]

    public func source(at path: String) -> String? {
        guard let data = files[path] else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

public enum SourceInstallerError: Error, LocalizedError, Equatable {
    case manifest(String)
    case missingSnapshotId
    case missingEntrypoint(String)
    case invalidChunk(String)
    case invalidRuntimeArtifact(String)
    case hashMismatch(path: String)

    public var errorDescription: String? {
        switch self {
        case .manifest(let message):
            return message
        case .missingSnapshotId:
            return "Source manifest did not include a snapshot id."
        case .missingEntrypoint(let path):
            return "Source entrypoint was not present in the verified snapshot: \(path)."
        case .invalidChunk(let message):
            return message
        case .invalidRuntimeArtifact(let message):
            return message
        case .hashMismatch(let path):
            return "Source hash verification failed for \(path)."
        }
    }
}

public struct SourceInstaller: Sendable {
    public var transport: SaySoSourceTransport
    public var requestId: @Sendable () -> String

    public init(transport: SaySoSourceTransport, requestId: @escaping @Sendable () -> String = { UUID().uuidString }) {
        self.transport = transport
        self.requestId = requestId
    }

    public func installSource(for record: NetworkAgentRecord, descriptor: RuntimeApplicationDescriptor) async throws -> VerifiedSourceSnapshot {
        guard let source = descriptor.source else {
            throw SourceInstallerError.manifest("Runtime application is missing source metadata.")
        }
        let manifest = try await transport.requestSourceManifest(
            SourceManifestRequestPayload(
                requestId: requestId(),
                format: source.format,
                include: source.include,
                exclude: source.exclude
            ),
            agent: record.agent
        )
        guard manifest.status == "ok" else {
            throw SourceInstallerError.manifest(manifest.error?.message ?? "Source manifest request failed.")
        }
        guard let snapshotId = manifest.snapshotId else {
            throw SourceInstallerError.missingSnapshotId
        }
        let entries = manifest.files ?? []
        let runtimeArtifacts = manifest.runtimeArtifacts ?? []
        try validateRuntimeArtifacts(runtimeArtifacts, entries: entries)
        var files: [String: Data] = [:]
        for entry in entries where entry.kind == "file" {
            files[entry.path] = try await fetchFile(entry, snapshotId: snapshotId, agent: record.agent)
        }
        guard files[source.entrypoint] != nil else {
            throw SourceInstallerError.missingEntrypoint(source.entrypoint)
        }
        return VerifiedSourceSnapshot(snapshotId: snapshotId, files: files, entries: entries, runtimeArtifacts: runtimeArtifacts)
    }

    private func validateRuntimeArtifacts(_ artifacts: [SourceRuntimeArtifact], entries: [SourceFileEntry]) throws {
        let filePaths = Set(entries.filter { $0.kind == "file" }.map(\.path))
        for artifact in artifacts {
            guard artifact.kind == "runtime-bytecode" else {
                throw SourceInstallerError.invalidRuntimeArtifact("Unsupported runtime artifact kind: \(artifact.kind).")
            }
            guard SaySoAppInstallabilityChecker.isSafeRelativePath(artifact.sourcePath) else {
                throw SourceInstallerError.invalidRuntimeArtifact("Runtime artifact source path is unsafe: \(artifact.sourcePath).")
            }
            guard SaySoAppInstallabilityChecker.isSafeRelativePath(artifact.bytecodePath) else {
                throw SourceInstallerError.invalidRuntimeArtifact("Runtime artifact bytecode path is unsafe: \(artifact.bytecodePath).")
            }
            guard filePaths.contains(artifact.sourcePath) else {
                throw SourceInstallerError.invalidRuntimeArtifact("Runtime artifact source was not present in the source snapshot: \(artifact.sourcePath).")
            }
            guard filePaths.contains(artifact.bytecodePath) else {
                throw SourceInstallerError.invalidRuntimeArtifact("Runtime artifact bytecode was not present in the source snapshot: \(artifact.bytecodePath).")
            }
        }
    }

    private func fetchFile(_ entry: SourceFileEntry, snapshotId: String, agent: NetworkAgent) async throws -> Data {
        var output = Data()
        for index in 0..<entry.chunks {
            let response = try await transport.requestSourceChunk(
                SourceChunkRequestPayload(
                    requestId: requestId(),
                    snapshotId: snapshotId,
                    path: entry.path,
                    chunkIndex: index
                ),
                agent: agent
            )
            guard response.status == "ok" else {
                throw SourceInstallerError.invalidChunk(response.error?.message ?? "Source chunk request failed.")
            }
            guard
                response.chunkIndex == index,
                response.chunkCount == entry.chunks,
                let bytesBase64 = response.bytesBase64,
                let chunkHash = response.sha256,
                let chunk = Data(base64Encoded: bytesBase64)
            else {
                throw SourceInstallerError.invalidChunk("Source chunk response was malformed.")
            }
            guard sha256Hex(chunk) == chunkHash else {
                throw SourceInstallerError.hashMismatch(path: "\(entry.path)#\(index)")
            }
            output.append(chunk)
        }
        guard output.count == entry.sizeBytes, sha256Hex(output) == entry.sha256 else {
            throw SourceInstallerError.hashMismatch(path: entry.path)
        }
        return output
    }
}

public func sha256Hex(_ data: Data) -> String {
    SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
}
