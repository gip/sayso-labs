# SaySo Native

Shared Swift codebase for SaySo iOS and macOS hosts.

The package is organized around shared modules:

- `SaySoCore`: protocol models, registry HTTP client, installability checks, source download verification, storage, identity, and transport interfaces.
- `SaySoRuntime`: QuickJS runtime wrapper and lifecycle supervisor.
- `SaySoUI`: SwiftUI registry and installed SaySo app surfaces.
- `SaySoNative.xcodeproj`: launchable iOS and macOS app targets that import the shared package.

For Xcode simulator/device launch, open `SaySoNative.xcodeproj` instead of
opening `Package.swift` directly. The Swift package is useful for shared
builds and tests, but iOS and macOS launch should go through real app bundles
with generated Info.plist metadata and bundle identifiers. The project provides
`SaySoiOS` and `SaySoMac` app targets that import the shared `SaySoUI` package
product.

To start the iOS app:

1. Open `apps/personal/apple/SaySoNative.xcodeproj` in Xcode.
2. Select the `SaySoiOS` scheme.
3. Select an iPhone simulator.
4. Run with `Cmd-R`.

To start the macOS app, use the same project and select the `SaySoMac` scheme.

The default backend URL is `http://127.0.0.1:8787`, matching the SaySo personal service. On an iOS simulator, that reaches the host Mac. On a physical
iPhone, enter the Mac's LAN URL in the backend field instead, for example
`http://192.168.1.10:8787`.

Current v1 behavior:

- discovers agents through the SaySo Network HTTP backend
- marks agents installable only when `sayso.runtime`, `sayso.source`, and runtime source entrypoint metadata are present
- downloads source through the `SaySoSourceTransport` abstraction and verifies chunk/file SHA-256 before persistence
- stores installed SaySo apps under Application Support with manifest, skill packet, and source files
- runs installed SaySo apps while the host app is open through the runtime lifecycle wrapper

The XMTP adapter is intentionally isolated behind `SaySoMessagingClient`; link the official XMTP Swift SDK there without changing install/storage/runtime code.
