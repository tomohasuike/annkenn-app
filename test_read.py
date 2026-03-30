import csv
import sys

filename = '/Users/hasuiketomoo/Downloads/20260126_20260225.csv'

try:
    with open(filename, 'r', encoding='utf-8') as f:
        print("--- UTF-8 ---")
        for i, line in enumerate(f):
            print(f"{i}: {line.strip()}")
            if i >= 10: break
except UnicodeDecodeError:
    with open(filename, 'r', encoding='shift_jis') as f:
        print("--- Shift-JIS ---")
        for i, line in enumerate(f):
            print(f"{i}: {line.strip()}")
            if i >= 10: break
