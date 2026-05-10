import CryptoKit
import Foundation
import Security

public struct SaySoIdentity: Codable, Equatable, Sendable {
    public let id: String
    public let privateKeyHex: String
    public let ethereumAddress: String
}

public enum IdentityStoreError: Error, LocalizedError {
    case keychain(OSStatus)
    case randomBytes
    case decode

    public var errorDescription: String? {
        switch self {
        case .keychain(let status):
            return "Keychain operation failed with status \(status)."
        case .randomBytes:
            return "Unable to generate identity key material."
        case .decode:
            return "Stored identity could not be decoded."
        }
    }
}

public struct KeychainIdentityStore: Sendable {
    public let service: String
    public let account: String

    public init(service: String = "dev.sayso.native.identity", account: String = "default") {
        self.service = service
        self.account = account
    }

    public func loadOrCreate() throws -> SaySoIdentity {
        if let existing = try load() {
            return existing
        }
        let identity = try createIdentity()
        try save(identity)
        return identity
    }

    public func load() throws -> SaySoIdentity? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw IdentityStoreError.keychain(status) }
        guard let data = item as? Data else { throw IdentityStoreError.decode }
        return try JSONDecoder().decode(SaySoIdentity.self, from: data)
    }

    public func save(_ identity: SaySoIdentity) throws {
        let data = try JSONEncoder().encode(identity)
        var query = baseQuery()
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw IdentityStoreError.keychain(status) }
    }

    private func createIdentity() throws -> SaySoIdentity {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw IdentityStoreError.randomBytes
        }
        let privateKey = bytes.hexString
        let digest = SHA256.hash(data: Data(bytes))
        let address = "0x" + digest.suffix(20).map { String(format: "%02x", $0) }.joined()
        return SaySoIdentity(id: UUID().uuidString, privateKeyHex: privateKey, ethereumAddress: address)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}

private extension Array where Element == UInt8 {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
