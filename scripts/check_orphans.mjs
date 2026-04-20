import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

// 1. manufacturer_id が NULL の materials
const { count: nullCount } = await s.from('materials').select('*', { count: 'exact', head: true }).is('manufacturer_id', null);
console.log(`manufacturer_id=NULL の materials: ${nullCount}件`);

// 2. catalog_url = 'AUTO_VISION_GENERATED' のもの
const { count: autoCount } = await s.from('materials').select('*', { count: 'exact', head: true }).eq('catalog_url', 'AUTO_VISION_GENERATED');
console.log(`catalog_url='AUTO_VISION_GENERATED': ${autoCount}件`);

// 3. manufacturers テーブルに存在しない manufacturer_id を持つ materials（孤立レコード）
const { data: allMfgs } = await s.from('manufacturers').select('id');
const validIds = allMfgs.map(m => m.id);

// 孤立レコードのチェック（サンプル）
const { data: sampleOrphans } = await s.from('materials')
    .select('id, manufacturer_id, model_number, page_number')
    .not('manufacturer_id', 'is', null)
    .not('manufacturer_id', 'in', `(${validIds.join(',')})`)
    .limit(5);
console.log(`孤立manufacturerのmaterials（サンプル5件）:`, JSON.stringify(sampleOrphans, null, 2));

// 4. materialsテーブルの総数確認
const { count: totalMat } = await s.from('materials').select('*', { count: 'exact', head: true });
console.log(`materials 総数: ${totalMat}件`);

// 5. 三菱電機 manufacturer id = '48d6884f-0214-4074-8bc8-2f88afdaafe0' の件数
const { count: mitsubishiCount } = await s.from('materials').select('*', { count: 'exact', head: true }).eq('manufacturer_id', '48d6884f-0214-4074-8bc8-2f88afdaafe0');
console.log(`三菱電機（id=48d6884f）の materials: ${mitsubishiCount}件`);
