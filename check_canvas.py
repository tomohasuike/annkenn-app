from PIL import Image
img = Image.open('test_pymupdf.jpg')
width, height = img.size
colors = img.getcolors()
num_colors = len(colors) if colors else 'Too many (>256)'
print(f'Size: {width}x{height} | Colors: {num_colors}')
