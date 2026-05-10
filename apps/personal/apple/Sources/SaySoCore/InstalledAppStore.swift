import Foundation

public enum InstalledSaySoAppState: String, Codable, Equatable, Sendable {
    case stopped
    case running
    case crashed
}

public struct InstalledSaySoAppManifest: Codable, Equatable, Identifiable, Sendable {
    public let id: String
    public let appId: String
    public let displayName: String
    public let agentId: String
    public let entrypoint: String
    public let installedAt: Date
    public var state: InstalledSaySoAppState
    public var lastError: String?
    public let files: [SourceFileEntry]
}

public enum InstalledAppStoreError: Error, LocalizedError, Equatable {
    case unsafePath(String)
    case missingManifest

    public var errorDescription: String? {
        switch self {
        case .unsafePath(let path):
            return "Refusing to store unsafe source path: \(path)."
        case .missingManifest:
            return "Installed SaySo app manifest is missing."
        }
    }
}

public struct InstalledAppStore: Sendable {
    public let rootURL: URL
    public var encoder: JSONEncoder
    public var decoder: JSONDecoder

    public init(rootURL: URL, encoder: JSONEncoder = JSONEncoder(), decoder: JSONDecoder = JSONDecoder()) {
        self.rootURL = rootURL
        self.encoder = encoder
        self.decoder = decoder
        self.encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        self.encoder.dateEncodingStrategy = .iso8601
        self.decoder.dateDecodingStrategy = .iso8601
    }

    public static func applicationSupport(bundleIdentifier: String = "dev.sayso.native") throws -> InstalledAppStore {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        return InstalledAppStore(rootURL: base.appendingPathComponent(bundleIdentifier).appendingPathComponent("InstalledApps"))
    }

    public func install(record: NetworkAgentRecord, descriptor: RuntimeApplicationDescriptor, snapshot: VerifiedSourceSnapshot) throws -> InstalledSaySoAppManifest {
        guard let source = descriptor.source else {
            throw InstalledAppStoreError.missingManifest
        }
        let id = stableIdentifier(agentId: record.agent.agentId, appId: descriptor.appId)
        let appRoot = rootURL.appendingPathComponent(id, isDirectory: true)
        let sourceRoot = appRoot.appendingPathComponent("Source", isDirectory: true)
        try FileManager.default.createDirectory(at: sourceRoot, withIntermediateDirectories: true)
        for (path, data) in snapshot.files {
            guard SaySoAppInstallabilityChecker.isSafeRelativePath(path) else {
                throw InstalledAppStoreError.unsafePath(path)
            }
            let fileURL = append(relativePath: path, to: sourceRoot)
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: fileURL, options: .atomic)
        }
        let manifest = InstalledSaySoAppManifest(
            id: id,
            appId: descriptor.appId,
            displayName: record.agent.displayName,
            agentId: record.agent.agentId,
            entrypoint: source.entrypoint,
            installedAt: Date(),
            state: .stopped,
            lastError: nil,
            files: snapshot.entries
        )
        try write(manifest)
        try encoder.encode(record.skillPacket).write(to: appRoot.appendingPathComponent("skillPacket.json"), options: .atomic)
        return manifest
    }

    public func manifests() throws -> [InstalledSaySoAppManifest] {
        guard FileManager.default.fileExists(atPath: rootURL.path) else { return [] }
        let appURLs = try FileManager.default.contentsOfDirectory(at: rootURL, includingPropertiesForKeys: nil)
        return try appURLs.compactMap { appURL in
            let manifestURL = appURL.appendingPathComponent("manifest.json")
            guard FileManager.default.fileExists(atPath: manifestURL.path) else { return nil }
            return try decoder.decode(InstalledSaySoAppManifest.self, from: Data(contentsOf: manifestURL))
        }
        .sorted { $0.installedAt > $1.installedAt }
    }

    public func manifest(id: String) throws -> InstalledSaySoAppManifest {
        let url = manifestURL(for: id)
        guard FileManager.default.fileExists(atPath: url.path) else { throw InstalledAppStoreError.missingManifest }
        return try decoder.decode(InstalledSaySoAppManifest.self, from: Data(contentsOf: url))
    }

    public func write(_ manifest: InstalledSaySoAppManifest) throws {
        let appRoot = rootURL.appendingPathComponent(manifest.id, isDirectory: true)
        try FileManager.default.createDirectory(at: appRoot, withIntermediateDirectories: true)
        try encoder.encode(manifest).write(to: manifestURL(for: manifest.id), options: .atomic)
    }

    public func entrypointSource(for manifest: InstalledSaySoAppManifest) throws -> String {
        guard SaySoAppInstallabilityChecker.isSafeRelativePath(manifest.entrypoint) else {
            throw InstalledAppStoreError.unsafePath(manifest.entrypoint)
        }
        let url = append(
            relativePath: manifest.entrypoint,
            to: rootURL
                .appendingPathComponent(manifest.id, isDirectory: true)
                .appendingPathComponent("Source", isDirectory: true)
        )
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func append(relativePath: String, to root: URL) -> URL {
        relativePath.split(separator: "/").reduce(root) { url, component in
            url.appendingPathComponent(String(component))
        }
    }

    private func manifestURL(for id: String) -> URL {
        rootURL.appendingPathComponent(id, isDirectory: true).appendingPathComponent("manifest.json")
    }

    private func stableIdentifier(agentId: String, appId: String) -> String {
        "\(agentId)-\(appId)"
            .lowercased()
            .map { character in
                character.isLetter || character.isNumber ? character : "-"
            }
            .reduce(into: "") { result, character in
                if character == "-", result.last == "-" { return }
                result.append(character)
            }
    }
}
