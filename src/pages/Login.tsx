import { useState, useEffect } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { Loader2, AlertCircle } from "lucide-react"
import logoImg from "../assets/logo.png"

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<any>(null)
  const [initialCheck, setInitialCheck] = useState(true)
  const location = useLocation()
  
  const searchParams = new URLSearchParams(location.search)
  const errorMsg = searchParams.get('error')
  const redirectTo = searchParams.get('redirectTo') || '/'

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user.email?.endsWith('@hitec-inc.co.jp')) {
        setSession(session)
      } else if (session) {
        // もしログイン済みだが別ドメインだった場合は再度ログアウトさせる（念のため）
        supabase.auth.signOut()
      }
      setInitialCheck(false)
    })
  }, [])

  const handleGoogleLogin = async () => {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${redirectTo !== '/' ? redirectTo : ''}`
      }
    })
    
    if (error) {
      alert("ログインエラー: " + error.message)
      setLoading(false)
    }
  }

  if (initialCheck) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    )
  }

  // 既に正しいドメインでログイン中の場合はリダイレクト元（またはホーム）へ飛ばす
  if (session) {
    return <Navigate to={redirectTo} replace />
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md bg-card p-10 rounded-2xl shadow-sm border border-border/50 flex flex-col items-center space-y-8">
        <div className="text-center space-y-4">
          <img src={logoImg} alt="HITEC Logo" className="h-[72px] mx-auto object-contain drop-shadow-sm" />
          <div className="pt-2">
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 pb-1">
              HITEC ポータルサイト
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              社内アカウント（@hitec-inc.co.jp）でログインしてください
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="w-full flex items-start gap-3 bg-red-50 text-red-600 text-sm p-4 rounded-lg border border-red-200 shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="font-medium">{errorMsg}</p>
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full h-12 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 border-2 border-gray-200 rounded-xl shadow-sm font-medium transition-all disabled:opacity-50 hover:border-gray-300 hover:shadow"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          ) : (
            <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Googleでログイン
            </>
          )}
        </button>

        {import.meta.env.MODE === 'development' && (
             <button
                type="button"
                onClick={async () => {
                    const testEmail = 'test@hitec-inc.co.jp';
                    const testPassword = 'password123';
                    
                    let { error } = await supabase.auth.signInWithPassword({
                        email: testEmail,
                        password: testPassword
                    });
                    
                    // If invalid credentials, meaning user might not exist, try to sign up
                    if (error && error.message === 'Invalid login credentials') {
                        const { error: signUpError } = await supabase.auth.signUp({
                            email: testEmail,
                            password: testPassword,
                        });
                        
                        if (!signUpError) {
                            // Retry login after successful signup
                             const { error: retryError } = await supabase.auth.signInWithPassword({
                                email: testEmail,
                                password: testPassword
                            });
                            error = retryError;
                        } else {
                            error = signUpError;
                        }
                    }

                    if (error) alert("Dev login error: " + error.message);
                }}
                className="w-full h-12 mt-4 flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all"
            >
                テスト用ユーザーとしてログイン (開発環境のみ)
            </button>
        )}
      </div>
    </div>
  )
}
