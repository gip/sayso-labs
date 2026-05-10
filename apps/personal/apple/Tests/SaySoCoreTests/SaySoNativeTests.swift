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
        let transport = FakeSourceTransport(path: sourcePath, data: sourceData)
        let snapshot = try await SourceInstaller(transport: transport, requestId: { "request" }).installSource(for: record, descriptor: descriptor)
        XCTAssertEqual(snapshot.source(at: sourcePath), source)

        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = InstalledAppStore(rootURL: root)
        let manifest = try store.install(record: record, descriptor: descriptor, snapshot: snapshot)
        XCTAssertEqual(try store.entrypointSource(for: manifest), source)
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
            ]
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
    let path: String
    let data: Data
    var corruptChunkHash = false

    func requestSourceManifest(_ request: SourceManifestRequestPayload, agent: NetworkAgent) async throws -> SourceManifestResponsePayload {
        SourceManifestResponsePayload(
            requestId: request.requestId,
            status: "ok",
            snapshotId: "snapshot",
            createdAt: "2026-05-07T00:00:00.000Z",
            expiresAt: nil,
            chunkSizeBytes: data.count,
            files: [
                SourceFileEntry(path: path, kind: "file", sizeBytes: data.count, sha256: sha256Hex(data), chunks: 1, mediaType: "text/javascript", executable: nil),
            ],
            error: nil
        )
    }

    func requestSourceChunk(_ request: SourceChunkRequestPayload, agent: NetworkAgent) async throws -> SourceChunkResponsePayload {
        SourceChunkResponsePayload(
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
