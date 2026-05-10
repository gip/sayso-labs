import Foundation

public struct LocalBackendHealth: Codable, Equatable, Sendable {
    public let service: String
    public let status: String
}

public enum LocalBackendSupervisorError: Error, LocalizedError, Equatable {
    case unavailableOnPlatform
    case startFailed
    case timeout

    public var errorDescription: String? {
        switch self {
        case .unavailableOnPlatform:
            return "The SaySo personal service process supervisor is unavailable on this platform."
        case .startFailed:
            return "Unable to start the SaySo personal service."
        case .timeout:
            return "Timed out waiting for the SaySo personal service to become healthy."
        }
    }
}

public struct LocalBackendSupervisor: Sendable {
    public var command: String
    public var timeout: TimeInterval
    public var session: URLSession

    public init(
        command: String = ProcessInfo.processInfo.environment["SAYSO_LOCAL_BACKEND_COMMAND"] ?? "sayso-personal-service",
        timeout: TimeInterval = 10,
        session: URLSession = .shared
    ) {
        self.command = command
        self.timeout = timeout
        self.session = session
    }

    public func ensureRunning(baseURL: URL) async throws {
        if try await isHealthy(baseURL: baseURL) { return }
        try start()
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if try await isHealthy(baseURL: baseURL) { return }
            try await Task.sleep(nanoseconds: 250_000_000)
        }
        throw LocalBackendSupervisorError.timeout
    }

    private func isHealthy(baseURL: URL) async throws -> Bool {
        guard let url = URL(string: "api/health", relativeTo: baseURL)?.absoluteURL else { return false }
        do {
            let (_, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse else { return false }
            return (200..<300).contains(http.statusCode)
        } catch {
            return false
        }
    }

    private func start() throws {
        #if os(macOS)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [command]
        process.standardOutput = nil
        process.standardError = nil
        try process.run()
        #else
        throw LocalBackendSupervisorError.unavailableOnPlatform
        #endif
    }
}
