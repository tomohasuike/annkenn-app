import sys
import Quartz
from CoreFoundation import NSURL
import os

pdf_path = sys.argv[1]
page_num = int(sys.argv[2])
out_path = sys.argv[3]

p = Quartz.CGPDFDocumentCreateWithURL(NSURL.fileURLWithPath_(pdf_path))
if not p:
    print("Failed to open PDF")
    sys.exit(1)

page = Quartz.CGPDFDocumentGetPage(p, page_num)
if not page:
    print(f"Page {page_num} not found")
    sys.exit(1)

rect = Quartz.CGPDFPageGetBoxRect(page, Quartz.kCGPDFMediaBox)
width, height = rect.size.width, rect.size.height

url = NSURL.fileURLWithPath_(out_path)
dest = Quartz.CGImageDestinationCreateWithURL(url, "public.jpeg", 1, None)

# Need to render CGPDFPage to CGImage
# Wait, let's use NSImage/NSBitmapImageRep

def create_image():
    colorSpace = Quartz.CGColorSpaceCreateDeviceRGB()
    ctx = Quartz.CGBitmapContextCreate(None, int(width*2), int(height*2), 8, 0, colorSpace, Quartz.kCGImageAlphaPremultipliedLast)
    Quartz.CGContextScaleCTM(ctx, 2.0, 2.0)
    Quartz.CGContextSetRGBFillColor(ctx, 1.0, 1.0, 1.0, 1.0)
    Quartz.CGContextFillRect(ctx, rect)
    Quartz.CGContextDrawPDFPage(ctx, page)
    cgImage = Quartz.CGBitmapContextCreateImage(ctx)
    Quartz.CGImageDestinationAddImage(dest, cgImage, {Quartz.kCGImageDestinationLossyCompressionQuality: 0.9})
    Quartz.CGImageDestinationFinalize(dest)

create_image()
print(f"Saved to {out_path}")
