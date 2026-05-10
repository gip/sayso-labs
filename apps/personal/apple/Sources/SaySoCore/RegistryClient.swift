import Foundation

public enum RegistryClientError: Error, LocalizedError, Equatable {
    case invalidResponse
    case httpStatus(Int)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Registry returned an invalid response."
        case .httpStatus(let status):
            return "Registry request failed with HTTP \(status)."
        }
    }
}

public struct RegistryClient: Sendable {
    public var baseURL: URL
    public var session: URLSession
    public var decoder: JSONDecoder

    public init(baseURL: URL, session: URLSession = .shared, decoder: JSONDecoder = JSONDecoder()) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = decoder
    }

    public func environments() async throws -> RegistryEnvironmentResponse {
        try await get("/api/environments")
    }

    public func stats(environment: RegistryEnvironment) async throws -> RegistryStats {
        try await get("/api/stats", query: ["env": environment.rawValue])
    }

    public func agents(
        environment: RegistryEnvironment,
        query: String? = nil,
        skillIds: String? = nil,
        cursor: String? = nil,
        limit: Int = 25
    ) async throws -> AgentListResponse {
        var parameters = [
            "env": environment.rawValue,
            "limit": String(limit),
        ]
        if let query, !query.isEmpty { parameters["query"] = query }
        if let skillIds, !skillIds.isEmpty { parameters["skillIds"] = skillIds }
        if let cursor, !cursor.isEmpty { parameters["cursor"] = cursor }
        return try await get("/api/agents", query: parameters)
    }

    public func agent(environment: RegistryEnvironment, agentId: String) async throws -> NetworkAgentRecord {
        try await get("/api/agents/\(agentId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? agentId)", query: [
            "env": environment.rawValue,
        ])
    }

    private func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T {
        let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let endpoint = URL(string: relativePath, relativeTo: baseURL)?.absoluteURL else {
            throw RegistryClientError.invalidResponse
        }
        var components = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)
        if !query.isEmpty {
            components?.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components?.url else { throw RegistryClientError.invalidResponse }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse else { throw RegistryClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw RegistryClientError.httpStatus(http.statusCode) }
        return try decoder.decode(T.self, from: data)
    }
}
