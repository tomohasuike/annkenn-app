import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function fix() {
  console.log("Fetching all pages with export=download URLs...");
  let totalUpdated = 0;

  while(true) {
    const { data, error } = await supabase
      .from("catalog_pages")
      .select("id, page_image_url")
      .like("page_image_url", "%export=download%")
      .limit(1000);
      
    if (error) { console.error(error); return; }
    
    if (data.length === 0) {
      break;
    }
    
    for (const page of data) {
      const parts = page.page_image_url.split("id=");
      if (parts.length > 1) {
        const id = parts[1];
        // Wait! Even better! Google Drive images embedded in img src correctly IF we use the direct thumbnail URL format
        // BUT wait! If it's a JPEG file physically in Google Drive (which convert-catalogs-to-images.mjs uploads),
        // we CAN use the LH3 proxy or the direct web content link if it is fully public!
        // `export=download` fails due to 302 or cookies. 
        // `https://drive.google.com/uc?export=view&id=...` fails due to iframe headers usually.
        // `https://drive.google.com/thumbnail?id=${id}&sz=w1000` requires authentication if the folder/file isn't explicitly open to anonymous!
        // Wait, convert script sets: { role: 'reader', type: 'anyone' }
        // Let's use `https://drive.google.com/thumbnail?id=${id}&sz=w1000`
        const newUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
        await supabase.from("catalog_pages").update({ page_image_url: newUrl }).eq("id", page.id);
        totalUpdated++;
      }
    }
    console.log(`Updated a batch. Total updated so far: ${totalUpdated}`);
  }
  
  // ALSO update materials text images if any! Wait, materials.image_url.
  // Did materials.image_url also get stored as export=download? 
  // Let's check materials table!
  let matUpdated = 0;
  while(true) {
    const { data, error } = await supabase
      .from("materials")
      .select("id, image_url")
      .like("image_url", "%export=download%")
      .limit(1000);
      
    if (error) { console.error(error); break; }
    if (data.length === 0) break;
    
    for (const mat of data) {
      const parts = mat.image_url.split("id=");
      if (parts.length > 1) {
        const id = parts[1];
        const newUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
        await supabase.from("materials").update({ image_url: newUrl }).eq("id", mat.id);
        matUpdated++;
      }
    }
    console.log(`Updated materials batch. Total materials updated: ${matUpdated}`);
  }

  console.log("Done updating URL formats entirely!");
}
fix();
