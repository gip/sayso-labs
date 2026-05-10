import SwiftUI
import SaySoCore

public struct SaySoRootView: View {
    @StateObject private var model = SaySoAppModel()
    @State private var showIntro = true
    @State private var openIntroWall = false
    @State private var didOpenIntro = false

    public init() {}

    public var body: some View {
        ZStack {
            if !showIntro || didOpenIntro {
                mainApp
            }

            if showIntro {
                SaySoIntroWallOverlay(open: openIntroWall)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .ignoresSafeArea(.all)
                    .contentShape(Rectangle())
                    .onTapGesture(perform: openIntro)
                    .zIndex(1)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var mainApp: some View {
        TabView {
            DiscoverTab(model: model)
                .tabItem { Label("Discover", systemImage: "sparkles") }

            LibraryTab(model: model)
                .tabItem { Label("Library", systemImage: "square.stack.3d.up.fill") }
                .badge(model.installedApps.isEmpty ? 0 : model.installedApps.count)

            SettingsTab(model: model)
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
        .tint(SaySoPalette.accent)
        .task {
            if model.agents.isEmpty {
                await model.refreshRegistry()
            }
        }
    }

    private func openIntro() {
        guard !didOpenIntro else { return }
        didOpenIntro = true
        openIntroWall = true

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.7) {
            showIntro = false
        }
    }
}

// MARK: - Discover

private struct DiscoverTab: View {
    @ObservedObject var model: SaySoAppModel
    @State private var searchText: String = ""
    @State private var filter: DiscoverFilter = .all

    enum DiscoverFilter: String, CaseIterable, Identifiable {
        case all, installable, premium
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "All"
            case .installable: return "Installable"
            case .premium: return "Premium"
            }
        }
    }

    private var filteredAgents: [NetworkAgentRecord] {
        let lowered = searchText.lowercased().trimmingCharacters(in: .whitespaces)
        return model.agents.filter { record in
            let matchesSearch = lowered.isEmpty ||
                record.agent.displayName.lowercased().contains(lowered) ||
                record.agent.agentId.lowercased().contains(lowered) ||
                record.description.lowercased().contains(lowered)
            let matchesFilter: Bool
            switch filter {
            case .all: matchesFilter = true
            case .installable: matchesFilter = model.installability(for: record).isInstallable
            case .premium: matchesFilter = record.listingTier == .premium
            }
            return matchesSearch && matchesFilter
        }
    }

    private var stats: (total: Int, installable: Int, premium: Int) {
        let installable = model.agents.filter { model.installability(for: $0).isInstallable }.count
        let premium = model.agents.filter { $0.listingTier == .premium }.count
        return (model.agents.count, installable, premium)
    }

    var body: some View {
        NavigationSplitView {
            ZStack {
                background
                ScrollView {
                    VStack(spacing: 18) {
                        hero
                        statsRow
                        searchAndFilters
                        if let status = model.statusMessage {
                            StatusBanner(message: status, isError: status.lowercased().contains("error") || status.lowercased().contains("fail"))
                        }
                        agentsList
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
            .navigationTitle("Discover")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await model.refreshRegistry() }
                    } label: {
                        if model.isLoading {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(model.isLoading)
                }
            }
        } detail: {
            if let selected = model.selectedAgent {
                AgentDetailView(model: model, record: selected)
            } else {
                emptyDetail
            }
        }
    }

    private var background: some View {
        LinearGradient(
            colors: [
                SaySoPalette.accent.opacity(0.10),
                Color.clear,
                SaySoPalette.teal.opacity(0.05)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.caption.bold())
                Text("SaySo Network · \(model.environment.rawValue.uppercased())")
                    .font(.caption.weight(.semibold))
                    .tracking(0.6)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(.white)
            .background(SaySoPalette.heroGradient, in: Capsule())

            Text("Agents on the\nopen agent network")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .lineSpacing(2)
                .foregroundStyle(
                    LinearGradient(colors: [.primary, .primary.opacity(0.7)], startPoint: .top, endPoint: .bottom)
                )
            Text("Browse, inspect, and install SaySo apps from any agent advertising the runtime skill.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }

    private var statsRow: some View {
        HStack(spacing: 10) {
            StatCard(icon: "antenna.radiowaves.left.and.right", title: "Available", value: "\(stats.total)", tint: SaySoPalette.accent)
            StatCard(icon: "bolt.fill", title: "Installable", value: "\(stats.installable)", tint: SaySoPalette.teal)
            StatCard(icon: "crown.fill", title: "Premium", value: "\(stats.premium)", tint: SaySoPalette.amber)
        }
    }

    private var searchAndFilters: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("Search by name, id, or description", text: $searchText)
                    .textFieldStyle(.plain)
                    #if os(iOS)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    #endif
                if !searchText.isEmpty {
                    Button { searchText = "" } label: {
                        Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.regularMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.07), lineWidth: 1)
            )

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(DiscoverFilter.allCases) { item in
                        FilterChip(label: item.label, isOn: filter == item) {
                            filter = item
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var agentsList: some View {
        if model.isLoading && model.agents.isEmpty {
            VStack(spacing: 14) {
                ProgressView()
                Text("Reaching the registry…")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
        } else if filteredAgents.isEmpty {
            emptyAgents
        } else {
            VStack(spacing: 12) {
                ForEach(filteredAgents) { record in
                    Button {
                        model.selectedAgent = record
                    } label: {
                        AgentCard(record: record, installability: model.installability(for: record))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var emptyAgents: some View {
        SaySoCard {
            VStack(spacing: 12) {
                Image(systemName: model.agents.isEmpty ? "network.slash" : "magnifyingglass")
                    .font(.system(size: 36, weight: .light))
                    .foregroundStyle(.secondary)
                Text(model.agents.isEmpty ? "No agents reachable" : "No matches")
                    .font(.headline)
                Text(model.agents.isEmpty
                     ? "Confirm the backend URL in Settings, then refresh."
                     : "Try a different search term or filter.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 24)
        }
    }

    private var emptyDetail: some View {
        ZStack {
            background
            VStack(spacing: 12) {
                Image(systemName: "sparkles.rectangle.stack")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(SaySoPalette.accent)
                Text("Pick an agent")
                    .font(.title3.weight(.semibold))
                Text("Choose an agent on the left to view its skills, capabilities, and install options.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 360)
            }
            .padding()
        }
    }
}

// MARK: - Agent card

private struct AgentCard: View {
    let record: NetworkAgentRecord
    let installability: SaySoAppInstallability

    var body: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    AgentAvatar(name: record.agent.displayName, seed: record.agent.agentId, size: 46)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(record.agent.displayName)
                                .font(.headline)
                                .lineLimit(1)
                            if record.listingTier == .premium {
                                Image(systemName: "crown.fill")
                                    .font(.caption2)
                                    .foregroundStyle(SaySoPalette.amber)
                            }
                        }
                        Text(record.agent.agentId)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    if installability.isInstallable {
                        StatusPill(label: "Ready", tint: SaySoPalette.success)
                    } else {
                        StatusPill(label: "Locked", tint: .secondary)
                    }
                }

                if !record.description.isEmpty {
                    Text(record.description)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }

                let skills = record.skillPacket?.skills.map(\.skillId) ?? []
                if !skills.isEmpty {
                    WrapHStack(items: Array(skills.prefix(5)).enumerated().map { OrderedSkill(index: $0.offset, id: $0.element) }) { item in
                        SkillChip(skillId: item.id)
                    }
                    if skills.count > 5 {
                        Text("+\(skills.count - 5) more")
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 14) {
                    metaItem(icon: "person.2.fill", value: "\(record.connectionCount)")
                    metaItem(icon: record.visibility == .public ? "globe" : "lock.fill",
                             value: record.visibility.rawValue.capitalized)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
        }
    }

    private func metaItem(icon: String, value: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(value)
                .font(.caption.weight(.medium))
        }
        .foregroundStyle(.secondary)
    }
}

private struct OrderedSkill: Hashable {
    let index: Int
    let id: String
}

// MARK: - Agent detail

private struct AgentDetailView: View {
    @ObservedObject var model: SaySoAppModel
    let record: NetworkAgentRecord

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                header
                stats
                aboutSection
                skillsSection
                metadataSection
                installCard
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(
            LinearGradient(
                colors: [SaySoPalette.accent.opacity(0.10), Color.clear],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        #if os(iOS)
        .navigationTitle(record.agent.displayName)
        .navigationBarTitleDisplayMode(.inline)
        #else
        .navigationTitle(record.agent.displayName)
        #endif
    }

    private var header: some View {
        VStack(spacing: 14) {
            AgentAvatar(name: record.agent.displayName, seed: record.agent.agentId, size: 84)
                .padding(.top, 12)
            VStack(spacing: 4) {
                Text(record.agent.displayName)
                    .font(.title.weight(.bold))
                    .multilineTextAlignment(.center)
                HStack(spacing: 6) {
                    Text(record.agent.agentId)
                        .font(.callout.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Button {
                        copy(record.agent.agentId)
                    } label: {
                        Image(systemName: "doc.on.doc")
                            .font(.caption2)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                StatusPill(
                    label: model.installability(for: record).isInstallable ? "Runtime ready" : "Not installable",
                    tint: model.installability(for: record).isInstallable ? SaySoPalette.success : .secondary
                )
                StatusPill(
                    label: record.visibility.rawValue.capitalized,
                    tint: record.visibility == .public ? SaySoPalette.teal : .secondary
                )
                if record.listingTier == .premium {
                    StatusPill(label: "Premium", tint: SaySoPalette.amber)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 6)
    }

    private var stats: some View {
        HStack(spacing: 10) {
            StatCard(icon: "person.2.fill", title: "Connections", value: "\(record.connectionCount)", tint: SaySoPalette.accent)
            StatCard(icon: "puzzlepiece.extension.fill",
                     title: "Skills",
                     value: "\(record.skillPacket?.skills.count ?? 0)",
                     tint: SaySoPalette.teal)
            StatCard(icon: "checkmark.seal.fill",
                     title: "Claims",
                     value: "\(record.claimTypes?.count ?? 0)",
                     tint: SaySoPalette.amber)
        }
    }

    private var aboutSection: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader(title: "About")
                Text(record.description.isEmpty ? "This agent did not provide a description." : record.description)
                    .font(.body)
                    .foregroundStyle(record.description.isEmpty ? .secondary : .primary)
            }
        }
    }

    private var skillsSection: some View {
        let skills = record.skillPacket?.skills ?? []
        return SaySoCard {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Skills",
                              subtitle: skills.isEmpty ? nil : "\(skills.count) advertised")
                if skills.isEmpty {
                    Text("This agent did not disclose its skill packet.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(skills) { skill in
                            HStack(alignment: .top, spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                                        .fill(SaySoPalette.accent.opacity(0.15))
                                    Image(systemName: skillIcon(for: skill.skillId))
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(SaySoPalette.accent)
                                }
                                .frame(width: 32, height: 32)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(skill.name)
                                        .font(.subheadline.weight(.semibold))
                                    Text(skill.skillId)
                                        .font(.caption.monospaced())
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Text("v\(skill.version)")
                                    .font(.caption.weight(.medium).monospacedDigit())
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Color.primary.opacity(0.06), in: Capsule())
                            }
                            .padding(10)
                            .background(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .fill(Color.primary.opacity(0.03))
                            )
                        }
                    }
                }
            }
        }
    }

    private func skillIcon(for id: String) -> String {
        if id.contains("payment") { return "creditcard.fill" }
        if id.contains("network") { return "antenna.radiowaves.left.and.right" }
        if id.contains("upgrade") { return "arrow.up.circle.fill" }
        if id.contains("claim") { return "checkmark.seal.fill" }
        if id.contains("runtime") { return "bolt.fill" }
        if id.contains("source") { return "doc.text.fill" }
        if id.contains("protocol") { return "lock.shield.fill" }
        return "puzzlepiece.extension.fill"
    }

    private var metadataSection: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Metadata")
                metadataRow("Wallet", value: record.walletAddress, copyable: true, monospaced: true)
                Divider().opacity(0.5)
                metadataRow("Sync inbox", value: record.agent.syncInboxId, copyable: true, monospaced: true)
                Divider().opacity(0.5)
                metadataRow("Disclosure", value: record.skillDisclosure.rawValue.replacingOccurrences(of: "-", with: " ").capitalized)
                Divider().opacity(0.5)
                metadataRow("Updated", value: record.updatedAt)
            }
        }
    }

    private func metadataRow(_ label: String, value: String, copyable: Bool = false, monospaced: Bool = false) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 92, alignment: .leading)
            Text(value)
                .font(monospaced ? .caption.monospaced() : .callout)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            if copyable {
                Button { copy(value) } label: {
                    Image(systemName: "doc.on.doc")
                        .font(.caption2)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
    }

    private var installCard: some View {
        let installability = model.installability(for: record)
        let installable = installability.isInstallable
        return SaySoCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: installable ? "square.and.arrow.down.fill" : "exclamationmark.triangle.fill")
                        .font(.title3)
                        .foregroundStyle(installable ? SaySoPalette.success : SaySoPalette.amber)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(installable ? "Ready to install" : "Cannot install")
                            .font(.headline)
                        Text(installability.message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
                Button {
                    Task { await model.installSelectedAgent() }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.and.arrow.down")
                        Text("Install SaySo app")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(.white)
                    .background(
                        installable
                            ? AnyShapeStyle(SaySoPalette.heroGradient)
                            : AnyShapeStyle(Color.gray.opacity(0.5))
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!installable)
            }
        }
    }

    private func copy(_ value: String) {
        #if os(iOS)
        UIPasteboard.general.string = value
        #elseif os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(value, forType: .string)
        #endif
    }
}

// MARK: - Library

private struct LibraryTab: View {
    @ObservedObject var model: SaySoAppModel

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [SaySoPalette.teal.opacity(0.10), Color.clear],
                    startPoint: .top, endPoint: .bottom
                )
                .ignoresSafeArea()

                if model.installedApps.isEmpty {
                    libraryEmpty
                } else {
                    ScrollView {
                        VStack(spacing: 14) {
                            if let status = model.statusMessage {
                                StatusBanner(
                                    message: status,
                                    isError: status.lowercased().contains("error") || status.lowercased().contains("fail")
                                )
                            }
                            ForEach(model.installedApps) { app in
                                InstalledAppCard(app: app, model: model)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                    }
                }
            }
            .navigationTitle("Library")
        }
    }

    private var libraryEmpty: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle()
                    .fill(SaySoPalette.heroGradient)
                    .frame(width: 96, height: 96)
                    .blur(radius: 22)
                    .opacity(0.45)
                Image(systemName: "square.stack.3d.up.fill")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(SaySoPalette.heroGradient)
            }
            VStack(spacing: 6) {
                Text("Your library is empty")
                    .font(.title3.weight(.semibold))
                Text("Install a SaySo app from Discover to run it here.\nThe runtime sandboxes each app on-device.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct InstalledAppCard: View {
    let app: InstalledSaySoAppManifest
    @ObservedObject var model: SaySoAppModel

    private var statusInfo: (label: String, tint: Color, pulse: Bool) {
        switch app.state {
        case .running: return ("Running", SaySoPalette.success, true)
        case .stopped: return ("Stopped", .secondary, false)
        case .crashed: return ("Crashed", SaySoPalette.danger, false)
        }
    }

    var body: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    AgentAvatar(name: app.displayName, seed: app.agentId, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(app.displayName)
                            .font(.headline)
                            .lineLimit(1)
                        Text(app.appId)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    StatusPill(label: statusInfo.label, tint: statusInfo.tint, pulses: statusInfo.pulse)
                }

                if let lastError = app.lastError, !lastError.isEmpty {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(SaySoPalette.danger)
                            .font(.caption)
                        Text(lastError)
                            .font(.caption)
                            .foregroundStyle(SaySoPalette.danger)
                            .lineLimit(3)
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(SaySoPalette.danger.opacity(0.10))
                    )
                }

                HStack(spacing: 10) {
                    Button {
                        model.start(app)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "play.fill")
                            Text("Run")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .foregroundStyle(.white)
                        .background(
                            app.state == .running
                                ? AnyShapeStyle(Color.gray.opacity(0.4))
                                : AnyShapeStyle(SaySoPalette.heroGradient)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(app.state == .running)

                    Button {
                        model.stop(app)
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "stop.fill")
                            Text("Stop")
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .foregroundStyle(app.state == .running ? SaySoPalette.danger : .secondary)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(Color.primary.opacity(0.06))
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .strokeBorder(Color.primary.opacity(0.10), lineWidth: 1)
                        )
                    }
                    .buttonStyle(.plain)
                    .disabled(app.state != .running)
                }

                HStack(spacing: 14) {
                    metaTag(icon: "doc.text", text: "\(app.files.count) files")
                    metaTag(icon: "clock", text: app.installedAt.formatted(date: .abbreviated, time: .shortened))
                    Spacer()
                }
            }
        }
    }

    private func metaTag(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            Text(text)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

// MARK: - Settings

private struct SettingsTab: View {
    @ObservedObject var model: SaySoAppModel

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(
                    colors: [SaySoPalette.accent.opacity(0.08), Color.clear, SaySoPalette.teal.opacity(0.05)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
                .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 18) {
                        hero
                        registryCard
                        statusCard
                        aboutCard
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
                    .padding(.bottom, 24)
                    .frame(maxWidth: 720)
                    .frame(maxWidth: .infinity)
                }
            }
            .navigationTitle("Settings")
        }
    }

    // MARK: Hero

    private var hero: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "gearshape.fill")
                    .font(.caption.bold())
                Text("PREFERENCES")
                    .font(.caption.weight(.semibold))
                    .tracking(0.6)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .foregroundStyle(.white)
            .background(SaySoPalette.heroGradient, in: Capsule())

            Text("Configure your SaySo client")
                .font(.system(size: 28, weight: .bold, design: .rounded))
            Text("Choose where to discover agents and inspect what's installed locally.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 8)
    }

    // MARK: Registry

    private var registryCard: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(
                    title: "Registry",
                    subtitle: "Where the client looks for advertised agents."
                )

                settingsRow(
                    icon: "link",
                    iconTint: SaySoPalette.accent,
                    title: "Backend URL",
                    description: "Point this to your personal service or a hosted environment."
                ) {
                    HStack(spacing: 8) {
                        Image(systemName: "terminal")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("https://…", text: $model.baseURLText)
                            .textFieldStyle(.plain)
                            .font(.callout.monospaced())
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            .autocorrectionDisabled()
                            #endif
                        if !model.baseURLText.isEmpty {
                            Button {
                                model.baseURLText = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color.primary.opacity(0.05))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.10), lineWidth: 1)
                    )
                }

                settingsDivider

                settingsRow(
                    icon: "globe",
                    iconTint: SaySoPalette.teal,
                    title: "Environment",
                    description: "Switch between development and production registry."
                ) {
                    Picker("", selection: $model.environment) {
                        ForEach(RegistryEnvironment.allCases, id: \.self) { env in
                            Text(env.rawValue.capitalized).tag(env)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                }

                Button {
                    Task { await model.refreshRegistry() }
                } label: {
                    HStack(spacing: 8) {
                        if model.isLoading {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                        Text(model.isLoading ? "Refreshing…" : "Refresh registry")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .foregroundStyle(.white)
                    .background(
                        model.isLoading
                            ? AnyShapeStyle(Color.gray.opacity(0.5))
                            : AnyShapeStyle(SaySoPalette.heroGradient)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(model.isLoading)
            }
        }
    }

    // MARK: Status

    private var statusCard: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeader(
                    title: "Status",
                    subtitle: "Snapshot of the local client state."
                )

                HStack(spacing: 10) {
                    StatCard(
                        icon: "antenna.radiowaves.left.and.right",
                        title: "Loaded agents",
                        value: "\(model.agents.count)",
                        tint: SaySoPalette.accent
                    )
                    StatCard(
                        icon: "square.stack.3d.up.fill",
                        title: "Installed",
                        value: "\(model.installedApps.count)",
                        tint: SaySoPalette.teal
                    )
                    StatCard(
                        icon: "bolt.horizontal.fill",
                        title: "Running",
                        value: "\(model.installedApps.filter { $0.state == .running }.count)",
                        tint: SaySoPalette.success
                    )
                }

                if let status = model.statusMessage {
                    StatusBanner(
                        message: status,
                        isError: status.lowercased().contains("error") || status.lowercased().contains("fail")
                    )
                }
            }
        }
    }

    // MARK: About

    private var aboutCard: some View {
        SaySoCard {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeader(
                    title: "About",
                    subtitle: "SaySo is a transport-neutral meta protocol for agents and humans."
                )

                aboutLink(
                    icon: "book.closed.fill",
                    tint: SaySoPalette.accent,
                    title: "Protocol spec",
                    subtitle: "github.com/gip/sayso",
                    url: "https://github.com/gip/sayso"
                )
                settingsDivider
                aboutLink(
                    icon: "chevron.left.forwardslash.chevron.right",
                    tint: SaySoPalette.teal,
                    title: "Reference implementation",
                    subtitle: "github.com/gip/sayso-labs",
                    url: "https://github.com/gip/sayso-labs"
                )
                settingsDivider
                HStack(spacing: 12) {
                    iconTile(systemName: "info.circle.fill", tint: SaySoPalette.amber)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Protocol version")
                            .font(.subheadline.weight(.semibold))
                        Text("0.1.0 · all skills")
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                }
            }
        }
    }

    // MARK: Building blocks

    private var settingsDivider: some View {
        Rectangle()
            .fill(Color.primary.opacity(0.06))
            .frame(height: 1)
    }

    private func iconTile(systemName: String, tint: Color) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(tint.opacity(0.18))
            Image(systemName: systemName)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(tint)
        }
        .frame(width: 30, height: 30)
    }

    private func settingsRow<Control: View>(
        icon: String,
        iconTint: Color,
        title: String,
        description: String,
        @ViewBuilder control: () -> Control
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            iconTile(systemName: icon, tint: iconTint)
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                control()
            }
        }
    }

    private func aboutLink(icon: String, tint: Color, title: String, subtitle: String, url: String) -> some View {
        Link(destination: URL(string: url)!) {
            HStack(spacing: 12) {
                iconTile(systemName: icon, tint: tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(subtitle)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
