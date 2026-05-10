import Foundation

public struct SaySoContentType: Codable, Equatable, Hashable, Sendable {
    public let authorityId: String
    public let typeId: String
    public let versionMajor: Int
    public let versionMinor: Int

    public init(authorityId: String, typeId: String, versionMajor: Int = 1, versionMinor: Int = 0) {
        self.authorityId = authorityId
        self.typeId = typeId
        self.versionMajor = versionMajor
        self.versionMinor = versionMinor
    }

    public var name: String {
        "\(authorityId)/\(typeId)/\(versionMajor)"
    }
}

public enum SaySoContentTypes {
    public static let connectionRequest = SaySoContentType(authorityId: "sayso.protocol", typeId: "connection-request")
    public static let connectionResponse = SaySoContentType(authorityId: "sayso.protocol", typeId: "connection-response")
    public static let skillRequest = SaySoContentType(authorityId: "sayso.protocol", typeId: "skill-request")
    public static let skillResponse = SaySoContentType(authorityId: "sayso.protocol", typeId: "skill-response")
    public static let sourceManifestRequest = SaySoContentType(authorityId: "sayso.source", typeId: "source-manifest-request")
    public static let sourceManifestResponse = SaySoContentType(authorityId: "sayso.source", typeId: "source-manifest-response")
    public static let sourceChunkRequest = SaySoContentType(authorityId: "sayso.source", typeId: "source-chunk-request")
    public static let sourceChunkResponse = SaySoContentType(authorityId: "sayso.source", typeId: "source-chunk-response")
}

public struct SaySoMessage: Equatable, Sendable {
    public let contentType: SaySoContentType
    public let json: Data

    public init<T: Encodable>(contentType: SaySoContentType, payload: T, encoder: JSONEncoder = JSONEncoder()) throws {
        self.contentType = contentType
        json = try encoder.encode(payload)
    }

    public func decode<T: Decodable>(_ type: T.Type, decoder: JSONDecoder = JSONDecoder()) throws -> T {
        try decoder.decode(type, from: json)
    }
}

public protocol SaySoMessagingClient: Sendable {
    func sendRequest<T: Encodable, U: Decodable>(
        _ payload: T,
        contentType: SaySoContentType,
        expectedResponse: SaySoContentType,
        agent: NetworkAgent,
        responseType: U.Type
    ) async throws -> U
}

public struct SaySoSourceMessagingTransport: SaySoSourceTransport {
    public let client: SaySoMessagingClient

    public init(client: SaySoMessagingClient) {
        self.client = client
    }

    public func requestSourceManifest(_ request: SourceManifestRequestPayload, agent: NetworkAgent) async throws -> SourceManifestResponsePayload {
        try await client.sendRequest(
            request,
            contentType: SaySoContentTypes.sourceManifestRequest,
            expectedResponse: SaySoContentTypes.sourceManifestResponse,
            agent: agent,
            responseType: SourceManifestResponsePayload.self
        )
    }

    public func requestSourceChunk(_ request: SourceChunkRequestPayload, agent: NetworkAgent) async throws -> SourceChunkResponsePayload {
        try await client.sendRequest(
            request,
            contentType: SaySoContentTypes.sourceChunkRequest,
            expectedResponse: SaySoContentTypes.sourceChunkResponse,
            agent: agent,
            responseType: SourceChunkResponsePayload.self
        )
    }
}

public struct XMTPClientPlaceholder: SaySoMessagingClient {
    public init(identity: SaySoIdentity) {
        _ = identity
    }

    public func sendRequest<T: Encodable, U: Decodable>(
        _ payload: T,
        contentType: SaySoContentType,
        expectedResponse: SaySoContentType,
        agent: NetworkAgent,
        responseType: U.Type
    ) async throws -> U {
        _ = (payload, contentType, expectedResponse, agent, responseType)
        throw SaySoTransportError.xmtpSDKNotLinked
    }
}

public enum SaySoTransportError: Error, LocalizedError, Equatable {
    case xmtpSDKNotLinked

    public var errorDescription: String? {
        switch self {
        case .xmtpSDKNotLinked:
            return "XMTP Swift SDK adapter is not linked in this build."
        }
    }
}
