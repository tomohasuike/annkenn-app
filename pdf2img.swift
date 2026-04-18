import Cocoa
import Quartz

let args = CommandLine.arguments
if args.count < 3 {
    print("Usage: swift pdf2img.swift <input.pdf> <output_dir>")
    exit(1)
}

let pdfPath = args[1]
let outDir = args[2]

let url = URL(fileURLWithPath: pdfPath)
guard let pdf = CGPDFDocument(url as CFURL) else {
    print("Could not open PDF: \(pdfPath)")
    exit(1)
}

let pageCount = pdf.numberOfPages
print("Total pages: \(pageCount)")

for i in 1...pageCount {
    guard let page = pdf.page(at: i) else { continue }
    let rect = page.getBoxRect(.mediaBox)
    let width = rect.width * 2.0 // 2x scale for high res
    let height = rect.height * 2.0
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let context = CGContext(data: nil, width: Int(width), height: Int(height), bitsPerComponent: 8, bytesPerRow: 0, space: colorSpace, bitmapInfo: bitmapInfo) else {
        continue
    }
    
    // Fill white background
    context.setFillColor(NSColor.white.cgColor)
    context.fill(CGRect(x: 0, y: 0, width: width, height: height))
    
    context.scaleBy(x: 2.0, y: 2.0)
    context.drawPDFPage(page)
    
    guard let cgImage = context.makeImage() else { continue }
    
    let outUrl = URL(fileURLWithPath: "\(outDir)/page_\(i).jpg")
    guard let destination = CGImageDestinationCreateWithURL(outUrl as CFURL, "public.jpeg" as CFString, 1, nil) else { continue }
    
    let options: [CFString: Any] = [
        kCGImageDestinationLossyCompressionQuality: 0.8
    ]
    CGImageDestinationAddImage(destination, cgImage, options as CFDictionary)
    CGImageDestinationFinalize(destination)
    if i % 100 == 0 || i == pageCount {
        print("Exported \(i)/\(pageCount)")
    }
}
print("Done.")
