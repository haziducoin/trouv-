import { useState, useRef, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Globe,
  Hash,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User,
  UserCircle,
} from 'lucide-react'
import trouveLogo from '@/assets/trouve-logo.png'
import { getSupabaseClient } from '@/lib/supabase'
import { isPersonalEmail } from '@/lib/accountStore'

// ─── Types ───────────────────────────────────────────────────────────────────
export interface WizardData {
  firstName: string
  lastName:  string
  email:     string
  password:  string
  functionTitle: string
  company:   string
  siren:     string
  website:   string
}

interface Props {
  onComplete: (data: WizardData) => void
  onBackToLogin: () => void
}

// ─── Constantes ──────────────────────────────────────────────────────────────
const CGU_VERSION = '1.0'

const STEPS = [
  { label: 'Compte',         description: 'Vos informations' },
  { label: 'Email',          description: 'Vérification' },
  { label: 'Entreprise',     description: 'Vérification' },
  { label: 'Engagements',    description: 'Conditions' },
]

const CGU_ITEMS = [
  "J'accepte les Conditions Générales d'Utilisation de trouvé!",
  "Je certifie agir dans le cadre d'une activité professionnelle",
  "Je certifie agir pour le compte de mon entreprise",
  "Je comprends que l'utilisation des données relève de ma responsabilité et de celle de mon entreprise",
  "Je m'engage à respecter les réglementations applicables (RGPD, loi informatique et libertés)",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function extractDomain(url: string): string {
  try {
    const u = url.startsWith('http') ? url : `https://${url}`
    return new URL(u).hostname.replace(/^www\./, '')
  } catch {
    return url.toLowerCase().replace(/^www\./, '')
  }
}

function emailDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() ?? ''
}

function checkCoherence(email: string, website: string): 'ok' | 'warning' | 'error' {
  const ed  = emailDomain(email)
  const wd  = extractDomain(website)
  if (!ed || !wd) return 'warning'
  // Domaines qui se ressemblent (ex: barnes.fr vs barnes-international.com)
  const edBase = ed.split('.')[0]
  const wdBase = wd.split('.')[0]
  if (ed === wd) return 'ok'
  if (edBase === wdBase || wd.includes(edBase) || ed.includes(wdBase)) return 'ok'
  return 'warning'
}

async function getClientIP(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    return j.ip as string
  } catch {
    return 'unknown'
  }
}

// ─── Composant StepIndicator ─────────────────────────────────────────────────
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                i < current
                  ? 'bg-[#124bd2] text-white'
                  : i === current
                  ? 'bg-[#124bd2] text-white ring-4 ring-[#124bd2]/20'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {i < current ? <Check size={14} /> : <span>{i + 1}</span>}
            </div>
            <span className={`text-[10px] font-medium ${i === current ? 'text-[#124bd2]' : 'text-slate-400'}`}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`mb-4 mx-1 h-px w-8 sm:w-14 transition-all ${i < current ? 'bg-[#124bd2]' : 'bg-slate-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Badge pro ───────────────────────────────────────────────────────────────
function ProBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#124bd2]/20 bg-[#124bd2]/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[#124bd2]">
      <Shield size={10} />
      Réservé aux professionnels
    </span>
  )
}

// ─── Champ de formulaire ─────────────────────────────────────────────────────
function Field({
  label, value, onChange, type = 'text', placeholder = '', icon: Icon,
  error, required = true, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  icon: React.FC<{ size?: number; className?: string }>
  error?: string
  required?: boolean
  hint?: string
}) {
  const [showPwd, setShowPwd] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {label}{required && <span className="ml-0.5 text-[#124bd2]">*</span>}
      </label>
      <div className="relative">
        <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type={isPassword ? (showPwd ? 'text' : 'password') : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          className={`w-full rounded-xl border py-2.5 pl-9 pr-${isPassword ? '10' : '3'} text-sm text-slate-800 outline-none transition placeholder:text-slate-300 ${
            error
              ? 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-2 focus:ring-red-100'
              : 'border-slate-200 bg-white focus:border-[#124bd2] focus:ring-2 focus:ring-[#124bd2]/10'
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPwd(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
      {hint && !error && <p className="text-[11px] text-slate-400">{hint}</p>}
      {error && <p className="text-[11px] text-red-500">{error}</p>}
    </div>
  )
}

// ─── Étape 1 : Création du compte ────────────────────────────────────────────
function Step1({
  data, onChange, onNext, loading, error,
}: {
  data: WizardData
  onChange: (k: keyof WizardData, v: string) => void
  onNext: () => void
  loading: boolean
  error: string | null
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof WizardData, string>>>({})

  const validate = () => {
    const e: Partial<Record<keyof WizardData, string>> = {}
    if (!data.firstName.trim())  e.firstName = 'Prénom requis'
    if (!data.lastName.trim())   e.lastName  = 'Nom requis'
    if (!data.functionTitle.trim()) e.functionTitle = 'Fonction requise'
    if (!data.company.trim())    e.company   = 'Société requise'
    if (!/^\d{9}$/.test(data.siren.replace(/\s/g, ''))) e.siren = 'SIREN invalide (9 chiffres)'
    if (!data.website.trim())    e.website   = 'Site web requis'
    if (!data.email.trim())      e.email     = 'Email requis'
    else if (isPersonalEmail(data.email)) e.email = 'Seuls les emails professionnels sont acceptés (pas de Gmail, Hotmail…)'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Email invalide'
    if (data.password.length < 8) e.password = 'Minimum 8 caractères'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    if (validate()) onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" value={data.firstName} onChange={v => onChange('firstName', v)}
          icon={UserCircle} placeholder="Sophie" error={errors.firstName} />
        <Field label="Nom" value={data.lastName} onChange={v => onChange('lastName', v)}
          icon={UserCircle} placeholder="Martin" error={errors.lastName} />
      </div>

      <Field label="Email professionnel" value={data.email} onChange={v => onChange('email', v)}
        type="email" icon={Mail} placeholder="vous@votre-entreprise.fr" error={errors.email}
        hint="Adresses personnelles (Gmail, Hotmail…) refusées" />

      <Field label="Mot de passe" value={data.password} onChange={v => onChange('password', v)}
        type="password" icon={KeyRound} placeholder="8 caractères minimum" error={errors.password} />

      <div className="my-1 h-px bg-slate-100" />

      <Field label="Fonction" value={data.functionTitle} onChange={v => onChange('functionTitle', v)}
        icon={UserCircle} placeholder="Directeur commercial, Agent immobilier…" error={errors.functionTitle} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Société" value={data.company} onChange={v => onChange('company', v)}
          icon={Building2} placeholder="Barnes, Century 21…" error={errors.company} />
        <Field label="SIREN" value={data.siren} onChange={v => onChange('siren', v.replace(/\D/g, '').slice(0, 9))}
          icon={Hash} placeholder="123456789" error={errors.siren}
          hint="9 chiffres" />
      </div>

      <Field label="Site web de l'entreprise" value={data.website} onChange={v => onChange('website', v)}
        icon={Globe} placeholder="www.votre-entreprise.fr" error={errors.website} />

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-60"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        {loading ? 'Création du compte…' : 'Créer mon compte professionnel'}
      </button>
    </form>
  )
}

// ─── Étape 2 : Vérification email ────────────────────────────────────────────
function Step2({
  email, onVerify, onResend, loading, error,
}: {
  email: string
  onVerify: (code: string) => void
  onResend: () => void
  loading: boolean
  error: string | null
}) {
  const [code, setCode] = useState('')
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  const handleInput = (i: number, v: string) => {
    const digits = v.replace(/\D/g, '')
    if (!digits) return
    const arr = code.split('')
    arr[i] = digits[digits.length - 1]
    const next = arr.join('').slice(0, 6)
    setCode(next.padEnd(6, '').slice(0, 6))
    if (digits && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      const arr = code.split('')
      arr[i - 1] = ''
      setCode(arr.join(''))
      inputs.current[i - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    setCode(digits.padEnd(6, '').slice(0, 6))
    inputs.current[Math.min(digits.length, 5)]?.focus()
  }

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    if (code.replace(/\s/g, '').length === 6) onVerify(code.replace(/\s/g, ''))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Code envoyé à :</p>
        <p className="mt-0.5 font-mono text-[#124bd2]">{email}</p>
        <p className="mt-2 text-xs text-slate-500">
          Vérifiez votre boîte de réception. Le code est valable 1 heure.
          Si vous ne le trouvez pas, vérifiez vos spams.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Code de vérification à 6 chiffres
        </label>
        <div className="flex gap-2 justify-center" onPaste={handlePaste}>
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              ref={el => { inputs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={code[i] ?? ''}
              onChange={e => handleInput(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className="h-12 w-12 rounded-xl border border-slate-200 bg-white text-center text-lg font-bold text-slate-800 outline-none transition focus:border-[#124bd2] focus:ring-2 focus:ring-[#124bd2]/10"
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || code.replace(/\s/g, '').length < 6}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-50"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
        {loading ? 'Vérification…' : 'Vérifier mon email'}
      </button>

      <button
        type="button"
        onClick={onResend}
        disabled={loading}
        className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-[#124bd2] transition"
      >
        <RefreshCw size={12} />
        Renvoyer le code
      </button>
    </form>
  )
}

// ─── Étape 3 : Vérification entreprise ──────────────────────────────────────
function Step3({
  data, onNext, loading,
}: {
  data: WizardData
  onNext: () => void
  loading: boolean
}) {
  const coherence = checkCoherence(data.email, data.website)
  const emailD = emailDomain(data.email)
  const websiteD = extractDomain(data.website)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <BadgeCheck size={20} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-emerald-800">Email professionnel confirmé</p>
          <p className="text-xs text-emerald-600">{data.email}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Votre entreprise</p>

        <div className="flex items-start gap-3">
          <Building2 size={16} className="mt-0.5 shrink-0 text-[#124bd2]" />
          <div>
            <p className="text-sm font-semibold text-slate-800">{data.company}</p>
            <p className="text-xs text-slate-500">SIREN : {data.siren}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Globe size={16} className="mt-0.5 shrink-0 text-[#124bd2]" />
          <p className="text-sm text-slate-700">{data.website}</p>
        </div>

        <div className="flex items-start gap-3">
          <User size={16} className="mt-0.5 shrink-0 text-[#124bd2]" />
          <p className="text-sm text-slate-700">{data.firstName} {data.lastName} · {data.functionTitle}</p>
        </div>
      </div>

      <div className={`rounded-xl border p-4 ${
        coherence === 'ok'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}>
        <div className="flex items-start gap-2">
          {coherence === 'ok' ? (
            <ShieldCheck size={15} className="mt-0.5 text-emerald-600" />
          ) : (
            <Shield size={15} className="mt-0.5 text-amber-600" />
          )}
          <div>
            <p className={`text-xs font-semibold ${coherence === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
              {coherence === 'ok' ? 'Cohérence entreprise vérifiée' : 'Vérification manuelle requise'}
            </p>
            <p className={`text-[11px] mt-0.5 ${coherence === 'ok' ? 'text-emerald-600' : 'text-amber-600'}`}>
              {coherence === 'ok'
                ? `Le domaine @${emailD} correspond à ${websiteD}`
                : `@${emailD} sera vérifié manuellement par notre équipe`}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#124bd2]/20 bg-[#124bd2]/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={13} className="text-[#124bd2]" />
          <p className="text-xs font-semibold text-[#124bd2]">Votre dossier sera examiné par notre équipe</p>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Une fois vos engagements acceptés, votre dossier sera traité sous 24–48h.
          Vous recevrez un email de confirmation à l'activation de votre accès.
        </p>
      </div>

      <button
        onClick={onNext}
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-60"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        Continuer vers les engagements
      </button>
    </div>
  )
}

// ─── Étape 4 : CGU ───────────────────────────────────────────────────────────
function Step4({
  onComplete, loading, error,
}: {
  onComplete: (checked: boolean[]) => void
  loading: boolean
  error: string | null
}) {
  const [checked, setChecked] = useState(Array(CGU_ITEMS.length).fill(false))
  const allChecked = checked.every(Boolean)

  const toggle = (i: number) => setChecked(prev => prev.map((v, j) => j === i ? !v : v))

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-slate-500 leading-relaxed">
        Avant d'accéder aux services de trouvé!, vous devez accepter l'ensemble des engagements suivants.
        Ces engagements sont obligatoires et juridiquement contraignants.
      </p>

      <div className="flex flex-col gap-3">
        {CGU_ITEMS.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition ${
              checked[i]
                ? 'border-[#124bd2]/30 bg-[#124bd2]/5'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
              checked[i] ? 'border-[#124bd2] bg-[#124bd2]' : 'border-slate-300'
            }`}>
              {checked[i] && <Check size={12} className="text-white" />}
            </div>
            <span className="text-xs leading-relaxed text-slate-700">{item}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {!allChecked && (
        <p className="text-center text-[11px] text-slate-400">
          Cochez tous les engagements pour continuer
        </p>
      )}

      <button
        type="button"
        onClick={() => onComplete(checked)}
        disabled={!allChecked || loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-40"
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
        {loading ? 'Finalisation…' : 'Finaliser mon inscription professionnelle'}
      </button>

      <p className="text-center text-[10px] text-slate-400 leading-relaxed">
        En finalisant, vous acceptez l'ensemble des conditions ci-dessus.
        Ces informations sont conservées conformément à notre politique de confidentialité.
      </p>
    </div>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function RegisterWizard({ onComplete, onBackToLogin }: Props) {
  const [step, setStep]   = useState(0)
  const [data, setData]   = useState<WizardData>({
    firstName: '', lastName: '', email: '', password: '',
    functionTitle: '', company: '', siren: '', website: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const change = (k: keyof WizardData, v: string) => {
    setData(prev => ({ ...prev, [k]: v }))
    setError(null)
  }

  // ── Étape 1 → signUp Supabase ─────────────────────────────────────────────
  const handleStep1 = async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: data.email.trim().toLowerCase(),
        password: data.password,
        options: {
          data: {
            first_name:     data.firstName.trim(),
            last_name:      data.lastName.trim(),
            function_title: data.functionTitle.trim(),
            company_name:   data.company.trim(),
            siren:          data.siren.replace(/\s/g, ''),
            website:        data.website.trim(),
          },
          emailRedirectTo: window.location.origin + '?confirmed=1',
        },
      })
      if (authErr) throw authErr
      if (!authData.user) throw new Error('Création du compte impossible.')

      // Si déjà confirmé (ne devrait pas arriver avec autoconfirm=false)
      if (authData.user.email_confirmed_at) {
        setStep(2)
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

  // ── Étape 2 → verifyOtp ──────────────────────────────────────────────────
  const handleOtp = async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: data.email.trim().toLowerCase(),
        token: code,
        type:  'email',
      })
      if (verifyErr) throw verifyErr
      setStep(2)
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

  const handleResend = async () => {
    setError(null)
    const supabase = getSupabaseClient()
    await supabase.auth.resend({ type: 'signup', email: data.email.trim().toLowerCase() })
  }

  // ── Étape 3 → mise à jour du profil ─────────────────────────────────────
  const handleStep3 = async () => {
    setLoading(true)
    setError(null)
    try {
      // Mise à jour user_metadata avec les champs professionnels
      const supabase = getSupabaseClient()
      await supabase.auth.updateUser({
        data: {
          function_title: data.functionTitle.trim(),
          website:        data.website.trim(),
        },
      })
      setStep(3)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.')
    } finally {
      setLoading(false)
    }
  }

  // ── Étape 4 → acceptation CGU ────────────────────────────────────────────
  const handleCgu = async (_checked: boolean[]) => {
    setLoading(true)
    setError(null)
    try {
      const ip = await getClientIP()
      const supabase = getSupabaseClient()
      const { error: cguErr } = await supabase.rpc('accept_cgu', {
        p_version: CGU_VERSION,
        p_ip:      ip,
      })
      if (cguErr) throw cguErr
      onComplete(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la finalisation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <ProBadge />
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800">
            {step === 0 && 'Créer votre accès professionnel'}
            {step === 1 && 'Vérifiez votre email'}
            {step === 2 && 'Vérification entreprise'}
            {step === 3 && 'Engagements professionnels'}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {step === 0 && 'Tous les champs sont obligatoires'}
            {step === 1 && 'Entrez le code reçu par email'}
            {step === 2 && 'Récapitulatif de votre dossier'}
            {step === 3 && 'Lecture et acceptation obligatoires'}
          </p>
        </div>
        <StepIndicator current={step} />
      </div>

      {/* Contenu selon l'étape */}
      {step === 0 && (
        <Step1 data={data} onChange={change} onNext={handleStep1} loading={loading} error={error} />
      )}
      {step === 1 && (
        <Step2 email={data.email} onVerify={handleOtp} onResend={handleResend} loading={loading} error={error} />
      )}
      {step === 2 && (
        <Step3 data={data} onNext={handleStep3} loading={loading} />
      )}
      {step === 3 && (
        <Step4 onComplete={handleCgu} loading={loading} error={error} />
      )}

      {/* Back to login */}
      {step === 0 && (
        <button
          type="button"
          onClick={onBackToLogin}
          className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-[#124bd2] transition"
        >
          <ArrowLeft size={12} />
          Déjà un compte ? Se connecter
        </button>
      )}
    </div>
  )
}

export { CGU_VERSION }
