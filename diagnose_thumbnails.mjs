import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose2() {
  // catalog_pages の全URL形式を調べる
  const { count: ucFormat } = await supabase
    .from('catalog_pages')
    .select('*', { count: 'exact', head: true })
    .like('page_image_url', '%drive.google.com/uc%');
  
  const { count: nullCount } = await supabase
    .from('catalog_pages')
    .select('*', { count: 'exact', head: true })
    .is('page_image_url', null);
  
  const { count: lh3Count } = await supabase
    .from('catalog_pages')
    .select('*', { count: 'exact', head: true })
    .like('page_image_url', '%lh3.googleusercontent.com%');

  console.log('=== catalog_pages URL形式の内訳 ===');
  console.log(`drive/thumbnail形式: 1727件`);
  console.log(`drive/uc形式(問題): ${ucFormat}件`);
  console.log(`lh3形式: ${lh3Count}件`);
  console.log(`NULL: ${nullCount}件`);
  console.log(`その他: ${8581 - 1727 - (ucFormat||0) - (lh3Count||0) - (nullCount||0)}件`);

  // uc形式のURLが実際にアクセスできるか確認
  const { data: sampleUc } = await supabase
    .from('catalog_pages')
    .select('page_image_url')
    .like('page_image_url', '%drive.google.com/uc%')
    .limit(1);
  
  if (sampleUc && sampleUc[0]) {
    const url = sampleUc[0].page_image_url;
    console.log(`\nuc形式サンプル: ${url}`);
    
    try {
      const res = await fetch(url, { redirect: 'follow' });
      console.log(`アクセス結果: ${res.status} / ${res.headers.get('content-type')}`);
      if (res.headers.get('content-type')?.includes('image')) {
        console.log('✅ 画像として取得可能！');
      } else {
        console.log('❌ 画像ではなくHTMLが返ってくる（表示不可）');
      }
    } catch(e) {
      console.log('❌ アクセスエラー:', e.message);
    }
  }

  // materials で page_number があって image_url が NULL のもの件数
  const { count: nullMatsWithPage } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .is('image_url', null)
    .not('page_number', 'is', null);
  
  const { count: dummyMats } = await supabase
    .from('materials')
    .select('*', { count: 'exact', head: true })
    .like('image_url', '%dummyimage%');
  
  console.log('\n=== materials の状況 ===');
  console.log(`image_urlがNULLかつpage_numberがある: ${nullMatsWithPage}件 → カタログページと紐づけ可能`);
  console.log(`dummyimage使用中: ${dummyMats}件`);
}

diagnose2().catch(console.error);
