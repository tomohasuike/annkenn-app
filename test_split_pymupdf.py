import fitz
import sys

# Open the original massive PDF
doc = fitz.open("/Users/hasuiketomoo/Downloads/catalog_densetsu.pdf")
# Extract page 256 (0-indexed 255)
out_doc = fitz.open()
out_doc.insert_pdf(doc, from_page=255, to_page=255)
out_doc.save("test_page_pymupdf.pdf")
out_doc.close()
doc.close()

# Now test rendering it
try:
    doc2 = fitz.open("test_page_pymupdf.pdf")
    page = doc2.load_page(0)
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save("test_page_pymupdf_render.jpg")
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
