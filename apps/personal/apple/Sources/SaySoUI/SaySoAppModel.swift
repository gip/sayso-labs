import Foundation
import SwiftUI
import SaySoCore
import SaySoRuntime

@MainActor
public final class SaySoAppModel: ObservableObject {
    @Published public var baseURLText: String
    @Published public var environment: RegistryEnvironment = .dev
    @Published public var agents: [NetworkAgentRecord] = []
    @Published public var installedApps: [InstalledSaySoAppManifest] = []
    @Published public var selectedAgent: NetworkAgentRecord?
    @Published public var statusMessage: String?
    @Published public var isLoading = false

    private let store: InstalledAppStore
    private let identityStore: KeychainIdentityStore
    private let runtimeSupervisor: RuntimeSupervisor
    private let localBackendSupervisor: LocalBackendSupervisor?

    public init(
        baseURL: URL = URL(string: "http://127.0.0.1:8787")!,
        store: InstalledAppStore? = nil,
        identityStore: KeychainIdentityStore = KeychainIdentityStore(),
        localBackendSupervisor: LocalBackendSupervisor? = LocalBackendSupervisor()
    ) {
        baseURLText = baseURL.absoluteString
        self.store = store ?? ((try? InstalledAppStore.applicationSupport()) ?? InstalledAppStore(rootURL: FileManager.default.temporaryDirectory.appendingPathComponent("SaySoNativeInstalledApps")))
        self.identityStore = identityStore
        self.localBackendSupervisor = localBackendSupervisor
        runtimeSupervisor = RuntimeSupervisor(store: self.store)
        installedApps = (try? self.store.manifests()) ?? []
    }

    public func refreshRegistry() async {
        guard let baseURL = URL(string: baseURLText) else {
            statusMessage = "Enter a valid backend URL."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            if baseURL.host == "127.0.0.1" || baseURL.host == "localhost" {
                try await localBackendSupervisor?.ensureRunning(baseURL: baseURL)
            }
            let client = RegistryClient(baseURL: baseURL)
            let response = try await client.agents(environment: environment, skillIds: "sayso.runtime")
            agents = response.results
            selectedAgent = selectedAgent.flatMap { selected in agents.first { $0.id == selected.id } } ?? agents.first
            statusMessage = "Loaded \(agents.count) agents."
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    public func installSelectedAgent() async {
        guard let record = selectedAgent else { return }
        switch SaySoAppInstallabilityChecker.evaluate(record) {
        case .unavailable(let reason):
            statusMessage = reason
        case .installable(let descriptor):
            await install(record: record, descriptor: descriptor)
        }
    }

    public func start(_ manifest: InstalledSaySoAppManifest) {
        do {
            _ = try runtimeSupervisor.start(manifest)
            reloadInstalled()
            statusMessage = "\(manifest.displayName) is running."
        } catch {
            reloadInstalled()
            statusMessage = error.localizedDescription
        }
    }

    public func stop(_ manifest: InstalledSaySoAppManifest) {
        do {
            try runtimeSupervisor.stop(manifest)
            reloadInstalled()
            statusMessage = "\(manifest.displayName) stopped."
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    public func installability(for record: NetworkAgentRecord) -> SaySoAppInstallability {
        SaySoAppInstallabilityChecker.evaluate(record)
    }

    private func install(record: NetworkAgentRecord, descriptor: RuntimeApplicationDescriptor) async {
        do {
            let identity = try identityStore.loadOrCreate()
            let transport = SaySoSourceMessagingTransport(client: XMTPClientPlaceholder(identity: identity))
            let installer = SourceInstaller(transport: transport)
            let snapshot = try await installer.installSource(for: record, descriptor: descriptor)
            _ = try store.install(record: record, descriptor: descriptor, snapshot: snapshot)
            reloadInstalled()
            statusMessage = "\(record.agent.displayName) installed."
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func reloadInstalled() {
        installedApps = (try? store.manifests()) ?? []
    }
}
