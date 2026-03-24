#!/bin/bash
source .env.local

echo "Starting migration via Edge Function..."
while true; do
  RESPONSE=$(curl -s -X POST https://gsczefdkcrvudddeotlx.supabase.co/functions/v1/migrate-drive-photos)
  echo "Response: $RESPONSE"
  
  if echo "$RESPONSE" | grep -q '"daily":0,"materials":0,"completions":0'; then
      echo "Migration Complete!"
      break
  fi
  
  if echo "$RESPONSE" | grep -q '"error"'; then
      echo "Error encountered, stopping."
      break
  fi
  
  sleep 1
done
