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
    public let error: SourceError?
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
        var files: [String: Data] = [:]
        for entry in entries where entry.kind == "file" {
            files[entry.path] = try await fetchFile(entry, snapshotId: snapshotId, agent: record.agent)
        }
        guard files[source.entrypoint] != nil else {
            throw SourceInstallerError.missingEntrypoint(source.entrypoint)
        }
        return VerifiedSourceSnapshot(snapshotId: snapshotId, files: files, entries: entries)
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
