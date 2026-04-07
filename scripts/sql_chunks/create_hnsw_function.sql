-- 既存の関数を削除
DROP FUNCTION IF EXISTS match_materials;

-- 新しい関数を作成（halfvec対応）
CREATE OR REPLACE FUNCTION match_materials(
    query_embedding vector(3072),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id integer,
    product_name text,
    model_number text,
    manufacturer_id integer,
    price text,
    file_path text,
    image_url text,
    page_content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id,
        m.product_name,
        m.model_number,
        m.manufacturer_id,
        m.price,
        m.file_path,
        m.image_url,
        m.page_content,
        -- コサイン類似度の計算（ベクトルをhalfvecにキャストして検索を高速化）
        1 - (m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
    FROM materials m
    WHERE 
        m.embedding IS NOT NULL AND 
        (1 - (m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072))) > match_threshold
    ORDER BY m.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
    LIMIT match_count;
END;
$$;
