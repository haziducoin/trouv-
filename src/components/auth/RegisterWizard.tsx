import { useState, useRef, useEffect, type FormEvent } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  User,
  UserCircle,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { isPersonalEmail } from '@/lib/accountStore'

// ─── Types ───────────────────────────────────────────────────────────────────
export interface WizardData {
  firstName:     string
  lastName:      string
  email:         string
  password:      string
  functionTitle: string
  company:       string
  siren:         string
  website:       string
}

interface Props {
  onComplete:    (data: WizardData) => void
  onBackToLogin: () => void
  initialEmail?: string
}

export const CGU_VERSION = '1.0'

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function getClientIP(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
    return ((await r.json()) as { ip: string }).ip
  } catch { return 'unknown' }
}

function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (pwd.length < 6) return { score: 0, label: 'Trop court', color: 'bg-red-400' }
  let score = 0
  if (pwd.length >= 8)  score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9!@#$%^&*]/.test(pwd)) score++
  const labels = ['Faible', 'Moyen', 'Fort', 'Excellent']
  const colors  = ['bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500']
  return { score: score as 0|1|2|3, label: labels[score], color: colors[score] }
}

// ─── Champ de saisie ─────────────────────────────────────────────────────────
function Field({
  label, value, onChange, type = 'text', placeholder = '', icon: Icon,
  error, hint, autoFocus = false, optional = false,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string
  icon: React.FC<{ size?: number; className?: string }>
  error?: string; hint?: string; autoFocus?: boolean; optional?: boolean
}) {
  const [showPwd, setShowPwd] = useState(false)
  const [touched, setTouched] = useState(false)
  const isPassword = type === 'password'
  const hasError = touched && error

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {optional && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal text-slate-400 dark:bg-slate-700">optionnel</span>}
      </label>
      <div className="relative">
        <Icon size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors ${hasError ? 'text-red-400' : 'text-slate-300'}`} />
        <input
          autoFocus={autoFocus}
          type={isPassword ? (showPwd ? 'text' : 'password') : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          className={`w-full rounded-xl border py-2.5 pl-9 ${isPassword ? 'pr-10' : 'pr-3'} text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-800 outline-none transition placeholder:text-slate-300 dark:placeholder:text-slate-600 ${
            hasError
              ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
              : 'border-slate-200 dark:border-slate-700 bg-white focus:border-[#124bd2] focus:ring-2 focus:ring-[#124bd2]/10'
          }`}
        />
        {isPassword && (
          <button type="button" onClick={() => setShowPwd(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition">
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
      {isPassword && value.length > 0 && (() => {
        const s = passwordStrength(value)
        return (
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex flex-1 gap-0.5">
              {[0,1,2].map(i => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= s.score - 1 ? s.color : 'bg-slate-100'}`} />
              ))}
            </div>
            <span className={`text-[10px] font-semibold ${
              s.score >= 2 ? 'text-emerald-500' : s.score === 1 ? 'text-amber-500' : 'text-red-400'
            }`}>{s.label}</span>
          </div>
        )
      })()}
      {hint && !hasError && <p className="text-[11px] text-slate-400">{hint}</p>}
      {hasError && <p className="text-[11px] text-red-500 flex items-center gap-1"><ShieldAlert size={10} />{error}</p>}
    </div>
  )
}

// ─── Étape 0 : Formulaire unique ──────────────────────────────────────────────
function StepForm({
  data, onChange, onSubmit, loading, error,
}: {
  data: WizardData
  onChange: (k: keyof WizardData, v: string) => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}) {
  const [cgu, setCgu] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof WizardData | 'cgu', string>>>({})

  const validate = () => {
    const e: Partial<Record<keyof WizardData | 'cgu', string>> = {}
    if (!data.firstName.trim())  e.firstName = 'Prénom requis'
    if (!data.lastName.trim())   e.lastName  = 'Nom requis'
    if (!data.email.trim())      e.email     = 'Email requis'
    else if (isPersonalEmail(data.email)) e.email = 'Email personnel non accepté (Gmail, Hotmail…)'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Email invalide'
    if (data.password.length < 8) e.password = 'Minimum 8 caractères'
    if (!cgu) e.cgu = 'Vous devez accepter les conditions'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    if (validate()) onSubmit()
  }

  const emailOk = data.email.includes('@') && !isPersonalEmail(data.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      {/* Identité */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" value={data.firstName} onChange={v => onChange('firstName', v)}
          icon={UserCircle} placeholder="Sophie" error={errors.firstName} autoFocus />
        <Field label="Nom" value={data.lastName} onChange={v => onChange('lastName', v)}
          icon={UserCircle} placeholder="Martin" error={errors.lastName} />
      </div>

      {/* Email + mot de passe */}
      <Field
        label="Email professionnel" value={data.email} onChange={v => onChange('email', v)}
        type="email" icon={Mail} placeholder="vous@votre-entreprise.fr" error={errors.email}
        hint={emailOk ? undefined : 'Adresses Gmail, Hotmail, Yahoo… refusées'}
      />
      {emailOk && (
        <div className="-mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600">
          <BadgeCheck size={12} /> Email professionnel valide
        </div>
      )}

      <Field label="Mot de passe" value={data.password} onChange={v => onChange('password', v)}
        type="password" icon={KeyRound} placeholder="8 caractères minimum" error={errors.password} />

      {/* Critères du mot de passe */}
      {(() => {
        const pwd = data.password
        const rules = [
          { ok: pwd.length >= 8,                          label: 'Minimum 8 characters' },
          { ok: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd),  label: 'Lower and uppercase letters' },
          { ok: /[0-9]/.test(pwd),                        label: 'At least 1 number' },
          { ok: /[^a-zA-Z0-9]/.test(pwd),                 label: 'At least 1 symbol' },
        ]
        const allMet = rules.every(r => r.ok)
        if (allMet) return null
        return (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50 px-3.5 py-3 -mt-1">
            {rules.map(r => (
              <div key={r.label} className="flex items-center gap-1.5">
                <div className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${r.ok ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} />
                <span className={`text-[11px] transition-colors ${r.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>{r.label}</span>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Entreprise (optionnel) */}
      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      <Field label="Société" value={data.company} onChange={v => onChange('company', v)}
        icon={Building2} placeholder="Barnes, Century 21…" optional />

      <Field label="Fonction" value={data.functionTitle} onChange={v => onChange('functionTitle', v)}
        icon={User} placeholder="Directeur commercial, Agent…" optional />

      {/* CGU — une seule case */}
      <div className="h-px bg-slate-100 dark:bg-slate-800" />

      <button
        type="button"
        onClick={() => setCgu(v => !v)}
        className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
          cgu
            ? 'border-[#124bd2]/30 bg-[#124bd2]/5 dark:bg-[#124bd2]/10'
            : errors.cgu
              ? 'border-red-200 bg-red-50'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
        }`}
      >
        <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
          cgu ? 'border-[#124bd2] bg-[#124bd2]' : errors.cgu ? 'border-red-300' : 'border-slate-300 dark:border-slate-600'
        }`}>
          {cgu && <Check size={11} className="text-white" />}
        </div>
        <span className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
          J'accepte les{' '}
          <a href="/cgu" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
            className="font-semibold text-[#124bd2] underline-offset-2 hover:underline">
            Conditions Générales d'Utilisation
          </a>
          , certifie agir dans un cadre professionnel et m'engage à respecter la réglementation applicable (RGPD).
        </span>
      </button>
      {errors.cgu && <p className="text-[11px] text-red-500 -mt-2">{errors.cgu}</p>}

      {/* Erreur API */}
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(18,75,210,0.5)] transition hover:bg-[#0b3fbc] disabled:opacity-60">
        {loading ? <><Loader2 size={15} className="animate-spin" /> Création…</> : <><ArrowRight size={15} /> Créer mon compte</>}
      </button>

    </form>
  )
}

// ─── Étape 1 : OTP email ──────────────────────────────────────────────────────
function StepOtp({
  email, onVerify, onResend, loading, error,
}: {
  email: string; onVerify: (code: string) => void
  onResend: () => void; loading: boolean; error: string | null
}) {
  const [code, setCode]   = useState(Array(6).fill(''))
  const inputs            = useRef<(HTMLInputElement | null)[]>([])
  const [resent, setResent] = useState(false)

  useEffect(() => {
    const full = code.join('')
    if (full.length === 6 && /^\d{6}$/.test(full)) onVerify(full)
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    const next = [...code]; next[i] = digit; setCode(next)
    if (digit && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (code[i]) { const next = [...code]; next[i] = ''; setCode(next) }
      else if (i > 0) { inputs.current[i - 1]?.focus(); const next = [...code]; next[i - 1] = ''; setCode(next) }
    } else if (e.key === 'ArrowLeft' && i > 0) { inputs.current[i - 1]?.focus() }
    else if (e.key === 'ArrowRight' && i < 5) { inputs.current[i + 1]?.focus() }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const next = [...code]
    digits.split('').forEach((d, idx) => { if (idx < 6) next[idx] = d })
    setCode(next)
    inputs.current[Math.min(digits.length, 5)]?.focus()
  }

  const handleResend = async () => {
    await onResend(); setResent(true); setTimeout(() => setResent(false), 5000)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-center">
        <Mail size={20} className="mx-auto mb-2 text-[#124bd2]" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Code envoyé à</p>
        <p className="mt-0.5 font-mono text-sm font-bold text-slate-800 dark:text-slate-100">{email}</p>
        <p className="mt-2 text-[11px] text-slate-400">Vérifiez vos spams si vous ne le trouvez pas · Valable 1h</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-center text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Code à 6 chiffres
        </label>
        <div className="flex justify-center gap-2" onPaste={handlePaste}>
          {code.map((digit, i) => (
            <input key={i}
              ref={el => { inputs.current[i] = el }}
              type="text" inputMode="numeric" maxLength={1}
              value={digit}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              autoFocus={i === 0}
              className={`h-12 w-11 rounded-xl border-2 text-center text-lg font-bold text-slate-800 dark:text-white dark:bg-slate-800 outline-none transition-all ${
                digit
                  ? 'border-[#124bd2] bg-[#124bd2]/5 dark:bg-[#124bd2]/10'
                  : 'border-slate-200 dark:border-slate-700 bg-white focus:border-[#124bd2] focus:ring-2 focus:ring-[#124bd2]/10'
              }`}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 text-sm text-[#124bd2]">
          <Loader2 size={15} className="animate-spin" /> Vérification…
        </div>
      )}

      <button type="button" onClick={handleResend} disabled={loading || resent}
        className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-[#124bd2] transition disabled:opacity-50">
        <RefreshCw size={12} className={resent ? 'text-emerald-500' : ''} />
        {resent ? 'Code renvoyé !' : 'Renvoyer le code'}
      </button>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RegisterWizard({ onComplete, onBackToLogin, initialEmail = '' }: Props) {
  const [step, setStep]   = useState(0)
  const [data, setData]   = useState<WizardData>({
    firstName: '', lastName: '', email: initialEmail, password: '',
    functionTitle: '', company: '', siren: '', website: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const change = (k: keyof WizardData, v: string) => {
    setData(prev => ({ ...prev, [k]: v }))
    setError(null)
  }

  // Soumission du formulaire → signUp Supabase
  const handleFormSubmit = async () => {
    setLoading(true); setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email:    data.email.trim().toLowerCase(),
        password: data.password,
        options: {
          data: {
            first_name:     data.firstName.trim(),
            last_name:      data.lastName.trim(),
            function_title: data.functionTitle.trim() || null,
            company_name:   data.company.trim()       || null,
            siren:          data.siren.replace(/\s/g, '') || null,
            website:        data.website.trim()        || null,
          },
          emailRedirectTo: window.location.origin + '?confirmed=1',
        },
      })
      if (authErr) throw authErr
      if (!authData.user) throw new Error('Création du compte impossible.')
      // Email déjà confirmé (test / magic link) → finaliser directement
      if (authData.user.email_confirmed_at) {
        await finalize()
      } else {
        setStep(1)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('already registered') || msg.includes('already exists'))
        setError('Un compte existe déjà avec cet email. Connectez-vous plutôt.')
      else if (msg.includes('rate limit') || msg.includes('too many'))
        setError('Trop de tentatives. Patientez quelques minutes.')
      else
        setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Vérification OTP
  const handleOtp = async (code: string) => {
    setLoading(true); setError(null)
    try {
      const supabase = getSupabaseClient()
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: data.email.trim().toLowerCase(),
        token: code,
        type:  'signup',
      })
      if (verifyErr) throw verifyErr
      await finalize()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('otp_expired') || msg.includes('expired'))
        setError('Code expiré. Cliquez sur "Renvoyer le code".')
      else if (msg.includes('invalid') || msg.includes('not found'))
        setError('Code incorrect. Vérifiez et réessayez.')
      else
        setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // Renvoi du code OTP
  const handleResend = async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.resend({ type: 'signup', email: data.email.trim().toLowerCase() })
  }

  // Finalisation : accept_cgu + onComplete
  const finalize = async () => {
    try {
      const supabase = getSupabaseClient()
      // Attendre que la session soit bien établie avant d'appeler le RPC
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const ip = await getClientIP()
        const { error: rpcErr } = await supabase.rpc('accept_cgu', { p_version: CGU_VERSION, p_ip: ip })
        if (rpcErr) console.error('[accept_cgu] failed:', rpcErr.message)
      } else {
        console.warn('[finalize] no session — accept_cgu skipped')
      }
    } catch (e) {
      console.error('[finalize] unexpected error:', e)
    }
    onComplete(data)
  }

  const stepTitles = ['Créer votre compte', 'Confirmez votre email']
  const stepSubs   = ['Renseignez vos informations professionnelles', 'Entrez le code reçu par email']

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center gap-2 rounded-xl bg-[#07113d] px-3.5 py-2">
          <Shield size={12} className="text-[#5b8fff]" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">Réservé aux professionnels</span>
        </div>
        {step === 1 && (
          <div className="text-center">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{stepTitles[step]}</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">{stepSubs[step]}</p>
          </div>
        )}
        {/* Indicateur minimaliste 2 étapes */}
        <div className="flex items-center gap-2">
          {[0, 1].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step ? 'w-6 bg-[#124bd2]' : i < step ? 'w-4 bg-[#124bd2]/40' : 'w-4 bg-slate-200 dark:bg-slate-700'
            }`} />
          ))}
        </div>
      </div>

      {/* Étapes */}
      {step === 0 && (
        <StepForm data={data} onChange={change} onSubmit={handleFormSubmit} loading={loading} error={error} />
      )}
      {step === 1 && (
        <StepOtp email={data.email} onVerify={handleOtp} onResend={handleResend} loading={loading} error={error} />
      )}

    </div>
  )
}
