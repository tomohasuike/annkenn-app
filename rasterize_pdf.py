import sys
import fitz

pdf_path = sys.argv[1]
jpg_path = sys.argv[2]
try:
    doc = fitz.open(pdf_path)
    page = doc.load_page(0)
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(jpg_path)
    print("SUCCESS")
except Exception as e:
    print(f"ERROR: {e}")
