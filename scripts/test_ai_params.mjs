import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

const extractParametersWithAI = async (query) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: `電設資材・建築資材の専門検索AIです。ユーザーのクエリから検索パラメータを抽出してください。JSON形式で返答してください。`
  });

  const prompt = `以下の検索クエリから条件を抽出してください。
【クエリ】${query}
`;

  try {
    const result = await model.generateContent(prompt);
    console.log(result.response.text());
  } catch (error) {
    console.error("AI Params Error:", error);
  }
};

extractParametersWithAI('鉄骨にケーブルを指示する金具');
