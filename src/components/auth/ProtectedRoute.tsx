import { useEffect, useState } from "react"
import { Navigate, Outlet, useLocation } from "react-router-dom"
import { supabase } from "../../lib/supabase"
import { Loader2 } from "lucide-react"

export default function ProtectedRoute() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkSession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      checkSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkSession = async (currentSession: any) => {
    if (!currentSession) {
      setSession(null)
      setLoading(false)
      return
    }

    const email = currentSession.user.email
    if (email && email.endsWith('@hitec-inc.co.jp')) {
      setSession(currentSession)
      setErrorMsg(null)
    } else {
      // 指定ドメイン以外はログアウトさせる
      await supabase.auth.signOut()
      setSession(null)
      setErrorMsg('hitec-inc.co.jp ドメインのGoogleアカウントでログインしてください。')
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) {
    const searchParams = new URLSearchParams()
    if (errorMsg) {
      searchParams.set('error', errorMsg)
    }
    searchParams.set('redirectTo', location.pathname + location.search)
    return <Navigate to={`/login?${searchParams.toString()}`} replace />
  }

  return <Outlet />
}
