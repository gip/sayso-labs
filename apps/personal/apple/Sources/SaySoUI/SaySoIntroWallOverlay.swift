import SceneKit
import SwiftUI

#if os(iOS)
import UIKit
private typealias PlatformColor = UIColor
private typealias PlatformFont = UIFont
#elseif os(macOS)
import AppKit
private typealias PlatformColor = NSColor
private typealias PlatformFont = NSFont
#endif

struct SaySoIntroWallOverlay: View {
    let open: Bool

    var body: some View {
        SaySoIntroWallSceneView(open: open)
    }
}

#if os(iOS)
private struct SaySoIntroWallSceneView: UIViewRepresentable {
    let open: Bool

    func makeCoordinator() -> SaySoIntroWallSceneCoordinator {
        SaySoIntroWallSceneCoordinator()
    }

    func makeUIView(context: Context) -> SCNView {
        context.coordinator.makeSceneView()
    }

    func updateUIView(_ view: SCNView, context: Context) {
        context.coordinator.setOpen(open)
    }
}
#elseif os(macOS)
private struct SaySoIntroWallSceneView: NSViewRepresentable {
    let open: Bool

    func makeCoordinator() -> SaySoIntroWallSceneCoordinator {
        SaySoIntroWallSceneCoordinator()
    }

    func makeNSView(context: Context) -> SCNView {
        context.coordinator.makeSceneView()
    }

    func updateNSView(_ view: SCNView, context: Context) {
        context.coordinator.setOpen(open)
    }
}
#endif

private final class SaySoIntroWallSceneCoordinator {
    private enum Metrics {
        static let wallWidth: Float = 70
        static let wallHeight: Float = 30
        static let sideWidth = wallWidth / 2
        static let brickWidth: Float = 1.28
        static let brickHeight: Float = 0.64
        static let mortarGap: Float = 0.05
        static let brickDepth: Float = 0.22
        static let openOffset: Float = 38
        static let cameraScale: Double = 10.5
    }

    private let scene = SCNScene()
    private let wallRoot = SCNNode()
    private let leftWall = SCNNode()
    private let rightWall = SCNNode()
    private let textNode: SCNNode
    private var hasOpened = false

    init() {
        textNode = Self.makeTagNode()
        buildScene()
    }

    func makeSceneView() -> SCNView {
        let view = SCNView(frame: .zero)
        view.scene = scene
        view.allowsCameraControl = false
        view.rendersContinuously = false
        view.isPlaying = true
        view.antialiasingMode = .multisampling4X
        view.backgroundColor = .clear

        #if os(iOS)
        view.isOpaque = false
        #elseif os(macOS)
        view.wantsLayer = true
        view.layer?.isOpaque = false
        view.layer?.backgroundColor = PlatformColor.clear.cgColor
        #endif

        return view
    }

    func setOpen(_ open: Bool) {
        guard open, !hasOpened else { return }
        hasOpened = true

        let textFade = SCNAction.group([
            .fadeOut(duration: 0.32),
            .moveBy(x: 0, y: 0.22, z: 0, duration: 0.32),
        ])
        textFade.timingMode = .easeInEaseOut
        textNode.runAction(textFade)

        let leftSlide = SCNAction.moveBy(x: CGFloat(-Metrics.openOffset), y: 0, z: 0, duration: 1.4)
        leftSlide.timingMode = .easeInEaseOut
        leftWall.runAction(leftSlide)

        let rightSlide = SCNAction.moveBy(x: CGFloat(Metrics.openOffset), y: 0, z: 0, duration: 1.4)
        rightSlide.timingMode = .easeInEaseOut
        rightWall.runAction(rightSlide)
    }

    private func buildScene() {
        scene.background.contents = PlatformColor.clear

        addCamera()
        addLights()

        wallRoot.eulerAngles = SCNVector3(-0.08, -0.16, 0.045)
        scene.rootNode.addChildNode(wallRoot)
        wallRoot.addChildNode(leftWall)
        wallRoot.addChildNode(rightWall)

        buildWallSide(in: leftWall, minX: -Metrics.sideWidth, maxX: 0)
        buildWallSide(in: rightWall, minX: 0, maxX: Metrics.sideWidth)

        wallRoot.addChildNode(textNode)
    }

    private func addCamera() {
        let camera = SCNCamera()
        camera.usesOrthographicProjection = true
        camera.orthographicScale = Metrics.cameraScale
        camera.zNear = 1
        camera.zFar = 80

        let cameraNode = SCNNode()
        cameraNode.camera = camera
        cameraNode.position = SCNVector3(0, 0, 18)
        scene.rootNode.addChildNode(cameraNode)
    }

    private func addLights() {
        let ambient = SCNLight()
        ambient.type = .ambient
        ambient.intensity = 420
        ambient.color = PlatformColor(white: 0.74, alpha: 1)

        let ambientNode = SCNNode()
        ambientNode.light = ambient
        scene.rootNode.addChildNode(ambientNode)

        let key = SCNLight()
        key.type = .omni
        key.intensity = 850
        key.color = PlatformColor(red: 1.0, green: 0.92, blue: 0.80, alpha: 1)

        let keyNode = SCNNode()
        keyNode.light = key
        keyNode.position = SCNVector3(-3.5, 4.5, 7)
        scene.rootNode.addChildNode(keyNode)

        let fill = SCNLight()
        fill.type = .omni
        fill.intensity = 260
        fill.color = PlatformColor(red: 0.60, green: 0.72, blue: 1.0, alpha: 1)

        let fillNode = SCNNode()
        fillNode.light = fill
        fillNode.position = SCNVector3(5, -3.5, 6)
        scene.rootNode.addChildNode(fillNode)
    }

    private func buildWallSide(in parent: SCNNode, minX: Float, maxX: Float) {
        addMortarPlane(to: parent, minX: minX, maxX: maxX)

        let brickMaterials = Self.makeBrickMaterials()
        let rows = Int(ceil(Metrics.wallHeight / Metrics.brickHeight)) + 1

        for row in 0..<rows {
            let y = -Metrics.wallHeight / 2 + Metrics.brickHeight / 2 + Float(row) * Metrics.brickHeight
            let stagger = row.isMultiple(of: 2) ? 0 : Metrics.brickWidth / 2
            var x = minX + Metrics.brickWidth / 2 + stagger
            var column = 0

            while x <= maxX - Metrics.brickWidth / 2 {
                let brick = SCNBox(
                    width: CGFloat(Metrics.brickWidth - Metrics.mortarGap),
                    height: CGFloat(Metrics.brickHeight - Metrics.mortarGap),
                    length: CGFloat(Metrics.brickDepth),
                    chamferRadius: 0.018
                )
                brick.materials = [brickMaterials[(row * 5 + column * 3) % brickMaterials.count]]

                let brickNode = SCNNode(geometry: brick)
                let relief = Float((row + column) % 4) * 0.006
                brickNode.position = SCNVector3(x, y, relief)
                parent.addChildNode(brickNode)

                x += Metrics.brickWidth
                column += 1
            }
        }
    }

    private func addMortarPlane(to parent: SCNNode, minX: Float, maxX: Float) {
        let material = SCNMaterial()
        material.diffuse.contents = PlatformColor(red: 0.48, green: 0.49, blue: 0.50, alpha: 1)
        material.roughness.contents = 0.9
        material.lightingModel = .physicallyBased

        let width = maxX - minX
        let plane = SCNPlane(width: CGFloat(width), height: CGFloat(Metrics.wallHeight))
        plane.materials = [material]

        let planeNode = SCNNode(geometry: plane)
        planeNode.position = SCNVector3(minX + width / 2, 0, -Metrics.brickDepth / 2 - 0.02)
        parent.addChildNode(planeNode)
    }

    private static func makeBrickMaterials() -> [SCNMaterial] {
        [
            PlatformColor(red: 0.90, green: 0.91, blue: 0.92, alpha: 1),
            PlatformColor(red: 0.78, green: 0.79, blue: 0.80, alpha: 1),
            PlatformColor(red: 0.66, green: 0.67, blue: 0.68, alpha: 1),
            PlatformColor(red: 0.96, green: 0.96, blue: 0.95, alpha: 1),
            PlatformColor(red: 0.24, green: 0.25, blue: 0.27, alpha: 1),
            PlatformColor(red: 0.12, green: 0.13, blue: 0.14, alpha: 1),
        ].map { color in
            let material = SCNMaterial()
            material.diffuse.contents = color
            material.roughness.contents = 0.82
            material.metalness.contents = 0
            material.lightingModel = .physicallyBased
            return material
        }
    }

    private static func makeTagNode() -> SCNNode {
        let tag = SCNNode()
        tag.eulerAngles = SCNVector3(0, 0, -0.14)

        let backing = makeTagTextNode(
            size: 2.7,
            color: PlatformColor(red: 0.92, green: 0.93, blue: 0.92, alpha: 1),
            extrusionDepth: 0.012,
            zOffset: Metrics.brickDepth / 2 + 0.12
        )
        backing.opacity = 0.88

        let paint = makeTagTextNode(
            size: 2.46,
            color: PlatformColor(red: 0.03, green: 0.035, blue: 0.04, alpha: 1),
            extrusionDepth: 0.018,
            zOffset: Metrics.brickDepth / 2 + 0.145
        )

        let underline = makeTagStroke(
            width: 4.35,
            color: PlatformColor(red: 0.03, green: 0.035, blue: 0.04, alpha: 1)
        )
        underline.position = SCNVector3(0.05, -0.78, Metrics.brickDepth / 2 + 0.155)
        underline.eulerAngles = SCNVector3(0, 0, Float.pi / 2 - 0.10)

        tag.addChildNode(backing)
        tag.addChildNode(paint)
        tag.addChildNode(underline)
        tag.position = SCNVector3(0, -0.1, 0)
        return tag
    }

    private static func makeTagTextNode(size: CGFloat, color: PlatformColor, extrusionDepth: CGFloat, zOffset: Float) -> SCNNode {
        let text = SCNText(string: "SaySo", extrusionDepth: extrusionDepth)
        text.flatness = 0.02
        text.chamferRadius = 0
        text.font = tagFont(size: size)

        let material = SCNMaterial()
        material.diffuse.contents = color
        material.emission.contents = color.withAlphaComponent(0.12)
        material.specular.contents = PlatformColor(white: 0.08, alpha: 1)
        material.roughness.contents = 0.96
        material.lightingModel = .physicallyBased
        text.materials = [material]

        let node = SCNNode(geometry: text)
        let bounds = text.boundingBox
        let centerX = (bounds.min.x + bounds.max.x) / 2
        let centerY = (bounds.min.y + bounds.max.y) / 2
        node.pivot = SCNMatrix4MakeTranslation(centerX, centerY, 0)
        node.position = SCNVector3(0, 0, zOffset)
        node.castsShadow = false
        return node
    }

    private static func makeTagStroke(width: CGFloat, color: PlatformColor) -> SCNNode {
        let stroke = SCNCapsule(capRadius: 0.045, height: width)
        let material = SCNMaterial()
        material.diffuse.contents = color
        material.emission.contents = color.withAlphaComponent(0.10)
        material.roughness.contents = 0.96
        material.lightingModel = .physicallyBased
        stroke.materials = [material]

        let node = SCNNode(geometry: stroke)
        node.castsShadow = false
        return node
    }

    private static func tagFont(size: CGFloat) -> PlatformFont {
        #if os(iOS)
        UIFont(name: "MarkerFelt-Wide", size: size) ?? .systemFont(ofSize: size, weight: .black)
        #elseif os(macOS)
        NSFont(name: "MarkerFelt-Wide", size: size) ?? .systemFont(ofSize: size, weight: .black)
        #endif
    }
}
