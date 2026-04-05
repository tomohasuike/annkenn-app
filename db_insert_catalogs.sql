🚀 最新AIを用いたカタログ自動生成・抽出スクリプトを開始します...
🤖 Gemini API へカタログデータの補完・構造化をリクエスト中...
✅ 解析完了！ 5 件のカタログデータを生成しました。
🗄️ 以下のSQLをコピーして、SupabaseのSQL Editorに貼り付けてRunしてください！

-- ここから --


-- 1. メーカーの登録
INSERT INTO manufacturers (name, website_url)
SELECT 'ネグロス電工', 'https://products.negurosu.co.jp/'
WHERE NOT EXISTS (SELECT 1 FROM manufacturers WHERE name = 'ネグロス電工');

INSERT INTO manufacturers (name, website_url)
SELECT '未来工業', 'https://www.mirai.co.jp/'
WHERE NOT EXISTS (SELECT 1 FROM manufacturers WHERE name = '未来工業');

-- 2. カテゴリの登録
INSERT INTO material_categories (name)
SELECT '一般支持金具'
WHERE NOT EXISTS (SELECT 1 FROM material_categories WHERE name = '一般支持金具');
  
-- 3. カタログデータの登録

INSERT INTO materials (manufacturer_id, category_id, model_number, name, description, specifications, image_url, catalog_url, standard_price)
SELECT 
    m.id, c.id, 'HB1-W3', '一般形鋼用支持金具', 'H形鋼やI形鋼などの形鋼フランジに挟み込み、吊りボルト(W3/8)を下げるための金具です。溶接や穴あけが不要で、施工が容易です。', '{"suitable_flange_thickness":"3-24mm","suitable_bolt":"W3/8","material":"電気亜鉛めっき鋼板","allowable_static_load":"980N (100kgf)"}'::jsonb, 'https://dummyimage.com/200x200/cccccc/000.png&text=HB1-W3', 'https://products.negurosu.co.jp/', 280
FROM manufacturers m, material_categories c
WHERE m.name = 'ネグロス電工' AND c.name = '一般支持金具'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE model_number = 'HB1-W3');


INSERT INTO materials (manufacturer_id, category_id, model_number, name, description, specifications, image_url, catalog_url, standard_price)
SELECT 
    m.id, c.id, 'PH1', 'パイラック', '形鋼のフランジに電線管やケーブルラックなどを支持するための金具です。パイラック本体とパイラッククリップを組み合わせて使用します。', '{"suitable_flange_thickness":"3-24mm","suitable_bolt":"W3/8 (吊りボルト用穴あり)","material":"電気亜鉛めっき鋼板","allowable_static_load":"980N (100kgf)"}'::jsonb, 'https://dummyimage.com/200x200/cccccc/000.png&text=PH1', 'https://products.negurosu.co.jp/', 220
FROM manufacturers m, material_categories c
WHERE m.name = 'ネグロス電工' AND c.name = '一般支持金具'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE model_number = 'PH1');


INSERT INTO materials (manufacturer_id, category_id, model_number, name, description, specifications, image_url, catalog_url, standard_price)
SELECT 
    m.id, c.id, 'DC31', 'ダクタークリップ', 'ダクターチャンネル（D1, D2, D3タイプ）に電線管（VE管、PF管、鋼管など）を固定するためのクリップです。DC31は呼び径28（外径31mm）の電線管に対応します。', '{"suitable_pipe_diameter":"φ31mm (VE28, PF28, G28など)","suitable_ducter_channel":"D1, D2, D3タイプ","material":"電気亜鉛めっき鋼板"}'::jsonb, 'https://dummyimage.com/200x200/cccccc/000.png&text=DC31', 'https://products.negurosu.co.jp/', 80
FROM manufacturers m, material_categories c
WHERE m.name = 'ネグロス電工' AND c.name = '一般支持金具'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE model_number = 'DC31');


INSERT INTO materials (manufacturer_id, category_id, model_number, name, description, specifications, image_url, catalog_url, standard_price)
SELECT 
    m.id, c.id, 'VE16', 'ビニル電線管', '硬質塩化ビニル製の電線管です。耐食性、電気絶縁性に優れ、屋内・屋外の露出配管や埋設配管に使用されます。VE16は呼び径16mmです。', '{"nominal_diameter":"16","outer_diameter":"φ22mm","length":"4m (標準)","material":"硬質塩化ビニル (JIS C 8430 準拠)","color":"アイボリー (標準)"}'::jsonb, 'https://dummyimage.com/200x200/cccccc/000.png&text=VE16', 'https://www.mirai.co.jp/', 450
FROM manufacturers m, material_categories c
WHERE m.name = '未来工業' AND c.name = '一般支持金具'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE model_number = 'VE16');


INSERT INTO materials (manufacturer_id, category_id, model_number, name, description, specifications, image_url, catalog_url, standard_price)
SELECT 
    m.id, c.id, 'DH1', 'デッキハンガー', 'デッキプレートに吊りボルト（W3/8）を支持するための金具です。デッキプレートの溝に差し込み、ハンマーで打ち込むだけで簡単に固定できます。', '{"suitable_bolt":"W3/8","suitable_deck_plate":"各種デッキプレート (溝幅、板厚による)","material":"電気亜鉛めっき鋼板","allowable_static_load":"490N (50kgf)"}'::jsonb, 'https://dummyimage.com/200x200/cccccc/000.png&text=DH1', 'https://products.negurosu.co.jp/', 180
FROM manufacturers m, material_categories c
WHERE m.name = 'ネグロス電工' AND c.name = '一般支持金具'
  AND NOT EXISTS (SELECT 1 FROM materials WHERE model_number = 'DH1');

-- ここまで --
