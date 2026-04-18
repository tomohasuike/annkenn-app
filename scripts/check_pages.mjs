import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const mfgs = ["未来工業"];
  
  for (const name of mfgs) {
    const { data: mnData } = await supabase.from("manufacturers").select("id").eq("name", name);
    if (!mnData || mnData.length === 0) continue;
    
    let totalSavedPages = 0;
    const { count } = await supabase.from("catalog_pages").select("*", { count: "exact", head: true }).eq("manufacturer", name);
    totalSavedPages = count || 0;
    
    // We can't do DISTINCT directly with PostgREST, so we will fetch all page_numbers and Set them.
    let allPages = new Set();
    let offset = 0;
    const limit = 1000;
    
    for(const m of mnData) { // In case of duplicate ids
      let hasMore = true;
      while(hasMore) {
        const { data } = await supabase.from("materials").select("page_number").eq("manufacturer_id", m.id).not("page_number", "is", null).range(offset, offset + limit - 1);
        if(data && data.length > 0) {
          data.forEach(d => allPages.add(d.page_number));
          offset += limit;
        } else {
          hasMore = false;
        }
      }
    }
    
    const usefulPages = allPages.size;
    const uselessPages = totalSavedPages - usefulPages;
    
    console.log(`Manufacturer: ${name}`);
    console.log(`- 全ページ数 (catalog_pages): ${totalSavedPages}`);
    console.log(`- 製品が抽出されたページ数: ${usefulPages}`);
    console.log(`- 抽出に必要なかったページ数: ${uselessPages} (${Math.round((uselessPages/totalSavedPages)*100)}%)`);
  }
}
check();
