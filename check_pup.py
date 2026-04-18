from PIL import Image
img = Image.open('puppeteer_test.jpg')
colors = img.getcolors()
print("Colors:", len(colors) if colors else "Too many (>256)")
