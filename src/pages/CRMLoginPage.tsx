import { useState } from 'react'
import { getSupabaseClient } from '../lib/supabase'
import { restoreSession, type Account } from '../lib/accountStore'

interface Props {
  onLogin: (account: Account) => void
}

export default function CRMLoginPage({ onLogin }: Props) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw new Error(signInError.message)
      const account = await restoreSession()
      if (!account || account.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('Accès réservé aux administrateurs.')
      }
      onLogin(account)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f8ff] px-4">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-6rem] h-[24rem] w-[40rem] -translate-x-1/2 rounded-full bg-blue-200/25 blur-[80px]" />
      </div>

      <div className="mb-8 text-center">
        <span className="text-3xl font-extrabold tracking-tight text-[#1B54FF]">trouvé!</span>
        <p className="mt-1 text-sm font-medium text-slate-400 tracking-widest uppercase">CRM Admin</p>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-8 shadow-xl">
        <h1 className="text-xl font-bold text-slate-800 mb-6">Connexion</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="admin@trouve.fr"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 outline-none focus:border-[#1B54FF] focus:ring-2 focus:ring-[#1B54FF]/10"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-300 outline-none focus:border-[#1B54FF] focus:ring-2 focus:ring-[#1B54FF]/10"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#1B54FF] py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1545d4] disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
