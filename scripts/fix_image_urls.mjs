import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log("Fetching all pages with export=download URLs...");
  let hasMore = true;
  let offset = 0;
  const limit = 1000;
  let totalUpdated = 0;

  while(hasMore) {
    const { data, error } = await supabase
      .from("catalog_pages")
      .select("id, page_image_url")
      .like("page_image_url", "%export=download%")
      .range(offset, offset + limit - 1);
      
    if (error) { console.error(error); return; }
    
    if (data.length === 0) {
      hasMore = false;
      break;
    }
    
    for (const page of data) {
      const parts = page.page_image_url.split("id=");
      if (parts.length > 1) {
        const id = parts[1];
        const newUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
        await supabase.from("catalog_pages").update({ page_image_url: newUrl }).eq("id", page.id);
        totalUpdated++;
      }
    }
    console.log(`Resolved batch starting at ${offset}. Total updated so far: ${totalUpdated}`);
    offset += limit;
  }
  console.log("Done updating URLs!");
}
fix();
