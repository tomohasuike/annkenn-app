import Foundation
import PDFKit

let args = CommandLine.arguments
if args.count < 4 {
    print("Usage: swift pdf_to_jpg.swift <input.pdf> <page_number> <output.jpg>")
    exit(1)
}

let inputPath = args[1]
let pageNumber = Int(args[2])!
let outputPath = args[3]

let url = URL(fileURLWithPath: inputPath)
guard let document = PDFDocument(url: url) else {
    print("Failed to load PDF")
    exit(1)
}

// PDFKit uses 0-based index
guard let page = document.page(at: pageNumber) else {
    print("Invalid page number")
    exit(1)
}

let pageRect = page.bounds(for: .mediaBox)
// Create an image at 300 DPI resolution (scale 4x from 72 DPI)
let scale: CGFloat = 4.0
let targetSize = CGSize(width: pageRect.width * scale, height: pageRect.height * scale)

let colorSpace = CGColorSpaceCreateDeviceRGB()
guard let context = CGContext(data: nil,
                              width: Int(targetSize.width),
                              height: Int(targetSize.height),
                              bitsPerComponent: 8,
                              bytesPerRow: 0,
                              space: colorSpace,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
    print("Failed to create context")
    exit(1)
}

context.setFillColor(NSColor.white.cgColor)
context.fill(CGRect(origin: .zero, size: targetSize))

context.scaleBy(x: scale, y: scale)
page.draw(with: .mediaBox, to: context)

guard let cgImage = context.makeImage() else {
    print("Failed to create image")
    exit(1)
}

let nsImage = NSImage(cgImage: cgImage, size: targetSize)
guard let tiffData = nsImage.tiffRepresentation,
      let bitmapImage = NSBitmapImageRep(data: tiffData),
      let jpegData = bitmapImage.representation(using: .jpeg, properties: [.compressionFactor: 0.85]) else {
    print("Failed to convert to JPEG")
    exit(1)
}

try? jpegData.write(to: URL(fileURLWithPath: outputPath))
print("Successfully wrote to \(outputPath)")
