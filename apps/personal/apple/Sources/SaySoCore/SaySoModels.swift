import Foundation

public enum RegistryEnvironment: String, Codable, CaseIterable, Sendable {
    case dev
    case production
}

public struct RegistryEnvironmentResponse: Codable, Equatable, Sendable {
    public let defaultEnvironment: RegistryEnvironment
    public let environments: [RegistryEnvironment]
}

public struct RegistryStats: Codable, Equatable, Sendable {
    public let total: Int
    public let `public`: Int
    public let `private`: Int
    public let disclosedSkillPacket: Int
    public let premium: Int
}

public struct AgentListResponse: Codable, Equatable, Sendable {
    public let results: [NetworkAgentRecord]
    public let nextCursor: String?
}

public struct NetworkAgentRecord: Codable, Equatable, Identifiable, Sendable {
    public let registrationId: String
    public let walletAddress: String
    public let agent: NetworkAgent
    public let visibility: Visibility
    public let listingTier: ListingTier
    public let description: String
    public let skillDisclosure: SkillDisclosure
    public let claimTypes: [String]?
    public let connectionCount: Int
    public let skillPacket: SkillPacket?
    public let skillStatuses: [RegisteredSkillStatus]?
    public let updatedAt: String
    public let expiresAt: String?
    public let premiumExpiresAt: String?

    public var id: String { agent.agentId }
}

public extension NetworkAgentRecord {
    enum Visibility: String, Codable, Sendable {
        case `public`
        case `private`
    }

    enum ListingTier: String, Codable, Sendable {
        case standard
        case premium
    }

    enum SkillDisclosure: String, Codable, Sendable {
        case summaryOnly = "summary-only"
        case includeSkillPacket = "include-skill-packet"
    }
}

public struct NetworkAgent: Codable, Equatable, Sendable {
    public let agentId: String
    public let syncInboxId: String
    public let displayName: String
    public let protocolVersion: String
}

public struct RegisteredSkillStatus: Codable, Equatable, Sendable {
    public let name: String
    public let skillId: String
    public let version: String
    public let displayName: String
    public let sha256: String
    public let status: String
    public let referenceSha256: String?
}

public struct SkillPacket: Codable, Equatable, Sendable {
    public let agent: SkillPacketAgent
    public let skill: AgentSkillContract
    public let skills: [SaySoSkillDocument]
    public let resolution: SkillResolution
    public let content: String
    public let mediaType: String
}

public struct SkillPacketAgent: Codable, Equatable, Sendable {
    public let agentId: String
    public let syncInboxId: String
    public let displayName: String
    public let kind: String
    public let protocolVersion: String
}

public struct SaySoSkillDocument: Codable, Equatable, Identifiable, Sendable {
    public let skillId: String
    public let name: String
    public let version: String
    public let kind: String
    public let imports: [SkillImport]
    public let skill: AgentSkillContract
    public let content: String
    public let mediaType: String

    public var id: String { skillId }
}

public struct SkillImport: Codable, Equatable, Sendable {
    public let skillId: String
    public let version: String
    public let required: Bool?
}

public struct SkillResolution: Codable, Equatable, Sendable {
    public let mode: String
    public let requestedSkillIds: [String]?
    public let includedSkillIds: [String]
    public let dependencyOrder: [String]
}

public struct AgentSkillContract: Codable, Equatable, Sendable {
    public let capabilities: [AgentCapability]
    public let contentTypes: [AgentContentType]
    public let channels: [AgentChannel]
    public let paymentPolicies: [AgentPaymentPolicy]
    public let extensions: [String: JSONValue]

    public init(
        capabilities: [AgentCapability],
        contentTypes: [AgentContentType],
        channels: [AgentChannel],
        paymentPolicies: [AgentPaymentPolicy],
        extensions: [String: JSONValue] = [:]
    ) {
        self.capabilities = capabilities
        self.contentTypes = contentTypes
        self.channels = channels
        self.paymentPolicies = paymentPolicies
        self.extensions = extensions
    }

    private enum CodingKeys: String, CodingKey {
        case capabilities
        case contentTypes
        case channels
        case paymentPolicies
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        capabilities = try container.decode([AgentCapability].self, forKey: .capabilities)
        contentTypes = try container.decode([AgentContentType].self, forKey: .contentTypes)
        channels = try container.decode([AgentChannel].self, forKey: .channels)
        paymentPolicies = try container.decode([AgentPaymentPolicy].self, forKey: .paymentPolicies)
        let all = try decoder.container(keyedBy: DynamicCodingKey.self)
        var extra: [String: JSONValue] = [:]
        for key in all.allKeys where CodingKeys(stringValue: key.stringValue) == nil {
            extra[key.stringValue] = try all.decode(JSONValue.self, forKey: key)
        }
        extensions = extra
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(capabilities, forKey: .capabilities)
        try container.encode(contentTypes, forKey: .contentTypes)
        try container.encode(channels, forKey: .channels)
        try container.encode(paymentPolicies, forKey: .paymentPolicies)
        var extra = encoder.container(keyedBy: DynamicCodingKey.self)
        for (key, value) in extensions {
            try extra.encode(value, forKey: DynamicCodingKey(stringValue: key))
        }
    }
}

public struct AgentCapability: Codable, Equatable, Sendable {
    public let capabilityId: String
    public let title: String
    public let description: String
    public let requestContentTypes: [String]
    public let responseContentTypes: [String]
    public let channels: [String]
    public let paymentPolicy: String
    public let inputSchema: JSONValue?
    public let outputSchema: JSONValue?
    public let extensions: [String: JSONValue]

    private enum CodingKeys: String, CodingKey {
        case capabilityId
        case title
        case description
        case requestContentTypes
        case responseContentTypes
        case channels
        case paymentPolicy
        case inputSchema
        case outputSchema
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        capabilityId = try container.decode(String.self, forKey: .capabilityId)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        requestContentTypes = try container.decode([String].self, forKey: .requestContentTypes)
        responseContentTypes = try container.decode([String].self, forKey: .responseContentTypes)
        channels = try container.decode([String].self, forKey: .channels)
        paymentPolicy = try container.decode(String.self, forKey: .paymentPolicy)
        inputSchema = try container.decodeIfPresent(JSONValue.self, forKey: .inputSchema)
        outputSchema = try container.decodeIfPresent(JSONValue.self, forKey: .outputSchema)
        let all = try decoder.container(keyedBy: DynamicCodingKey.self)
        var extra: [String: JSONValue] = [:]
        for key in all.allKeys where CodingKeys(stringValue: key.stringValue) == nil {
            extra[key.stringValue] = try all.decode(JSONValue.self, forKey: key)
        }
        extensions = extra
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(capabilityId, forKey: .capabilityId)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(requestContentTypes, forKey: .requestContentTypes)
        try container.encode(responseContentTypes, forKey: .responseContentTypes)
        try container.encode(channels, forKey: .channels)
        try container.encode(paymentPolicy, forKey: .paymentPolicy)
        try container.encodeIfPresent(inputSchema, forKey: .inputSchema)
        try container.encodeIfPresent(outputSchema, forKey: .outputSchema)
        var extra = encoder.container(keyedBy: DynamicCodingKey.self)
        for (key, value) in extensions {
            try extra.encode(value, forKey: DynamicCodingKey(stringValue: key))
        }
    }
}

public struct AgentContentType: Codable, Equatable, Sendable {
    public let authorityId: String
    public let typeId: String
    public let versionMajor: Int
    public let versionMinor: Int?
    public let purpose: String
    public let channel: String?
}

public struct AgentChannel: Codable, Equatable, Sendable {
    public let channelId: String
    public let kind: String
    public let description: String
    public let inboxId: String?
    public let conversationId: String?
    public let contentTypes: [String]?
}

public struct AgentPaymentPolicy: Codable, Equatable, Sendable {
    public let policyId: String
    public let capabilityIds: [String]
    public let required: Bool
    public let terms: [String: JSONValue]
}

struct DynamicCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init(stringValue: String) {
        self.stringValue = stringValue
        intValue = nil
    }

    init(intValue: Int) {
        stringValue = String(intValue)
        self.intValue = intValue
    }
}
