import Foundation
import XCTest
@testable import SaySoCore
@testable import SaySoRuntime

final class SaySoNativeTests: XCTestCase {
    func testRegistryRecordDecodingAndInstallability() throws {
        let record = try sampleRecord()
        XCTAssertEqual(record.agent.displayName, "SaySo Demo Pong")
        let installability = SaySoAppInstallabilityChecker.evaluate(record)
        guard case .installable(let descriptor) = installability else {
            XCTFail("Expected installable record, got \(installability.message)")
            return
        }
        XCTAssertEqual(descriptor.appId, "sayso.demo.pong")
        XCTAssertEqual(descriptor.source?.entrypoint, "apps/cli/src/pong/runtime-app.js")
    }

    func testInstallabilityRejectsSummaryOnlyRecords() throws {
        var json = sampleRecordJSON
        json = json.replacingOccurrences(of: #""skillDisclosure": "include-skill-packet""#, with: #""skillDisclosure": "summary-only""#)
        let record = try JSONDecoder().decode(NetworkAgentRecord.self, from: Data(json.utf8))
        XCTAssertFalse(SaySoAppInstallabilityChecker.evaluate(record).isInstallable)
    }

    func testSourceInstallerVerifiesChunksAndPersistsFiles() async throws {
        let record = try sampleRecord()
        guard case .installable(let descriptor) = SaySoAppInstallabilityChecker.evaluate(record) else {
            XCTFail("Expected installable record")
            return
        }
        let sourcePath = descriptor.source!.entrypoint
        let source = """
        sayso.registerApplication({
          appId: "sayso.demo.pong",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" },
          source: { skillId: "sayso.source", format: "files", entrypoint: "\(sourcePath)" }
        });
        """
        let sourceData = Data(source.utf8)
        let bytecodePath = "\(sourcePath).qjsc"
        let bytecodeData = Data([0xde, 0xad, 0xbe, 0xef])
        let artifact = quickJSRuntimeArtifact(sourcePath: sourcePath, bytecodePath: bytecodePath)
        let transport = FakeSourceTransport(
            path: sourcePath,
            data: sourceData,
            extraFiles: [bytecodePath: bytecodeData],
            runtimeArtifacts: [artifact]
        )
        let snapshot = try await SourceInstaller(transport: transport, requestId: { "request" }).installSource(for: record, descriptor: descriptor)
        XCTAssertEqual(snapshot.source(at: sourcePath), source)
        XCTAssertEqual(snapshot.runtimeArtifacts, [artifact])

        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = InstalledAppStore(rootURL: root)
        let manifest = try store.install(record: record, descriptor: descriptor, snapshot: snapshot)
        XCTAssertEqual(try store.entrypointSource(for: manifest), source)
        XCTAssertEqual(try store.bytecodeArtifacts(for: manifest).first?.data, bytecodeData)
        XCTAssertEqual(try store.manifests().first?.appId, "sayso.demo.pong")
    }

    func testSourceInstallerRejectsHashMismatch() async throws {
        let record = try sampleRecord()
        guard case .installable(let descriptor) = SaySoAppInstallabilityChecker.evaluate(record) else {
            XCTFail("Expected installable record")
            return
        }
        let transport = FakeSourceTransport(path: descriptor.source!.entrypoint, data: Data("ok".utf8), corruptChunkHash: true)
        await XCTAssertThrowsErrorAsync(
            try await SourceInstaller(transport: transport, requestId: { "request" }).installSource(for: record, descriptor: descriptor)
        )
    }

    func testSourceInstallerRejectsRuntimeArtifactMissingFile() async throws {
        let record = try sampleRecord()
        guard case .installable(let descriptor) = SaySoAppInstallabilityChecker.evaluate(record) else {
            XCTFail("Expected installable record")
            return
        }
        let artifact = quickJSRuntimeArtifact(
            sourcePath: descriptor.source!.entrypoint,
            bytecodePath: "\(descriptor.source!.entrypoint).qjsc"
        )
        let transport = FakeSourceTransport(
            path: descriptor.source!.entrypoint,
            data: Data("ok".utf8),
            runtimeArtifacts: [artifact]
        )
        await XCTAssertThrowsErrorAsync(
            try await SourceInstaller(transport: transport, requestId: { "request" }).installSource(for: record, descriptor: descriptor)
        )
    }

    func testQuickJSRuntimeLifecycle() throws {
        let runtime = QuickJSRuntimeInstance()
        let source = """
        sayso.registerApplication({
          appId: "sayso.demo.pong",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" },
          source: {
            skillId: "sayso.source",
            format: "files",
            entrypoint: "apps/cli/src/pong/runtime-app.js",
            include: ["apps/cli/src/pong/runtime-app.js"]
          },
          echo: async (input) => ({
            input,
            params: await sayso.call("params.get", {}),
            id: await sayso.call("id.generate", {}),
            now: await sayso.call("clock.nowIso", {}),
            localWrite: await sayso.call("local.text.write", { message: "hello" })
          })
        });
        """
        let metadata = try runtime.start(source: source, params: .object(["publicValue": .string("visible")]))
        XCTAssertEqual(metadata.appId, "sayso.demo.pong")
        XCTAssertEqual(metadata.source?.entrypoint, "apps/cli/src/pong/runtime-app.js")
        let output = try runtime.call("echo", input: .object(["requestId": .string("echo_1")]))
        XCTAssertEqual(output["input"]?["requestId"]?.stringValue, "echo_1")
        XCTAssertEqual(output["params"]?["publicValue"]?.stringValue, "visible")
        XCTAssertEqual(output["localWrite"]?["status"]?.stringValue, "ok")
        XCTAssertNotNil(output["id"]?.stringValue)
        XCTAssertNotNil(output["now"]?.stringValue)
        guard case .running = runtime.state else {
            XCTFail("Runtime should be running")
            return
        }
        runtime.stop()
        XCTAssertEqual(runtime.state, .stopped)
    }

    func testQuickJSRuntimeLoadsBytecode() throws {
        let runtime = QuickJSRuntimeInstance()
        let source = """
        sayso.registerApplication({
          appId: "sayso.demo.bytecode",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" },
          echo: async (input) => ({ input, params: await sayso.call("params.get", {}) })
        });
        """
        let artifact = quickJSRuntimeArtifact(sourcePath: "runtime-app.js", bytecodePath: "runtime-app.qjsc")
        let bytecode = try QuickJSRuntimeInstance.compileBytecode(source: source)
        let metadata = try runtime.start(
            bytecode: bytecode,
            artifact: artifact,
            sourceFallback: source,
            params: .object(["publicValue": .string("visible")])
        )
        XCTAssertEqual(metadata.appId, "sayso.demo.bytecode")
        let output = try runtime.call("echo", input: .object(["requestId": .string("bytecode_1")]))
        XCTAssertEqual(output["input"]?["requestId"]?.stringValue, "bytecode_1")
        XCTAssertEqual(output["params"]?["publicValue"]?.stringValue, "visible")
    }

    func testQuickJSRuntimeFallsBackWhenBytecodeMetadataMismatches() throws {
        let runtime = QuickJSRuntimeInstance()
        let bytecodeSource = """
        sayso.registerApplication({
          appId: "sayso.demo.bytecode",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" }
        });
        """
        let fallbackSource = """
        sayso.registerApplication({
          appId: "sayso.demo.source",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" }
        });
        """
        let artifact = quickJSRuntimeArtifact(
            sourcePath: "runtime-app.js",
            bytecodePath: "runtime-app.qjsc",
            engineVersion: "0.0.0"
        )
        let bytecode = try QuickJSRuntimeInstance.compileBytecode(source: bytecodeSource)
        let metadata = try runtime.start(bytecode: bytecode, artifact: artifact, sourceFallback: fallbackSource)
        XCTAssertEqual(metadata.appId, "sayso.demo.source")
    }

    func testQuickJSRuntimeRejectsBadBytecode() throws {
        let runtime = QuickJSRuntimeInstance()
        let source = """
        sayso.registerApplication({
          appId: "sayso.demo.source",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" }
        });
        """
        let artifact = quickJSRuntimeArtifact(sourcePath: "runtime-app.js", bytecodePath: "runtime-app.qjsc")
        XCTAssertThrowsError(
            try runtime.start(bytecode: Data("not quickjs bytecode".utf8), artifact: artifact, sourceFallback: source)
        )
    }

    func testQuickJSRuntimeRejectsMissingRegistration() {
        let runtime = QuickJSRuntimeInstance()
        XCTAssertThrowsError(try runtime.start(source: "const app = {};"))
        guard case .crashed = runtime.state else {
            XCTFail("Runtime should record crash state")
            return
        }
    }

    func testSupervisorPersistsLifecycleState() throws {
        let record = try sampleRecord()
        guard case .installable(let descriptor) = SaySoAppInstallabilityChecker.evaluate(record) else {
            XCTFail("Expected installable record")
            return
        }
        let sourcePath = descriptor.source!.entrypoint
        let source = """
        sayso.registerApplication({
          appId: "sayso.demo.pong",
          runtime: { skillId: "sayso.runtime", abiVersion: "0.1.0" },
          source: { skillId: "sayso.source", format: "files", entrypoint: "\(sourcePath)" }
        });
        """
        let snapshot = VerifiedSourceSnapshot(
            snapshotId: "snapshot",
            files: [sourcePath: Data(source.utf8)],
            entries: [
                SourceFileEntry(path: sourcePath, kind: "file", sizeBytes: Data(source.utf8).count, sha256: sha256Hex(Data(source.utf8)), chunks: 1, mediaType: "text/javascript", executable: nil),
            ],
            runtimeArtifacts: []
        )
        let store = InstalledAppStore(rootURL: FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString))
        let manifest = try store.install(record: record, descriptor: descriptor, snapshot: snapshot)
        let supervisor = RuntimeSupervisor(store: store)
        _ = try supervisor.start(manifest)
        XCTAssertEqual(try store.manifest(id: manifest.id).state, .running)
        try supervisor.stop(try store.manifest(id: manifest.id))
        XCTAssertEqual(try store.manifest(id: manifest.id).state, .stopped)
    }

    private func sampleRecord() throws -> NetworkAgentRecord {
        try JSONDecoder().decode(NetworkAgentRecord.self, from: Data(sampleRecordJSON.utf8))
    }
}

private struct FakeSourceTransport: SaySoSourceTransport {
    let files: [String: Data]
    var corruptChunkHash = false
    var runtimeArtifacts: [SourceRuntimeArtifact]?

    init(
        path: String,
        data: Data,
        corruptChunkHash: Bool = false,
        extraFiles: [String: Data] = [:],
        runtimeArtifacts: [SourceRuntimeArtifact]? = nil
    ) {
        var files = extraFiles
        files[path] = data
        self.files = files
        self.corruptChunkHash = corruptChunkHash
        self.runtimeArtifacts = runtimeArtifacts
    }

    func requestSourceManifest(_ request: SourceManifestRequestPayload, agent: NetworkAgent) async throws -> SourceManifestResponsePayload {
        let entries = files.map { path, data in
            SourceFileEntry(
                path: path,
                kind: "file",
                sizeBytes: data.count,
                sha256: sha256Hex(data),
                chunks: 1,
                mediaType: path.hasSuffix(".qjsc") ? "application/vnd.sayso.quickjs-bytecode" : "text/javascript",
                executable: nil
            )
        }
        .sorted { $0.path < $1.path }
        return SourceManifestResponsePayload(
            requestId: request.requestId,
            status: "ok",
            snapshotId: "snapshot",
            createdAt: "2026-05-07T00:00:00.000Z",
            expiresAt: nil,
            chunkSizeBytes: files.values.map(\.count).max() ?? 1,
            files: entries,
            runtimeArtifacts: runtimeArtifacts,
            error: nil
        )
    }

    func requestSourceChunk(_ request: SourceChunkRequestPayload, agent: NetworkAgent) async throws -> SourceChunkResponsePayload {
        guard let path = request.target.path, let data = files[path] else {
            return SourceChunkResponsePayload(
                requestId: request.requestId,
                status: "error",
                snapshotId: request.snapshotId,
                target: request.target,
                chunkIndex: request.chunkIndex,
                chunkCount: 1,
                sha256: nil,
                bytesBase64: nil,
                error: SourceError(code: "not-found", message: "Unknown source file.")
            )
        }
        return SourceChunkResponsePayload(
            requestId: request.requestId,
            status: "ok",
            snapshotId: request.snapshotId,
            target: request.target,
            chunkIndex: request.chunkIndex,
            chunkCount: 1,
            sha256: corruptChunkHash ? String(repeating: "0", count: 64) : sha256Hex(data),
            bytesBase64: data.base64EncodedString(),
            error: nil
        )
    }
}

private func quickJSRuntimeArtifact(
    sourcePath: String,
    bytecodePath: String,
    engineVersion: String = QuickJSRuntimeInstance.quickJSVersion,
    formatVersion: String = QuickJSRuntimeInstance.bytecodeFormatVersion
) -> SourceRuntimeArtifact {
    SourceRuntimeArtifact(
        artifactId: "test-quickjs-bytecode",
        kind: "runtime-bytecode",
        language: SourceRuntimeArtifactLanguage(
            id: "javascript",
            version: "ES2023",
            profile: "sayso-runtime-single-script"
        ),
        sourcePath: sourcePath,
        bytecodePath: bytecodePath,
        bytecode: SourceRuntimeBytecode(
            engine: "quickjs",
            engineVersion: engineVersion,
            format: "quickjs-binary-json-bytecode",
            formatVersion: formatVersion,
            evalType: "global",
            mediaType: "application/vnd.sayso.quickjs-bytecode"
        )
    )
}

private func XCTAssertThrowsErrorAsync(
    _ expression: @autoclosure () async throws -> Any,
    file: StaticString = #filePath,
    line: UInt = #line
) async {
    do {
        _ = try await expression()
        XCTFail("Expected error", file: file, line: line)
    } catch {}
}

private let sampleRecordJSON = """
{
  "registrationId": "reg_1",
  "walletAddress": "0x0000000000000000000000000000000000000001",
  "agent": {
    "agentId": "sayso-demo-pong",
    "syncInboxId": "inbox_demo",
    "displayName": "SaySo Demo Pong",
    "protocolVersion": "0.1.0"
  },
  "visibility": "public",
  "listingTier": "standard",
  "description": "Demo runtime SaySo app.",
  "skillDisclosure": "include-skill-packet",
  "claimTypes": [],
  "connectionCount": 0,
  "updatedAt": "2026-05-07T00:00:00.000Z",
  "skillPacket": {
    "agent": {
      "agentId": "sayso-demo-pong",
      "syncInboxId": "inbox_demo",
      "displayName": "SaySo Demo Pong",
      "kind": "service",
      "protocolVersion": "0.1.0"
    },
    "skill": {
      "capabilities": [],
      "contentTypes": [],
      "channels": [],
      "paymentPolicies": [],
      "runtime": {
        "abiVersion": "0.1.0",
        "applications": [
          {
            "appId": "sayso.demo.pong",
            "callbacks": ["handleMessage"],
            "hostOperations": ["params.get", "clock.nowIso"],
            "source": {
              "skillId": "sayso.source",
              "format": "files",
              "entrypoint": "apps/cli/src/pong/runtime-app.js",
              "include": ["apps/cli/src/pong/runtime-app.js"]
            }
          }
        ]
      }
    },
    "skills": [
      {
        "skillId": "sayso.runtime",
        "name": "SaySo Runtime",
        "version": "0.1.0",
        "kind": "extension",
        "imports": [],
        "skill": {
          "capabilities": [],
          "contentTypes": [],
          "channels": [],
          "paymentPolicies": []
        },
        "content": "# SaySo Runtime",
        "mediaType": "text/markdown"
      },
      {
        "skillId": "sayso.source",
        "name": "SaySo Source",
        "version": "0.1.0",
        "kind": "extension",
        "imports": [],
        "skill": {
          "capabilities": [],
          "contentTypes": [],
          "channels": [],
          "paymentPolicies": []
        },
        "content": "# SaySo Source",
        "mediaType": "text/markdown"
      }
    ],
    "resolution": {
      "mode": "all",
      "includedSkillIds": ["sayso.runtime", "sayso.source"],
      "dependencyOrder": ["sayso.runtime", "sayso.source"]
    },
    "content": "# Pong",
    "mediaType": "text/markdown"
  }
}
"""
