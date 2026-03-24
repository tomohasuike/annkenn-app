import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const url = Deno.env.get('VITE_SUPABASE_URL');
const key = Deno.env.get('VITE_SUPABASE_ANON_KEY');

const supabase = createClient(url, key);

const fileContent = new TextEncoder().encode("This is a dummy image for testing drive upload.");
const file = new File([fileContent], "test_upload_image.jpg", { type: "image/jpeg" });

const formData = new FormData();
formData.append('file', file);

console.log("Invoking edge function upload-drive-file...");

try {
  const { data, error } = await supabase.functions.invoke('upload-drive-file', {
    body: formData,
  });
  console.log('Result Data:', data);
  if (error) console.error('Result Error:', error);
} catch (e) {
  console.error("Exception thrown:", e);
}
