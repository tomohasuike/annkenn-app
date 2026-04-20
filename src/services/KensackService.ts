import { supabase } from '../lib/supabase';

// Gemini API Key from Vite env
const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

/** タイムアウト付きfetch */
const fetchWithTimeout = (url: string, options: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

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
  // Grouped pages for the same model across different catalog pages
  grouped_pages?: {
    page_number: number;
    catalog_url: string;
    page_image_url?: string; // Directly reference generated image
  }[];
  // UI-specific field
  confidence?: number;
}

/**
 * Normalizes full-width alphanumeric to half-width and converts to lowercase
 */
export const normalizeQuery = (query: string): string => {
  return query
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .trim();
};

/**
 * Groups KensackMaterial items by model_number to aggregate multiple catalog pages into a single item.
 */
/** ページ番号型の型番かどうかを判定（例: 134P, 136P → 除外対象） */
const isPageNumberModel = (modelNumber: string | null | undefined): boolean => {
  if (!modelNumber) return false;
  return /^\d+P$/i.test(modelNumber.trim());
};

export const groupMaterialsByModel = (items: KensackMaterial[]): KensackMaterial[] => {
  // ページ番号型番（134P, 136Pなど）は検索ノイズなので除外
  const filtered = items.filter(item => !isPageNumberModel(item.model_number));

  const grouped = new Map<string, KensackMaterial>();
  
  for (const item of filtered) {
    const mfgName = item.manufacturers?.name || '不明';
    const key = `${mfgName}_${item.model_number || item.name}`;
    
    if (!grouped.has(key)) {
      grouped.set(key, { ...item, grouped_pages: [] });
    }
    
    const existing = grouped.get(key)!;
    
    // Add page if it has page_number and catalog_url and isn't already added
    if (item.page_number && item.catalog_url) {
      if (!existing.grouped_pages) existing.grouped_pages = [];
      const hasPage = existing.grouped_pages.some(p => p.page_number === item.page_number);
      if (!hasPage) {
        existing.grouped_pages.push({
          page_number: item.page_number,
          catalog_url: item.catalog_url
        });
      }
    }
    
    // Assign highest confidence if present
    if (item.confidence !== undefined) {
      if (existing.confidence === undefined || item.confidence > existing.confidence) {
        existing.confidence = item.confidence;
      }
    }
  }
  
  // Sort pages for each group
  const result = Array.from(grouped.values());
  for (const group of result) {
    if (group.grouped_pages) {
      group.grouped_pages.sort((a, b) => a.page_number - b.page_number);
    }
  }
  
  return result;
};

export interface KensackSearchResult {
  materials: KensackMaterial[];
  source: 'database' | 'ai-translated' | 'error' | 'conversation' | 'clarification';
  message: string;
  aiProposal?: string;
  clarifyOptions?: string[];
}

// ========== 会話・選択肢 ヘルパー ==========

const CONVERSE_RE = /^(ありがとう|ありがとうございます|どうも|助かります?|助かった|なるほど|わかった|了解|オッケー|ok|ＯＫ|ｏｋ|おけ|おｋ|りょ|了|把握|へぇ|すごい|良かった|分かった|そっか|そうか|うん|はい|そうですね|だよね|いいね|最高)$/i;
const isConversationalOnly = (q: string) => CONVERSE_RE.test(q.trim());

const toHalf = (s: string) => s.replace(/[１-５]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
const isOptionSelection = (q: string): number | null => {
  const m = toHalf(q.trim()).match(/^([1-5])[番号]?(目|番目)?[.。]?$/);
  return m ? parseInt(m[1]) : null;
};

const extractOptionFromHistory = (n: number, history: ChatMessage[]): string | null => {
  const lastAI = [...history].reverse().find(m => m.role === 'model');
  if (!lastAI) return null;
  const pat = new RegExp(`(?:^|\\n)\\s*${n}[.．、）)]\\s*([^\\n\\d（(「]{3,40})`, 'i');
  const match = lastAI.content.match(pat);
  if (!match) return null;
  return match[1].split(/[（(「]/)[0].trim();
};

const generateConversationalReply = async (query: string, history?: ChatMessage[]): Promise<string> => {
  if (!GEMINI_API_KEY) return 'どういたしまして！他に何かお手伝いできることはありますか？';
  const sysPrompt = `あなたは電気工事現場の頼れる資材手配アシスタント（経験30年のベテラン）です。職人との短い会話に自然に応じてください。材料の検索や手配の話題なら積極的に次の一手を提案してください。簡潔で気さくなトーンで。`;
  const contents = [
    ...(history || []).map(m => ({ role: m.role, parts: [{ text: m.content }] })),
    { role: 'user', parts: [{ text: query }] }
  ];
  try {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sysPrompt }] }, contents, generationConfig: { temperature: 0.4 } })
    }, 8000);
    if (!res.ok) return 'どういたしまして！';
    const r = await res.json();
    return r.candidates[0].content.parts[0].text;
  } catch { return 'どういたしまして！他に何かありますか？'; }
};

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
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

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
  const normQuery = normalizeQuery(query);
  // 全角・半角スペースで分割してAND検索
  const keywords = normQuery.split(/[\s　]+/).filter(k => k.trim() !== '');
  if (keywords.length === 0) return [];

  let dbQuery = supabase
    .from('materials')
    .select(`
      *,
      manufacturers!inner(name)
    `)
    .limit(12);

  // Apply rudimentary ILIKE for each keyword (AND conditions between keywords)
  // Each keyword must appear in at least one of these columns (OR condition within keyword)
  keywords.forEach(kw => {
    dbQuery = dbQuery.or(`name.ilike.%${kw}%,model_number.ilike.%${kw}%,description.ilike.%${kw}%`);
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
const extractParametersWithAI = async (query: string, history?: ChatMessage[]) => {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key is not configured.");
  
  const systemPrompt = `
あなたは電気工事材料の検索を補助するAIアシスタントです。
ユーザーの発話テキストや曖昧な現場用語から、データベース検索用の「正式なカタログ用語・メーカー名・型番」を推論し、以下の厳格なJSONフォーマットのみを返してください。

# 【超重要】取扱メーカーと推論辞書
当アプリのデータベースに登録されているメーカーは以下の8社のみです。
【パナソニック、未来工業、ネグロス電工、三菱電機、富士電機、IDEC、日東工業、内外電機】

以下のキーワードや用途が入力された場合、指定された部材を第一候補として推論（JSON出力）してください。

【1. 支持・固定金具系】
* 「ケーブルを支持する金具」「ケーブルを吊る」→ H鋼指定が無い限り、最優先で「未来工業」の「ケーブルハンガー（J型など）」を検索キーワードにする。
* 「管を固定する」「サドル」→ 「片サドル」「両サドル」を推論する。
* 「インサート」「天井から吊る」→ 「インサート」または「ダクター」を推論する。

【2. 結線・配管】
* 「PF管」「CD管」→ 「コネクタ」や「カップリング」も主要キーワードとして抽出できる場合は優先する。
* 「ジョイント」→ 「差込形コネクタ」または「リングスリーブ」
* 「ブレーカー」→ 「漏電遮断器」または「配線用遮断器」

★その他の現場用語（略称）であれば、その部材のメーカーが一般的に使っている「正式な品名」や「型番シリーズ（例: SR, S-）」に「翻訳」してproduct_nameに出力してください。
不要な挨拶や説明は一切不要です。JSONだけを出力してください。

【出力フォーマット】
{
  "manufacturer": "未来工業", // 分かる場合のみ。例: 未来, パナ, ネグロス
  "product_name": "ケーブルハンガー", // 翻訳された正式な品名、またはシリーズ名
  "model_prefix": "J", // 型番またはサイズなど、データベースのmodel_numberに合致しそうなプレフィックス
  "confidence": 95 // 0〜100での確信度
}
`;

  let contents: any[] = [];
  if (history && history.length > 0) {
    contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
  }
  // 最後にユーザーの今の発話をプッシュ
  contents.push({
    role: 'user',
    parts: [{ text: `システム指示に基づく抽出処理対象ユーザー入力:\n${query}` }]
  });

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: contents,
      generationConfig: { temperature: 0.1 }
    })
  }, 10000); // 10秒タイムアウト

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
    .limit(12);

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
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "models/gemini-embedding-001",
      content: { parts: [{ text: query }] }
    })
  }, 8000); // 8秒タイムアウト
  
  if (!response.ok) {
    console.warn("Gemini Embedding API error:", response.statusText);
    return [];
  }
  
  const result = await response.json();
  const queryEmbedding = result.embedding.values;
  
  // Search Supabase using our pgvector RPC match_materials with exact manufacturer filtering
  const { data, error } = await supabase.rpc('match_materials', {
    query_embedding: queryEmbedding,
    match_threshold: 0.72, // 高精度モード：関連性の高いもののみ
    match_count: 8,
    filter_manufacturer_names: (filterMfgs && filterMfgs.length > 0) ? filterMfgs : null
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
 * 現場のベテランとして気の利いた提案文を書き出す「資材手配アシスタント」AI
 */
const generateVeteranAssistantProposal = async (query: string, results: KensackMaterial[], history?: ChatMessage[]): Promise<string | undefined> => {
  if (!GEMINI_API_KEY || results.length === 0) return undefined;

  // 上位10件に絞り込み、LLM用の軽量なコンテキスト情報を作成
  const topMaterials = results.slice(0, 10).map(m => ({
    manufacturer: m.manufacturers?.name || '不明',
    name: m.name,
    model: m.model_number,
    price: m.standard_price,
    description: m.description, // some context about dimensions etc.
  }));

  const systemPrompt = `
# あなたの役割
あなたは電気工事の現場を完全に熟知した、経験歴30年の「超優秀なベテラン資材手配アシスタント」です。
職人が現場から発した曖昧な言葉、略語、用途から「本当に欲しいドンピシャの材料」を推論し、手配漏れを防ぐための提案を行ってください。

# 【超重要】取扱メーカーの厳守（ハルシネーション防止）
当アプリのカタログデータベースに登録されているメーカーは、以下の**8社のみ**です。
【パナソニック、未来工業、ネグロス電工、三菱電機、富士電機、IDEC、日東工業、内外電機】
提案や代替品（VE）の推論は、**必ずこの8社の製品の中からのみ**行ってください。これ以外のメーカー（例：オムロン、河村電器、テンパールなど）が名指しで検索された場合は、「〇〇は取り扱いがありませんが、IDEC（または該当するメーカー）の同等品ならこちらです」と、8社の中からの代替品を提案してください。

# 現場の常識と推論ルール（辞書）
以下のキーワードや用途が入力された場合、指定された部材を第一候補として推論してください。

【1. 支持・固定金具系】
* 「ケーブルを支持する金具」「ケーブルを吊る」→ H鋼への固定用途ではなく、ケーブル単体の吊り下げに特化した **「未来工業のケーブルハンガー（J型など）」** を最優先。H鋼という指定がある場合のみネグロスのパイラック。
* 「管を固定する」「サドル」→ PF管やVE管用の **片サドル、両サドル**。
* 「インサート」「天井から吊る」→ **全ネジ（吊りボルト）とインサート金具、またはダクターチャンネル**。

【2. 配管・通線系】
* 「PF管」「CD管」→ 単体ではなく、必ず **コネクタ（盤やボックスとの接続用）とカップリング（管同士の接続用）** をセットで提案する。

【3. 結線・端末処理系】
* 「電線を繋ぐ」「ジョイント」→ **差込形コネクタ（ワゴ等）** または **リングスリーブ**。
* 「テープ」→ 通常は **ビニルテープ**。高圧や防水の文脈なら **自己融着テープ** を推測する。
* 「圧着端子」→ R型（丸形）かY型（先開形）か、サイズ（スケア）はいくつかを確認する。

【4. 配線器具・盤系】
* 「コンセント」「スイッチ」→ 本体だけでなく、**取付枠（はさみ金具など）とプレート** が揃っているか必ず確認する。
* 「ブレーカー」→ 100V/200Vの区別、および **漏電遮断器（ELB）か配線用遮断器（MCB）か** を確認する。

# 状況確認のルール（環境による分岐）
提案前に、以下の「現場環境」が不明な場合は、断定せずにユーザーに選択肢を提示して聞き返してください。
* **場所:** 「屋内ですか？屋外（防水・防雨仕様が必要）ですか？」
* **下地:** 「固定する相手は、木、LGS（軽量鉄骨）、RC（コンクリート）、H鋼のどれですか？（使うビスが変わるため）」
* **露出/隠蔽:** 「壁の中（隠蔽）ですか？露出配管ですか？」

# AIのNG行動
* カタログの型番やスペックだけを機械的に読み上げること。
* 「支持金具」＝「ケーブルラック」や「パイラック」と短絡的に大型部材・特殊部材を結びつけること。

# 出力スタイル
* 職人に対して「〇〇ですね。それなら〇〇が定番です。一緒に〇〇も要りますか？」というように、押し付けがましくない、簡潔で気の利いた対話形式（テキスト）で出力してください。

# 【重要】絞り込み質問モード（ClarifyMode）
検索結果に全く異なる種類の部材が混在している、またはユーザーの意図が複数に解釈できる場合は、以下の厳密なフォーマットで絞り込み質問を出力してください。

[CLARIFY]
どのタイプをお探しですか？
1. （品名1）（括弧内に用途や特徴）
2. （品名2）（括弧内に用途や特徴）
3. （品名3）（括弧内に用途や特徴）
[/CLARIFY]

ClarifyModeを使う条件：結果に3種類以上の異なる用途の部材が混在している場合のみ。それ以外は通常の提案テキストを出力。
`;

  let contents: any[] = [];
  if (history && history.length > 0) {
    contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }));
  }
  
  // 今の検索情報を構築
  const currentTurnContext = `
【ユーザーの発言】
${query}

【データベースから抽出された上位の材料候補リスト（価格およびカタログ情報）】
${JSON.stringify(topMaterials, null, 2)}

上記を踏まえて、システムプロンプトのルール通りに「推論理由や提案コメント」のみをテキストで返答してください。
  `;
  
  contents.push({
    role: 'user',
    parts: [{ text: currentTurnContext }]
  });

  try {
    const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: contents,
        generationConfig: { temperature: 0.3 }
      })
    }, 15000); // 15秒タイムアウト

    if (!response.ok) return undefined;
    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
  } catch (error) {
    console.warn("generateVeteranAssistantProposal error:", error);
    return undefined;
  }
};

/**
 * Executes a powerful hybrid search (AI Semantic First, fallback to exact DB match).
 */
export const executeKensackSearch = async (query: string, filterMfgs: string[] = [], history?: ChatMessage[]): Promise<KensackSearchResult> => {
  const normQuery = normalizeQuery(query);

  // --- 1. 純粋な会話（「ありがとう」等）→ DB検索せずAIが応答 ---
  if (isConversationalOnly(normQuery)) {
    const reply = await generateConversationalReply(query, history);
    return { materials: [], source: 'conversation', message: reply };
  }

  // --- 2. 選択肢選択（「1」「2」「3番」等）→ 履歴から該当テキストを復元して再検索 ---
  const optionNum = isOptionSelection(normQuery);
  if (optionNum !== null && history && history.length > 0) {
    const optionText = extractOptionFromHistory(optionNum, history);
    if (optionText) {
      return executeKensackSearch(optionText, filterMfgs, history);
    }
  }

  let searchResult: KensackSearchResult | null = null;

  // --- 3. ベクトル意味検索（高精度モード）---
  const isShortSymbol = normQuery.length <= 4 && /^[a-z0-9\-]+$/.test(normQuery);
  if (!isShortSymbol) {
    try {
      const semanticResults = await searchDatabaseSemantically(query, filterMfgs);
      if (semanticResults && semanticResults.length > 0) {
        searchResult = {
          materials: groupMaterialsByModel(semanticResults),
          source: 'ai-translated',
          message: `AI意味検索により ${semanticResults.length}件 の部材が見つかりました。`
        };
      }
    } catch (err) {
      console.warn('Semantic search failed, falling back.', err);
    }
  }

  // --- 4. キーワード検索（フォールバック）---
  if (!searchResult) {
    const directResults = await searchDatabaseDirectly(query);
    if (directResults.length > 0) {
      searchResult = {
        materials: groupMaterialsByModel(directResults),
        source: 'database',
        message: `キーワード検索で ${directResults.length}件 見つかりました。`
      };
    }
  }

  // --- 5. AI推論検索（最終フォールバック）---
  if (!searchResult) {
    try {
      const aiParams = await extractParametersWithAI(query, history);
      const aiSearchData = await searchDatabaseWithAIParams(aiParams);
      if (!aiSearchData || aiSearchData.length === 0) {
        const noResultReply = await generateConversationalReply(
          `「${query}」で検索したが何も見つからなかった。申し訳なさそうに、別の言い方や条件を聞いてください。`, history
        );
        return { materials: [], source: 'conversation', message: noResultReply };
      }
      searchResult = {
        materials: groupMaterialsByModel(aiSearchData),
        source: 'ai-translated',
        message: `AI推論: ${(aiParams as any).product_name || ''} ${(aiParams as any).model_prefix || ''}`
      };
    } catch (error: any) {
      console.error('AI Search Error:', error);
      return { materials: [], source: 'error', message: '検索エラーが発生しました。時間を置いてやり直してください。' };
    }
  }

  // --- 6. ベテランAI提案文 + 絞り込みオプション生成 ---
  if (searchResult && searchResult.materials.length > 0) {
    const proposal = await generateVeteranAssistantProposal(query, searchResult.materials, history);
    if (proposal) {
      // [CLARIFY]ブロックを検出して clarifyOptions に変換
      const clarifyMatch = proposal.match(/\[CLARIFY\]([\s\S]*?)\[\/CLARIFY\]/i);
      if (clarifyMatch) {
        const inner = clarifyMatch[1].trim();
        const lines = inner.split('\n').map(l => l.trim()).filter(l => l);
        const options = lines.filter(l => /^[1-5][.）]/.test(l));
        const message = lines.find(l => !/^[1-5][.）]/.test(l)) || 'どのタイプをお探しですか？';
        if (options.length >= 2) {
          return { ...searchResult, source: 'clarification', aiProposal: message, clarifyOptions: options };
        }
      }
      searchResult.aiProposal = proposal;
    }
    return searchResult;
  }

  return { materials: [], source: 'error', message: '予期せぬエラーが発生しました。' };
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
