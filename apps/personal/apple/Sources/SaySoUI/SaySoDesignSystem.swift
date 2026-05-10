import SwiftUI

// MARK: - Palette

enum SaySoPalette {
    static let accent = Color(red: 0.40, green: 0.36, blue: 0.96)
    static let accentDeep = Color(red: 0.27, green: 0.20, blue: 0.78)
    static let accentSoft = Color(red: 0.62, green: 0.54, blue: 1.00)
    static let teal = Color(red: 0.16, green: 0.78, blue: 0.74)
    static let amber = Color(red: 1.00, green: 0.72, blue: 0.20)
    static let success = Color(red: 0.20, green: 0.78, blue: 0.45)
    static let danger = Color(red: 0.95, green: 0.32, blue: 0.36)

    static let cardStroke = Color.white.opacity(0.06)
    static let canvasGradient = LinearGradient(
        colors: [
            Color(red: 0.06, green: 0.06, blue: 0.12),
            Color(red: 0.10, green: 0.08, blue: 0.18)
        ],
        startPoint: .top,
        endPoint: .bottom
    )
    static let heroGradient = LinearGradient(
        colors: [accent, Color(red: 0.16, green: 0.55, blue: 0.93)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

// MARK: - Card surface

struct SaySoCard<Content: View>: View {
    var padding: CGFloat = 16
    var cornerRadius: CGFloat = 18
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.regularMaterial)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.08), radius: 14, x: 0, y: 6)
    }
}

// MARK: - Agent avatar

struct AgentAvatar: View {
    let name: String
    let seed: String
    var size: CGFloat = 44

    private var monogram: String {
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return "?" }
        let parts = trimmed.split(separator: " ").prefix(2)
        let initials = parts.compactMap { $0.first }.map(String.init).joined()
        return initials.uppercased()
    }

    private var palette: (Color, Color) {
        let hash = abs(seed.unicodeScalars.reduce(5381) { ($0 &* 33) &+ Int($1.value) })
        let hue = Double(hash % 360) / 360.0
        let primary = Color(hue: hue, saturation: 0.62, brightness: 0.88)
        let secondary = Color(hue: (hue + 0.12).truncatingRemainder(dividingBy: 1.0), saturation: 0.78, brightness: 0.55)
        return (primary, secondary)
    }

    var body: some View {
        let colors = palette
        ZStack {
            Circle()
                .fill(LinearGradient(colors: [colors.0, colors.1], startPoint: .topLeading, endPoint: .bottomTrailing))
            Circle()
                .strokeBorder(Color.white.opacity(0.18), lineWidth: 1)
            Text(monogram)
                .font(.system(size: size * 0.40, weight: .semibold, design: .rounded))
                .foregroundStyle(.white)
                .shadow(color: .black.opacity(0.18), radius: 1, y: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: colors.0.opacity(0.35), radius: 8, x: 0, y: 4)
    }
}

// MARK: - Pills

struct StatusPill: View {
    let label: String
    let tint: Color
    var pulses: Bool = false

    @State private var pulse = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(tint)
                .frame(width: 7, height: 7)
                .scaleEffect(pulses && pulse ? 1.4 : 1.0)
                .opacity(pulses && pulse ? 0.5 : 1.0)
                .animation(pulses ? .easeInOut(duration: 0.9).repeatForever(autoreverses: true) : .default, value: pulse)
                .onAppear { if pulses { pulse = true } }
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(tint.opacity(0.14), in: Capsule())
        .overlay(Capsule().strokeBorder(tint.opacity(0.25), lineWidth: 0.5))
    }
}

struct SkillChip: View {
    let skillId: String

    private var icon: String {
        if skillId.contains("payment") { return "creditcard.fill" }
        if skillId.contains("network") { return "antenna.radiowaves.left.and.right" }
        if skillId.contains("upgrade") { return "arrow.up.circle.fill" }
        if skillId.contains("claim") { return "checkmark.seal.fill" }
        if skillId.contains("runtime") { return "bolt.fill" }
        if skillId.contains("source") { return "doc.text.fill" }
        if skillId.contains("protocol") { return "lock.shield.fill" }
        return "puzzlepiece.extension.fill"
    }

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .bold))
            Text(skillId)
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .lineLimit(1)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .foregroundStyle(SaySoPalette.accentSoft)
        .background(SaySoPalette.accent.opacity(0.12), in: Capsule())
        .overlay(Capsule().strokeBorder(SaySoPalette.accent.opacity(0.25), lineWidth: 0.5))
    }
}

// MARK: - Stat card

struct StatCard: View {
    let icon: String
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(tint.opacity(0.18))
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tint)
            }
            .frame(width: 32, height: 32)

            Text(value)
                .font(.title2.weight(.bold).monospacedDigit())
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(0.06), lineWidth: 1)
        )
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var subtitle: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.headline)
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Filter chips

struct FilterChip: View {
    let label: String
    let isOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .foregroundStyle(isOn ? Color.white : Color.primary)
                .background(
                    Capsule().fill(isOn ? AnyShapeStyle(SaySoPalette.heroGradient) : AnyShapeStyle(Color.primary.opacity(0.06)))
                )
                .overlay(
                    Capsule().strokeBorder(isOn ? Color.clear : Color.primary.opacity(0.10), lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Inline status banner

struct StatusBanner: View {
    let message: String
    var isError: Bool = false

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isError ? "exclamationmark.triangle.fill" : "info.circle.fill")
                .foregroundStyle(isError ? SaySoPalette.danger : SaySoPalette.accent)
            Text(message)
                .font(.caption)
                .foregroundStyle(.primary)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(
            (isError ? SaySoPalette.danger : SaySoPalette.accent).opacity(0.10),
            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder((isError ? SaySoPalette.danger : SaySoPalette.accent).opacity(0.25), lineWidth: 0.5)
        )
    }
}

// MARK: - Adaptive flow layout (iOS16+ / macOS13+)

struct WrapHStack<Item: Hashable, Content: View>: View {
    let items: [Item]
    var spacing: CGFloat = 6
    @ViewBuilder var content: (Item) -> Content

    var body: some View {
        FlowLayoutShim(spacing: spacing) {
            ForEach(items, id: \.self) { item in
                content(item)
            }
        }
    }
}

struct FlowLayoutShim: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var rowWidth: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var totalWidth: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if rowWidth + size.width + spacing > maxWidth, rowWidth > 0 {
                totalHeight += rowHeight + spacing
                totalWidth = max(totalWidth, rowWidth)
                rowWidth = 0
                rowHeight = 0
            }
            rowWidth += size.width + (rowWidth > 0 ? spacing : 0)
            rowHeight = max(rowHeight, size.height)
        }
        totalHeight += rowHeight
        totalWidth = max(totalWidth, rowWidth)
        return CGSize(width: min(totalWidth, maxWidth), height: totalHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0
        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            _ = maxWidth
        }
    }
}
