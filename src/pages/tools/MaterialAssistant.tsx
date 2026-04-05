import { useState, useRef, useEffect } from "react";
import { Send, Camera, Bot, User, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

type MessageNode = {
  id: string;
  role: "assistant" | "user";
  text: string;
  imageUrl?: string;
  catalogs?: any[];
};

export default function MaterialAssistant() {
  const [messages, setMessages] = useState<MessageNode[]>([
    {
      id: "msg_1",
      role: "assistant",
      text: "こんにちは！AI材料アシスタントのAnnです。\n「H鋼に配管したい」「この壁面に固定したい」など、現場の状況をテキストで教えてください。データベースにある実物カタログ情報から最適な支持金具をご提案します！",
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setUploadPreview(url);
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() && !uploadPreview) return;

    // ユーザーの書き込みを追加
    const userText = inputValue.trim();
    const userMsg: MessageNode = {
      id: Date.now().toString(),
      role: "user",
      text: userText,
      imageUrl: uploadPreview || undefined,
    };
    
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setUploadPreview(null);
    setIsTyping(true);

    try {
      // 1. Supabaseからカタログデータを全件取得（簡易RAG）
      const { data: dbMaterials, error } = await supabase
        .from('materials')
        .select(`*, manufacturers(name), material_categories(name)`);
      
      if (error) throw error;

      // 2. AI用のナレッジベース構築
      let knowledgeBase = "【自社でよく使用する材料カタログ（データベース）】\n";
      dbMaterials?.forEach(m => {
          const maker = m.manufacturers?.name || '不明';
          knowledgeBase += `[型番: ${m.model_number}]\n`;
          knowledgeBase += `- メーカー: ${maker}\n`;
          knowledgeBase += `- 製品名: ${m.name}\n`;
          knowledgeBase += `- 用途: ${m.description}\n`;
          knowledgeBase += `- 定価: ${m.standard_price ? m.standard_price + '円' : '不明'}\n`;
          knowledgeBase += `-----\n`;
      });

      const systemPrompt = `あなたは建設・電気工事の職人さんをサポートするAIアシスタント「Ann」です。
以下の【自社でよく使用する材料カタログ】の情報を最優先して回答してください。

${knowledgeBase}

【ユーザーからの質問】
${userText}

【厳守する出力形式（JSON構造）】
あなたは必ず以下のJSONフォーマットで回答を出力してください。Markdownブロック(\`\`\`json)などは付けずに純粋な波括弧から始まるJSONを返してください。
{
  "reply": "ユーザーに対する挨拶、回答文、金具の仕様解説など（改行なども含めてOK）",
  "suggested_model_numbers": ["提案したい型番1", "提案したい型番2"] 
}

【会話のトーンとルール】
- 自分の名前（「アンです」等）は名乗らないでください。すぐに本題に入ってください。
- ユーザーを「職人さん」と呼ぶのではなく、自然な「お疲れ様です！」等の声かけにしてください。
- カタログにある型番を提案する場合は、仕様や定価も教えてあげてください。`;

      // 3. Gemini 2.5 Flash API呼び出し (フロントエンドで直接実行)
      const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
      if (!apiKey) throw new Error("APIキーが設定されていません");

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const res = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json" // JSONで確実に出力させる
          }
        })
      });

      if (!res.ok) throw new Error(await res.text());

      const aiData = await res.json();
      const aiResponseText = aiData.candidates[0].content.parts[0].text;
      
      // JSONをパース
      const parsedRes = JSON.parse(aiResponseText);
      const replyMessage = parsedRes.reply || "うまく答えられませんでした。";
      const suggestedIds = parsedRes.suggested_model_numbers || [];

        // 4. 提案された型番(model_number)を使って、フロントエンド側のカタログ情報とマッチングさせる
      const suggestedCatalogs = dbMaterials?.filter(m => suggestedIds.includes(m.model_number)).map(m => {
        const manufacturerName = m.manufacturers?.name || '不明';
        
        // カタログURLの優先処理: DBにGoogleドライブリンク(catalog_url)があれば最優先
        let targetUrl = m.catalog_url;
        if (!targetUrl) {
          // なければフォールバックとしてGoogle検索へ
          const searchQuery = encodeURIComponent(`${manufacturerName} ${m.model_number} カタログ`);
          targetUrl = `https://www.google.com/search?q=${searchQuery}`;
        }

        return {
          id: m.id,
          manufacturer: manufacturerName,
          modelNumber: m.model_number,
          name: m.name,
          description: m.description,
          imageUrl: m.image_url || "https://dummyimage.com/200x200/e2e8f0/64748b.png&text=No+Image",
          price: m.standard_price ? `¥${m.standard_price}` : undefined,
          url: targetUrl
        };
      }) || [];

      // 5. 画面にAIの回答を追加
      setMessages((prev) => [...prev, { 
        id: Date.now().toString(), 
        role: "assistant", 
        text: replyMessage,
        catalogs: suggestedCatalogs.length > 0 ? suggestedCatalogs : undefined
      }]);

    } catch (err) {
      console.error("AI処理エラー:", err);
      setMessages((prev) => [...prev, { 
        id: Date.now().toString(), 
        role: "assistant", 
        text: "申し訳ありません、サーバーの通信中（AI思考中）にエラーが発生しました。" 
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto align-middle relative">
      {/* ヘッダー */}
      <div className="bg-white dark:bg-slate-900 border-b p-4 sm:p-5 flex items-center justify-between shadow-sm sticky top-0 z-10 rounded-t-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/50 flex items-center justify-center rounded-xl border border-green-200 dark:border-green-800">
             <Bot className="w-6 h-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">AI 現場材料アシスタント</h1>
            <p className="text-[11px] text-slate-500 font-medium">現場状況から最適な支持金具を推測し、データベースから検索します</p>
          </div>
        </div>
      </div>

      {/* チャットエリア */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50 dark:bg-slate-950/50">
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0 mr-3 mt-1 shadow-sm">
                 <Bot className="w-5 h-5 text-white" />
              </div>
            )}
            
            <div className={`max-w-[85%] md:max-w-[75%] flex flex-col gap-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              
              {/* テキストとアップロード画像 */}
              <div className={`p-4 rounded-2xl shadow-sm text-[15px] leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-tl-sm'
              }`}>
                {msg.text}
              </div>

              {/* カタログカードエリア (サグジェストされた場合) */}
              {msg.catalogs && msg.catalogs.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-2">
                  {msg.catalogs.map(catalog => {
                    const CardWrapper = catalog.url ? 'a' : 'div';
                    const wrapperProps = catalog.url ? { href: catalog.url, target: "_blank", rel: "noopener noreferrer" } : {};
                    
                    return (
                    <CardWrapper 
                      key={catalog.id} 
                      {...wrapperProps}
                      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow group flex flex-col cursor-pointer"
                    >
                      <div className="h-32 bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                        <img src={catalog.imageUrl} alt={catalog.name} className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-normal transform group-hover:scale-105 transition-transform duration-500" />
                        <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-md">
                          {catalog.manufacturer}
                        </div>
                      </div>
                      <div className="p-3 flex flex-col flex-1">
                        <div className="text-[11px] font-bold text-blue-600 mb-1 flex items-center justify-between">
                          {catalog.modelNumber}
                          {catalog.url && <span className="text-[9px] font-normal text-slate-400">カタログ ↗</span>}
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">{catalog.name}</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{catalog.description}</p>
                        {catalog.price && (
                           <div className="mt-auto pt-3 flex justify-between items-end">
                              <span className="text-xs text-slate-400 font-medium">参考価格</span>
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{catalog.price}</span>
                           </div>
                        )}
                      </div>
                    </CardWrapper>
                    );
                  })}
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-700 flex items-center justify-center shrink-0 ml-3 mt-1 overflow-hidden shadow-sm">
                 <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </div>
            )}
          </div>
        ))}
        
        {/* ローディング表示 */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shrink-0 mr-3 mt-1 shadow-sm">
               <Bot className="w-5 h-5 text-white" />
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-green-600 animate-spin" />
              <div className="flex flex-col">
                 <span className="text-sm font-bold text-green-700 dark:text-green-400">AIがデータベースを検索・思考中...</span>
                 <span className="text-[11px] text-slate-500">Gemini 2.5 Flashと連携しています</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-4" />
      </div>

      {/* 入力エリア */}
      <div className="bg-white dark:bg-slate-900 border-t p-3 sm:p-4 rounded-b-xl">
        {uploadPreview && (
          <div className="mb-3 relative inline-block">
            <img src={uploadPreview} alt="Preview" className="h-16 w-16 object-cover rounded-lg border shadow-sm" />
            <button 
              onClick={() => setUploadPreview(null)}
              className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold ring-2 ring-white"
            >
              ×
            </button>
          </div>
        )}
        
        <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 rounded-2xl p-2 border border-transparent focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 transition-all">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors shrink-0"
            title="現場写真のアップロード"
          >
            <Camera className="w-5 h-5" />
          </button>
          
          <textarea 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="「H鋼にVE16を這わせたい」「未来工業の青色で安いもの」..."
            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none max-h-32 min-h-[44px] py-3 px-2 text-sm"
            rows={1}
            autoFocus
          />
          
          <button 
            onClick={handleSend}
            disabled={!inputValue.trim() && !uploadPreview}
            className={`p-3 rounded-xl transition-all shrink-0 shadow-sm ${
              inputValue.trim() || uploadPreview 
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30' 
                : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-2">
          現場の制約事項や好みのメーカーを入力するとAIが考慮します。（Shift+Enterで改行）
        </p>
      </div>
    </div>
  );
}
