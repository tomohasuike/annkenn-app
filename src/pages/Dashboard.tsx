import { Construction, ShieldCheck } from "lucide-react"
import { useNavigate } from "react-router-dom"

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-6 p-8">
      
      {/* 緊急時用の安否確認ボタン (目立つように配置) */}
      <button 
        onClick={() => navigate('/safety-report')}
        className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-8 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3 animate-pulse"
      >
        <ShieldCheck size={28} />
        <span className="text-xl">緊急安否報告はこちら</span>
      </button>

      <div className="bg-amber-100 p-6 rounded-full mb-4 mt-8">
        <Construction className="w-16 h-16 text-amber-600" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">ダッシュボード準備中</h2>
      <p className="text-center max-w-md leading-relaxed">
        各機能のデータ集計ダッシュボードは現在開発中です。<br />
      </p>
    </div>
  )
}
