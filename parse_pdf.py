import fitz # PyMuPDF
doc = fitz.open("sample_calc.pdf")
for page_num in range(doc.page_count):
    page = doc.load_page(page_num)
    print(f"--- Page {page_num + 1} ---")
    print(page.get_text("text"))
