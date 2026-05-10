import Foundation
import SaySoCore

enum RuntimeMetadataExtractor {
    private struct RegisteredApplication: Decodable {
        struct Runtime: Decodable {
            let skillId: String?
            let abiVersion: String?
        }

        let appId: String
        let runtime: Runtime?
        let source: RuntimeSource?
    }

    static func application(fromRegisteredJSON json: String) throws -> RuntimeApplicationMetadata {
        do {
            let application = try JSONDecoder().decode(RegisteredApplication.self, from: Data(json.utf8))
            return RuntimeApplicationMetadata(
                appId: application.appId,
                runtimeSkillId: application.runtime?.skillId ?? "sayso.runtime",
                abiVersion: application.runtime?.abiVersion ?? "0.1.0",
                source: application.source
            )
        } catch {
            throw SaySoRuntimeError.loadFailed("Registered runtime application metadata was not valid JSON.")
        }
    }

    static func application(from source: String) throws -> RuntimeApplicationMetadata {
        guard source.contains("sayso.registerApplication") else {
            throw SaySoRuntimeError.loadFailed("Runtime source did not call sayso.registerApplication.")
        }
        guard let appId = stringValue(named: "appId", in: source) else {
            throw SaySoRuntimeError.loadFailed("Runtime application is missing appId.")
        }
        let abiVersion = stringValue(named: "abiVersion", in: source)
        let runtimeSkillId = scopedStringValue(scope: "runtime", name: "skillId", in: source)
        let sourceSkillId = scopedStringValue(scope: "source", name: "skillId", in: source)
        let sourceFormat = scopedStringValue(scope: "source", name: "format", in: source)
        let entrypoint = scopedStringValue(scope: "source", name: "entrypoint", in: source)
        let include = scopedStringArray(scope: "source", name: "include", in: source)
        let sourceMetadata = entrypoint.map {
            RuntimeSource(
                skillId: sourceSkillId ?? "sayso.source",
                format: sourceFormat ?? "files",
                entrypoint: $0,
                include: include,
                exclude: nil
            )
        }
        return RuntimeApplicationMetadata(
            appId: appId,
            runtimeSkillId: runtimeSkillId ?? "sayso.runtime",
            abiVersion: abiVersion ?? "0.1.0",
            source: sourceMetadata
        )
    }

    private static func scopedStringValue(scope: String, name: String, in source: String) -> String? {
        guard let scopeRange = source.range(of: "\(scope):") else { return nil }
        return stringValue(named: name, in: String(source[scopeRange.upperBound...]))
    }

    private static func scopedStringArray(scope: String, name: String, in source: String) -> [String]? {
        guard let scopeRange = source.range(of: "\(scope):") else { return nil }
        let tail = String(source[scopeRange.upperBound...])
        guard let nameRange = tail.range(of: "\(name):") else { return nil }
        let afterName = String(tail[nameRange.upperBound...])
        guard
            let start = afterName.firstIndex(of: "["),
            let end = afterName[start...].firstIndex(of: "]")
        else {
            return nil
        }
        return afterName[afterName.index(after: start)..<end]
            .split(separator: ",")
            .compactMap { raw in
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                guard trimmed.count >= 2 else { return nil }
                return trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            }
    }

    private static func stringValue(named name: String, in source: String) -> String? {
        guard let nameRange = source.range(of: "\(name):") else { return nil }
        var remainder = source[nameRange.upperBound...].drop { $0.isWhitespace || $0 == "\n" }
        guard let quote = remainder.first, quote == "\"" || quote == "'" else { return nil }
        remainder.removeFirst()
        guard let end = remainder.firstIndex(of: quote) else { return nil }
        return String(remainder[..<end])
    }
}
