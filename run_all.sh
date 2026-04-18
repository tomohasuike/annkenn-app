#!/bin/bash
while true; do
  echo "Running convert-catalogs-to-images.mjs..."
  node scripts/convert-catalogs-to-images.mjs
  
  # Check if the script grabbed any pages. If it didn't find any or error out immediately, sleep or break.
  # But assuming it processes until 0 remaining, let's just run it 5 times to be safe since 1954/1000 = 2 times basically.
  sleep 5
done
