import SwiftUI
import SaySoUI

#if os(macOS)
@main
struct SaySoMacApp: App {
    var body: some Scene {
        WindowGroup {
            SaySoRootView()
                .frame(minWidth: 980, minHeight: 680)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            SidebarCommands()
        }
    }
}
#else
@main
struct SaySoMacAppUnsupported {
    static func main() {
        print("SaySoMacApp is only available on macOS.")
    }
}
#endif
