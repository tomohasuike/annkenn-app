import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log("Fetching all pages with thumbnail URLs...");
  let totalUpdated = 0;

  while(true) {
    const { data, error } = await supabase
      .from("catalog_pages")
      .select("id, page_image_url")
      .like("page_image_url", "%drive.google.com/thumbnail%")
      .limit(1000);
      
    if (error) { console.error(error); return; }
    
    if (data.length === 0) {
      break;
    }
    
    for (const page of data) {
      const match = page.page_image_url.match(/id=([^&]+)/);
      if (match && match[1]) {
        const id = match[1];
        const newUrl = `https://lh3.googleusercontent.com/d/${id}=w1000`;
        await supabase.from("catalog_pages").update({ page_image_url: newUrl }).eq("id", page.id);
        totalUpdated++;
      }
    }
    console.log(`Updated a batch. Total updated so far: ${totalUpdated}`);
  }
  
  let matUpdated = 0;
  while(true) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, image_url")
      .like("image_url", "%drive.google.com/thumbnail%")
      .limit(1000);
      
    if (error) { console.error(error); break; }
    if (data.length === 0) break;
    
    for (const mat of data) {
      const match = mat.image_url.match(/id=([^&]+)/);
      if (match && match[1]) {
        const id = match[1];
        const newUrl = `https://lh3.googleusercontent.com/d/${id}=w1000`;
        await supabase.from("materials").update({ image_url: newUrl }).eq("id", mat.id);
        matUpdated++;
      }
    }
    console.log(`Updated materials batch. Total materials updated: ${matUpdated}`);
  }

  console.log("Done updating URL formats entirely to LH3!");
}
fix();
