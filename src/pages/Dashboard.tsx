import { Construction } from "lucide-react"

export default function Dashboard() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 p-8">
      <div className="bg-amber-100 p-6 rounded-full mb-4">
        <Construction className="w-16 h-16 text-amber-600" />
      </div>
      <h2 className="text-2xl font-bold text-foreground">ただいま準備中です</h2>
      <p className="text-center max-w-md leading-relaxed">
        ダッシュボード機能は現在開発中です。<br />
        試験運用によるフィードバックを反映後、正式リリース予定です。
      </p>
    </div>
  )
}
