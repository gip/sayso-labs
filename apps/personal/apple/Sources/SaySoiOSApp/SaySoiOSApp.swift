import SwiftUI
import SaySoUI

#if os(iOS)
@main
struct SaySoiOSApp: App {
    var body: some Scene {
        WindowGroup {
            SaySoRootView()
        }
    }
}
#else
@main
struct SaySoiOSAppUnsupported {
    static func main() {
        print("SaySoiOSApp is only available on iOS.")
    }
}
#endif
