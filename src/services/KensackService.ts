import { supabase } from '../lib/supabase';

// Gemini API Key from Vite env
const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

export interface KensackMaterial {
  id: string;
  manufacturer_id: string;
  model_number: string;
  name: string;
  description: string;
  standard_price: number | null;
  image_url: string;
  catalog_url: string;
  width_mm: number | null;
  height_mm: number | null;
  depth_mm: number | null;
  page_number: number | null;
  manufacturers?: {
    name: string;
  };
  // UI-specific field
  confidence?: number;
}

export interface KensackSearchResult {
  materials: KensackMaterial[];
  source: 'database' | 'ai-translated' | 'error';
  message: string;
}

export type CartItemType = 'catalog' | 'custom' | 'voice';

export interface CartItem {
  id: string; // unique identifier for the cart row
  type: CartItemType;
  name: string;
  model_number?: string;
  quantity: number;
  unit: string;
  price?: number;
  manufacturer?: string;
  material?: KensackMaterial; // if it's from catalog
}

/**
 * Voice input parser using Gemini AI. Takes raw transcript and structured array.
 */
export const parseVoiceToCartItems = async (transcript: string): Promise<CartItem[]> => {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured.");
  
  const systemPrompt = `
あなたは電気工事の現場アシスタントです。職人がマイクで喋った「必要な手配材料の一覧メモ」から、項目ごとに情報を抽出し、配列として出力してください。
例えば「VVFの2.0の3芯を100メートルと、プラロックのデカいやつ10個」であれば、VVFケーブルと、プラロックという2つのアイテムがあります。
入力: "${transcript}"

必ず以下のJSON形式の配列のみを出力すること。それ以外は絶対に出力しない。
[
  { "name": "正式名称に近い品名", "model": "型番やサイズ等の指定(あれば)", "quantity": 数量(数字のみ), "unit": "単位(m, 個, 本など)" }
]
  `;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: \${response.statusText}`);
  }

  const result = await response.json();
  let text = result.candidates[0].content.parts[0].text;
  
  // JSON配列部分だけを強引に抽出する
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("AIのレスポンスから配列が見つかりませんでした");
  }
  
  const parsed = JSON.parse(match[0]);
  
  return parsed.map((item: any) => ({
    id: 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    type: 'voice',
    name: item.name || '不明な材料',
    model_number: item.model || '',
    quantity: Number(item.quantity) || 1,
    unit: item.unit || '個',
  }));
};


/**
 * Executes a basic full-text search against the database.
 * Cost: Zero
 */
const searchDatabaseDirectly = async (query: string): Promise<KensackMaterial[]> => {
  // 全角・半角スペースで分割してAND検索
  const keywords = query.split(/[\s　]+/).filter(k => k.trim() !== '');
  if (keywords.length === 0) return [];

  let dbQuery = supabase
    .from('materials')
    .select(`
      *,
      manufacturers!inner(name)
    `)
    .limit(30);

  // Apply rudimentary ILIKE for each keyword (AND conditions between keywords)
  // Each keyword must appear in at least one of these columns (OR condition within keyword)
  keywords.forEach(kw => {
    dbQuery = dbQuery.or(`name.ilike.%${kw}%,model_number.ilike.%${kw}%,description.ilike.%${kw}%,manufacturers.name.ilike.%${kw}%`);
  });

  const { data, error } = await dbQuery;
  
  if (error) {
    console.warn("Direct DB Search Error:", error);
    return [];
  }
  return (data || []) as KensackMaterial[];
};

/**
 * Translates messy conversational/voice query into strict parameters using Gemini.
 * Cost: Very Low (One-shot, tiny output token count)
 */
const extractParametersWithAI = async (query: string) => {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured.");
  
  const systemPrompt = `
あなたは電気工事材料の検索を補助するAIアシスタントです。
ユーザーの発話テキストや曖昧な現場用語（例：「ケーブルラック」「ネグロス」など）から、データベース検索用の「正式なカタログ用語・メーカー名・型番」を推論し、以下の厳格なJSONフォーマットのみを返してください。
★重要: 現場用語（略称）であれば、その部材のメーカーが一般的に使っている「正式な品名」や「型番シリーズ（例: SR, S-）」に「翻訳」してproduct_nameに出力してください。
不要な挨拶や説明は一切不要です。JSONだけを出力してください。

【出力フォーマット】
{
  "manufacturer": "ネグロス電工", // 分かる場合のみ。例: 未来, パナ, ネグロス
  "product_name": "直線ラック", // 翻訳された正式な品名、またはシリーズ名
  "model_prefix": "SR", // 型番またはサイズなど、データベースのmodel_numberに合致しそうなプレフィックス
  "confidence": 95 // 0〜100での確信度
}

ユーザー入力: ${query}
`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: systemPrompt }] }],
      generationConfig: { temperature: 0.1 }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: ${response.statusText}`);
  }

  const result = await response.json();
  let text = result.candidates[0].content.parts[0].text;
  
  // Clean up any markdown json formatting
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();
  
  return JSON.parse(text);
};

/**
 * Searches the database using strict parameters parsed by AI.
 */
const searchDatabaseWithAIParams = async (params: any): Promise<KensackMaterial[]> => {
  let dbQuery = supabase
    .from('materials')
    .select(`*, manufacturers!inner(name)`)
    .limit(30);

  if (params.manufacturer) {
    // Exact or partial match on manufacturer relation
    dbQuery = dbQuery.ilike('manufacturers.name', `%${params.manufacturer}%`);
  }
  
  const orConditions = [];

  if (params.product_name) {
    const simplified = params.product_name.replace(/ラック/g, '').replace(/タイプ/g, '').trim();
    orConditions.push(`name.ilike.%${params.product_name}%`);
    orConditions.push(`description.ilike.%${params.product_name}%`);
    if(simplified) {
        orConditions.push(`name.ilike.%${simplified}%`);
        orConditions.push(`description.ilike.%${simplified}%`);
    }
  }
  
  if (params.model_prefix) {
    orConditions.push(`model_number.ilike.%${params.model_prefix}%`);
    orConditions.push(`name.ilike.%${params.model_prefix}%`);
  }

  if (orConditions.length > 0) {
    dbQuery = dbQuery.or(orConditions.join(','));
  }

  const { data, error } = await dbQuery;
  if (error) {
    console.warn("AI Params DB Search Error:", error);
    return [];
  }
  
  // Imbue confidence score from AI
  const records = (data || []) as KensackMaterial[];
  return records.map(r => ({ ...r, confidence: params.confidence || 100 }));
};

const searchDatabaseSemantically = async (query: string, filterMfgs?: string[]): Promise<KensackMaterial[]> => {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured.");
  
  // Generate meaning-based vector for the user's string query
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: query }] }
    })
  });
  
  if (!response.ok) {
    console.warn("Gemini Embedding API error:", response.statusText);
    return [];
  }
  
  const result = await response.json();
  const queryEmbedding = result.embedding.values;
  
  // Search Supabase using our pgvector RPC match_materials with exact manufacturer filtering
  const { data, error } = await supabase.rpc('match_materials', {
    query_embedding: queryEmbedding,
    match_threshold: 0.1, // Adjust based on precision needs
    match_count: 50,
    filter_manufacturer_names: (filterMfgs && filterMfgs.length > 0) ? filterMfgs : null // Pass filtering criteria directly to database!
  });
  
  if (error) {
    console.error("Supabase Vector RPC Error:", error);
    return [];
  }
  
  // Fetch manufacturer mapping to replace the hardcoded "データベースより"
  const { data: manufacturers } = await supabase.from('manufacturers').select('id, name');
  const mnfMap: Record<string, string> = {};
  if (manufacturers) {
    manufacturers.forEach(m => mnfMap[m.id] = m.name);
  }

  // We attach a confidence score generated from vector cosine similarity
  return (data || []).map((item: any) => ({
    ...item,
    manufacturers: item.manufacturer_id ? { name: mnfMap[item.manufacturer_id] || "不明なカタログ" } : undefined,
    confidence: Math.round(item.similarity * 100)
  })) as KensackMaterial[];
};

/**
 * Executes a powerful hybrid search (AI Semantic First, fallback to exact DB match).
 */
export const executeKensackSearch = async (query: string, filterMfgs?: string[]): Promise<KensackSearchResult> => {
  try {
    // 1. AI意味検索（ベクトル検索）を最初に実行。メーカー絞り込みがあればバックエンドに渡す
    const semanticResults = await searchDatabaseSemantically(query, filterMfgs);
    
    if (semanticResults && semanticResults.length > 0) {
      return {
        materials: semanticResults,
        source: 'ai-translated', // UI shows this as AI enhanced
        message: `AI意味検索により、文脈に沿った ${semanticResults.length}件 の部材が見つかりました。（全データの一部1000件でテスト運用中）`
      };
    }
  } catch (err) {
    console.warn("Semantic search failed or skipped, falling back to direct DB search.", err);
  }

  // 2. ベクトル側ヒットしなかった場合、または未エンベッドの残りのデータ対象にレガシーのDBを叩く
  const directResults = await searchDatabaseDirectly(query);
  if (directResults.length > 0) {
    return {
      materials: directResults,
      source: 'database',
      message: `キーワードに一致する ${directResults.length}件 の部材が見つかりました。(キーワード検索)`
    };
  }

  // 3. どちらも見つからない場合はAIによる推論フォールバック
  try {
    const aiParams = await extractParametersWithAI(query);
    const aiSearchData = await searchDatabaseWithAIParams(aiParams);
    if (!aiSearchData || aiSearchData.length === 0) {
      return {
        materials: [],
        source: 'ai-translated',
        message: '該当する材料は見つかりませんでした。'
      };
    }
    return {
      materials: aiSearchData,
      source: 'ai-translated',
      message: `AI推論による検索（推測: ${(aiParams as any).product_name || ''} ${(aiParams as any).model_prefix || ''}）`
    };
  } catch (error: any) {
    console.error("AI Search Error:", error);
    return { materials: [], source: 'error', message: '検索エラーが発生しました。時間を置いてやり直してください。' };
  }
};

/**
 * Parses an uploaded image using Gemini Vision to infer details about the construction material
 * and then executes a standard backend search.
 */
export const executeKensackVisionSearch = async (base64Data: string, mimeType: string): Promise<KensackSearchResult> => {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured.");

  const systemPrompt = `
あなたは電気工事材料の解析アシスタントです。
この画像に写っている電気工事の部材は何か？Supabaseデータベースで検索するための『検索キーワード（メーカー名、一般名称、型番の推測など）』を簡潔に出力せよ。そしてその理由も簡潔に添えよ。必ず以下の厳密なJSONフォーマットで回答すること：
{ 
  "keyword": "検索キーワード", 
  "reason": "AIの推測理由" 
}
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }],
        generationConfig: { temperature: 0.2 }
      })
    });

    if (!response.ok) {
        throw new Error(`Gemini Vision API Error: ${response.statusText}`);
    }

    const result = await response.json();
    let text = result.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(text);
    const keyword = parsed.keyword || '';
    const reason = parsed.reason || '不明な理由';

    if (!keyword) {
      return {
        materials: [],
        source: 'error',
        message: '画像から検索キーワードを特定できませんでした。'
      };
    }

    // AIが抽出したキーワードで通常の文字列検索を実行する
    const searchResult = await executeKensackSearch(keyword);

    // AIの推論理由をメッセージに上書きして返す
    return {
      ...searchResult,
      source: 'ai-translated',
      message: `AIの推測: ${reason} (検索キーワード: ${keyword})`
    };

  } catch (error: any) {
    console.error("AI Vision Search Error:", error);
    return {
      materials: [],
      source: 'error',
      message: '画像解析エラーが発生しました。別の画像を試すか、テキスト検索をお使いください。'
    };
  }
};
