from PIL import Image
import sys
import glob

files = glob.glob('test_page*.jpg')
for file in files:
    img = Image.open(file)
    extrema = img.convert("L").getextrema()
    colors = img.getcolors()
    num_colors = len(colors) if colors else "Too many (>256)"
    print(f"File: {file} | Min: {extrema[0]} | Max: {extrema[1]} | Colors: {num_colors}")
