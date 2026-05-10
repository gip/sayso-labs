// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "SaySoNative",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "SaySoCore", targets: ["SaySoCore"]),
        .library(name: "SaySoRuntime", targets: ["SaySoRuntime"]),
        .library(name: "SaySoUI", targets: ["SaySoUI"]),
    ],
    targets: [
        .target(
            name: "CQuickJS",
            cSettings: [
                .define("_GNU_SOURCE"),
                .define("CONFIG_VERSION", to: "\"2025-09-13\""),
            ]
        ),
        .target(
            name: "SaySoCore",
            dependencies: []
        ),
        .target(
            name: "SaySoRuntime",
            dependencies: ["CQuickJS", "SaySoCore"]
        ),
        .target(
            name: "SaySoUI",
            dependencies: ["SaySoCore", "SaySoRuntime"]
        ),
        .testTarget(
            name: "SaySoCoreTests",
            dependencies: ["SaySoCore", "SaySoRuntime"]
        ),
    ]
)
