import Foundation

public struct RuntimeSource: Codable, Equatable, Sendable {
    public let skillId: String
    public let format: String
    public let entrypoint: String
    public let include: [String]?
    public let exclude: [String]?

    public init(skillId: String, format: String, entrypoint: String, include: [String]? = nil, exclude: [String]? = nil) {
        self.skillId = skillId
        self.format = format
        self.entrypoint = entrypoint
        self.include = include
        self.exclude = exclude
    }
}

public struct RuntimeApplicationDescriptor: Codable, Equatable, Sendable {
    public let appId: String
    public let callbacks: [String]?
    public let hostOperations: [String]?
    public let localOperations: [String]?
    public let source: RuntimeSource?
}

public enum SaySoAppInstallability: Equatable, Sendable {
    case installable(RuntimeApplicationDescriptor)
    case unavailable(String)

    public var isInstallable: Bool {
        if case .installable = self { return true }
        return false
    }

    public var message: String {
        switch self {
        case .installable(let descriptor):
            return "Installable: \(descriptor.appId)"
        case .unavailable(let reason):
            return reason
        }
    }
}

public enum SaySoAppInstallabilityChecker {
    public static func evaluate(_ record: NetworkAgentRecord) -> SaySoAppInstallability {
        guard record.skillDisclosure == .includeSkillPacket, let packet = record.skillPacket else {
            return .unavailable("This registration does not disclose a skill packet.")
        }
        let skillIds = Set(packet.skills.map(\.skillId))
        guard skillIds.contains("sayso.runtime") else {
            return .unavailable("This agent does not advertise sayso.runtime.")
        }
        guard skillIds.contains("sayso.source") else {
            return .unavailable("This agent does not advertise sayso.source.")
        }
        guard let descriptor = firstRuntimeApplication(in: packet) else {
            return .unavailable("No runtime application metadata was found.")
        }
        guard let source = descriptor.source else {
            return .unavailable("Runtime application is missing source metadata.")
        }
        guard source.skillId == "sayso.source" else {
            return .unavailable("Runtime source must use sayso.source.")
        }
        guard source.format == "files" else {
            return .unavailable("Only sayso.source files snapshots are installable.")
        }
        guard isSafeRelativePath(source.entrypoint) else {
            return .unavailable("Runtime source entrypoint is not a safe relative path.")
        }
        if let include = source.include, include.contains(where: { !isSafeRelativePath($0) }) {
            return .unavailable("Runtime source include filters contain an unsafe path.")
        }
        if let exclude = source.exclude, exclude.contains(where: { !isSafeRelativePath($0) }) {
            return .unavailable("Runtime source exclude filters contain an unsafe path.")
        }
        return .installable(descriptor)
    }

    public static func isSafeRelativePath(_ value: String) -> Bool {
        guard !value.isEmpty, !value.hasPrefix("/"), !value.contains("//") else { return false }
        return !value.split(separator: "/", omittingEmptySubsequences: false).contains { $0 == ".." }
    }

    private static func firstRuntimeApplication(in packet: SkillPacket) -> RuntimeApplicationDescriptor? {
        guard
            let runtime = packet.skill.extensions["runtime"]?.objectValue,
            let applications = runtime["applications"]?.arrayValue
        else {
            return nil
        }
        for application in applications {
            guard let object = application.objectValue else { continue }
            guard let appId = object["appId"]?.stringValue else { continue }
            return RuntimeApplicationDescriptor(
                appId: appId,
                callbacks: object["callbacks"]?.arrayValue?.compactMap(\.stringValue),
                hostOperations: object["hostOperations"]?.arrayValue?.compactMap(\.stringValue),
                localOperations: object["localOperations"]?.arrayValue?.compactMap(\.stringValue),
                source: parseSource(object["source"])
            )
        }
        return nil
    }

    private static func parseSource(_ value: JSONValue?) -> RuntimeSource? {
        guard
            let object = value?.objectValue,
            let skillId = object["skillId"]?.stringValue,
            let format = object["format"]?.stringValue,
            let entrypoint = object["entrypoint"]?.stringValue
        else {
            return nil
        }
        return RuntimeSource(
            skillId: skillId,
            format: format,
            entrypoint: entrypoint,
            include: object["include"]?.arrayValue?.compactMap(\.stringValue),
            exclude: object["exclude"]?.arrayValue?.compactMap(\.stringValue)
        )
    }
}
