import Quartz
from CoreFoundation import NSURL
import sys

def render_pdf_page_to_jpeg(pdf_path, page_num, out_jpeg):
    pdf_url = NSURL.fileURLWithPath_(pdf_path)
    pdf_doc = Quartz.CGPDFDocumentCreateWithURL(pdf_url)
    
    if pdf_doc is None:
        print("Could not load PDF")
        return
        
    page = Quartz.CGPDFDocumentGetPage(pdf_doc, page_num)
    if page is None:
        print("Could not load page")
        return
        
    # Get page dimensions
    rect = Quartz.CGPDFPageGetBoxRect(page, Quartz.kCGPDFMediaBox)
    width = int(rect.size.width * 2) # scale by 2 for higher res
    height = int(rect.size.height * 2)
    
    color_space = Quartz.CGColorSpaceCreateDeviceRGB()
    context = Quartz.CGBitmapContextCreate(None, width, height, 8, width * 4, color_space, Quartz.kCGImageAlphaPremultipliedLast)
    
    # Fill white background
    Quartz.CGContextSetRGBFillColor(context, 1.0, 1.0, 1.0, 1.0)
    Quartz.CGContextFillRect(context, Quartz.CGRectMake(0, 0, width, height))
    
    Quartz.CGContextScaleCTM(context, 2.0, 2.0)
    Quartz.CGContextDrawPDFPage(context, page)
    
    image = Quartz.CGBitmapContextCreateImage(context)
    
    out_url = NSURL.fileURLWithPath_(out_jpeg)
    dest = Quartz.CGImageDestinationCreateWithURL(out_url, 'public.jpeg', 1, None)
    Quartz.CGImageDestinationAddImage(dest, image, None)
    Quartz.CGImageDestinationFinalize(dest)
    print("Done")

render_pdf_page_to_jpeg("/Users/hasuiketomoo/Downloads/カタログ/catalog_densetsu-kai.pdf", 730, "cg_test.jpg")
