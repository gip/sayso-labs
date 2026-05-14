import CQuickJS
import Foundation

private enum ExitCode: Int32 {
    case usage = 64
    case failure = 1
}

private func usage() -> Never {
    fputs(
        """
        Usage:
          sayso-qjs-bytecode --metadata
          sayso-qjs-bytecode <source.js> <output.qjsc>

        """,
        stderr
    )
    exit(ExitCode.usage.rawValue)
}

private func printMetadata(byteCount: Int? = nil) {
    print("engine=quickjs")
    print("engineVersion=\(String(cString: sayso_qjs_quickjs_version()))")
    print("format=quickjs-binary-json-bytecode")
    print("formatVersion=\(String(cString: sayso_qjs_bytecode_format_version()))")
    print("evalType=global")
    print("mediaType=application/vnd.sayso.quickjs-bytecode")
    if let byteCount {
        print("bytes=\(byteCount)")
    }
}

private func fail(_ message: String) -> Never {
    fputs("\(message)\n", stderr)
    exit(ExitCode.failure.rawValue)
}

let arguments = CommandLine.arguments
if arguments.count == 2, arguments[1] == "--metadata" {
    printMetadata()
    exit(0)
}

guard arguments.count == 3 else {
    usage()
}

let sourceURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])

do {
    let source = try String(contentsOf: sourceURL, encoding: .utf8)
    var errorBuffer = [CChar](repeating: 0, count: 2048)
    var bytecodeLength = 0
    guard let bytecodePointer = source.withCString({
        sayso_qjs_compile_bytecode($0, &bytecodeLength, &errorBuffer, Int32(errorBuffer.count))
    }) else {
        fail(String(cString: errorBuffer))
    }
    defer { sayso_qjs_free_bytes(bytecodePointer) }

    let bytecode = Data(bytes: bytecodePointer, count: bytecodeLength)
    try FileManager.default.createDirectory(
        at: outputURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
    )
    try bytecode.write(to: outputURL, options: .atomic)
    printMetadata(byteCount: bytecode.count)
} catch {
    fail(error.localizedDescription)
}
