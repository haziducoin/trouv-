import { useState, useRef, useEffect, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
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
  Zap,
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
}

// ─── Constantes ──────────────────────────────────────────────────────────────
export const CGU_VERSION = '1.0'

// 5 étapes visuelles : Identité → Entreprise → Email → Récap → Engagements
const STEPS = [
  { label: 'Identité',     icon: User },
  { label: 'Entreprise',   icon: Building2 },
  { label: 'Email',        icon: Mail },
  { label: 'Récapitulatif', icon: ShieldCheck },
  { label: 'Engagements',  icon: Shield },
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

function checkCoherence(email: string, website: string): 'ok' | 'warning' {
  const ed = emailDomain(email)
  const wd = extractDomain(website)
  if (!ed || !wd) return 'warning'
  const edBase = ed.split('.')[0]
  const wdBase = wd.split('.')[0]
  if (ed === wd || edBase === wdBase || wd.includes(edBase) || ed.includes(wdBase)) return 'ok'
  return 'warning'
}

function passwordStrength(pwd: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (pwd.length < 6) return { score: 0, label: 'Trop court', color: 'bg-red-400' }
  let score = 0
  if (pwd.length >= 8)  score++
  if (/[A-Z]/.test(pwd)) score++
  if (/[0-9!@#$%^&*]/.test(pwd)) score++
  const labels = ['Faible', 'Moyen', 'Fort', 'Excellent']
  const colors = ['bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500']
  return { score: score as 0|1|2|3, label: labels[score], color: colors[score] }
}

function formatSiren(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 9)
  return digits.replace(/(\d{3})(\d{1,3})?(\d{1,3})?/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(' ')
  )
}

async function getClientIP(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
    const j = await r.json()
    return j.ip as string
  } catch { return 'unknown' }
}

// ─── StepIndicator ───────────────────────────────────────────────────────────
function StepIndicator({
  current, total, maxReached, onGoTo,
}: {
  current: number; total: number; maxReached: number; onGoTo: (i: number) => void
}) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.slice(0, total).map((step, i) => {
        const reachable = i <= maxReached && i !== current
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onGoTo(i)}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition-all duration-300 ${
                  i < current
                    ? 'bg-[#124bd2] text-white hover:bg-[#0b3fbc] cursor-pointer'
                    : i === current
                      ? 'bg-[#124bd2] text-white ring-4 ring-[#124bd2]/20 cursor-default'
                      : i <= maxReached
                        ? 'bg-slate-200 text-slate-600 hover:bg-[#124bd2]/20 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-default'
                }`}
              >
                {i < current ? <Check size={13} /> : <span>{i + 1}</span>}
              </button>
              <span className={`hidden sm:block text-[9px] font-semibold uppercase tracking-wide transition-colors ${
                i === current ? 'text-[#124bd2]' : i < current ? 'text-[#124bd2]/60' : 'text-slate-300'
              }`}>{step.label}</span>
            </div>
            {i < STEPS.slice(0, total).length - 1 && (
              <div className={`mb-4 mx-1 h-px w-6 sm:w-10 transition-all duration-300 ${i < current ? 'bg-[#124bd2]' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Champ de saisie ─────────────────────────────────────────────────────────
function Field({
  label, value, onChange, type = 'text', placeholder = '', icon: Icon,
  error, hint, autoFocus = false, suffix,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string
  icon: React.FC<{ size?: number; className?: string }>
  error?: string; hint?: string; autoFocus?: boolean
  suffix?: React.ReactNode
}) {
  const [showPwd, setShowPwd] = useState(false)
  const [touched, setTouched] = useState(false)
  const isPassword = type === 'password'
  const hasError = touched && error

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
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
          className={`w-full rounded-xl border py-2.5 pl-9 ${isPassword || suffix ? 'pr-10' : 'pr-3'} text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-800 outline-none transition placeholder:text-slate-300 dark:placeholder:text-slate-600 ${
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
        {!isPassword && suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</span>
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

// ─── Étape 0 : Identité ───────────────────────────────────────────────────────
function Step0({
  data, onChange, onNext,
}: {
  data: WizardData
  onChange: (k: keyof WizardData, v: string) => void
  onNext: () => void
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof WizardData, string>>>({})

  const validate = () => {
    const e: Partial<Record<keyof WizardData, string>> = {}
    if (!data.firstName.trim())  e.firstName     = 'Prénom requis'
    if (!data.lastName.trim())   e.lastName      = 'Nom requis'
    if (!data.functionTitle.trim()) e.functionTitle = 'Fonction requise'
    if (!data.email.trim())      e.email         = 'Email requis'
    else if (isPersonalEmail(data.email)) e.email = 'Email personnel non accepté (Gmail, Hotmail…)'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) e.email = 'Email invalide'
    if (data.password.length < 8) e.password     = 'Minimum 8 caractères'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    if (validate()) onNext()
  }

  const emailStatus = data.email.includes('@') && !isPersonalEmail(data.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Prénom" value={data.firstName} onChange={v => onChange('firstName', v)}
          icon={UserCircle} placeholder="Sophie" error={errors.firstName} autoFocus />
        <Field label="Nom" value={data.lastName} onChange={v => onChange('lastName', v)}
          icon={UserCircle} placeholder="Martin" error={errors.lastName} />
      </div>

      <Field label="Fonction" value={data.functionTitle} onChange={v => onChange('functionTitle', v)}
        icon={User} placeholder="Directeur commercial, Agent immobilier…" error={errors.functionTitle} />

      <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />

      <Field label="Email professionnel" value={data.email} onChange={v => onChange('email', v)}
        type="email" icon={Mail} placeholder="vous@votre-entreprise.fr" error={errors.email}
        hint="Adresses personnelles refusées (Gmail, Hotmail…)"
        suffix={emailStatus ? <BadgeCheck size={14} className="text-emerald-500" /> : undefined}
      />

      <Field label="Mot de passe" value={data.password} onChange={v => onChange('password', v)}
        type="password" icon={KeyRound} placeholder="8 caractères minimum" error={errors.password} />

      <button type="submit"
        className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(18,75,210,0.5)] transition hover:bg-[#0b3fbc] hover:shadow-[0_12px_28px_-8px_rgba(18,75,210,0.6)]">
        Continuer <ArrowRight size={15} />
      </button>
    </form>
  )
}

// ─── Étape 1 : Entreprise ─────────────────────────────────────────────────────
function Step1({
  data, onChange, onNext, onBack, loading, error,
}: {
  data: WizardData
  onChange: (k: keyof WizardData, v: string) => void
  onNext: () => void
  onBack: () => void
  loading: boolean
  error: string | null
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof WizardData, string>>>({})

  const validate = () => {
    const e: Partial<Record<keyof WizardData, string>> = {}
    if (!data.company.trim()) e.company = 'Nom de la société requis'
    if (!/^\d{9}$/.test(data.siren.replace(/\s/g, ''))) e.siren = 'SIREN invalide (9 chiffres)'
    if (!data.website.trim()) e.website = 'Site web requis'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = (ev: FormEvent) => {
    ev.preventDefault()
    if (validate()) onNext()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      {/* Contexte */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20 px-4 py-3 flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#124bd2]/10">
          <User size={15} className="text-[#124bd2]" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{data.firstName} {data.lastName}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{data.email}</p>
        </div>
        <button type="button" onClick={onBack} className="ml-auto shrink-0 text-[10px] font-semibold text-[#124bd2] hover:underline">
          Modifier
        </button>
      </div>

      <Field label="Nom de la société" value={data.company} onChange={v => onChange('company', v)}
        icon={Building2} placeholder="Barnes, Century 21, Cabinet Dupont…" error={errors.company} autoFocus />

      <div className="grid grid-cols-2 gap-3">
        <Field label="SIREN" value={formatSiren(data.siren)} onChange={v => onChange('siren', v.replace(/\s/g, '').replace(/\D/g, '').slice(0, 9))}
          icon={Hash} placeholder="123 456 789" error={errors.siren}
          hint="Numéro à 9 chiffres" />
        <Field label="Site web" value={data.website} onChange={v => onChange('website', v)}
          icon={Globe} placeholder="www.votre-entreprise.fr" error={errors.website} />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <button type="submit" disabled={loading}
        className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(18,75,210,0.5)] transition hover:bg-[#0b3fbc] disabled:opacity-60">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        {loading ? 'Création du compte…' : 'Créer mon compte professionnel'}
      </button>

      {/* Réassurance */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 pt-1 text-[10px] text-slate-400">
        {['Données chiffrées', 'RGPD conforme', 'Validation sous 24–48h'].map(t => (
          <span key={t} className="flex items-center gap-1"><Check size={9} className="text-emerald-400" />{t}</span>
        ))}
      </div>
    </form>
  )
}

// ─── Étape 2 : Vérification email ─────────────────────────────────────────────
function Step2({
  email, onVerify, onResend, loading, error,
}: {
  email: string; onVerify: (code: string) => void
  onResend: () => void; loading: boolean; error: string | null
}) {
  const [code, setCode] = useState(Array(6).fill(''))
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const [resent, setResent] = useState(false)

  // Auto-submit quand les 6 chiffres sont remplis
  useEffect(() => {
    const full = code.join('')
    if (full.length === 6 && /^\d{6}$/.test(full)) {
      onVerify(full)
    }
  }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    const next = [...code]
    next[i] = digit
    setCode(next)
    if (digit && i < 5) inputs.current[i + 1]?.focus()
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace') {
      if (code[i]) {
        const next = [...code]; next[i] = ''; setCode(next)
      } else if (i > 0) {
        inputs.current[i - 1]?.focus()
        const next = [...code]; next[i - 1] = ''; setCode(next)
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputs.current[i - 1]?.focus()
    } else if (e.key === 'ArrowRight' && i < 5) {
      inputs.current[i + 1]?.focus()
    }
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
    await onResend()
    setResent(true)
    setTimeout(() => setResent(false), 5000)
  }

  const filled = code.every(d => d !== '')

  return (
    <div className="flex flex-col gap-5">
      {/* Info email */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 text-center">
        <Mail size={20} className="mx-auto mb-2 text-[#124bd2]" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Code envoyé à</p>
        <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">{email}</p>
        <p className="mt-2 text-[11px] text-slate-400">Vérifiez vos spams si vous ne le trouvez pas · Valable 1h</p>
      </div>

      {/* OTP grid */}
      <div className="flex flex-col gap-2">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 text-center">
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
          <Loader2 size={15} className="animate-spin" /> Vérification en cours…
        </div>
      )}

      {!loading && !filled && (
        <p className="text-center text-[11px] text-slate-400">
          La vérification se lance automatiquement quand les 6 chiffres sont saisis
        </p>
      )}

      <button type="button" onClick={handleResend} disabled={loading || resent}
        className="flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-[#124bd2] transition disabled:opacity-50">
        <RefreshCw size={12} className={resent ? 'text-emerald-500' : ''} />
        {resent ? 'Code renvoyé !' : 'Renvoyer le code'}
      </button>
    </div>
  )
}

// ─── Étape 3 : Récapitulatif entreprise ───────────────────────────────────────
function Step3({
  data, onNext, loading,
}: {
  data: WizardData; onNext: () => void; loading: boolean
}) {
  const coherence = checkCoherence(data.email, data.website)
  const emailD = emailDomain(data.email)
  const websiteD = extractDomain(data.website)

  return (
    <div className="flex flex-col gap-4">
      {/* Email confirmé */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20 p-3.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <BadgeCheck size={18} className="text-emerald-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Email professionnel confirmé</p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">{data.email}</p>
        </div>
      </div>

      {/* Carte entreprise */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex flex-col gap-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Votre dossier</p>
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#124bd2]/10">
            <Building2 size={16} className="text-[#124bd2]" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{data.company}</p>
            <p className="text-[11px] text-slate-400 font-mono">SIREN {data.siren}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <Globe size={13} className="shrink-0 text-[#124bd2]" /> {data.website}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <User size={13} className="shrink-0 text-[#124bd2]" />
            {data.firstName} {data.lastName} · <span className="text-slate-400">{data.functionTitle}</span>
          </div>
        </div>
      </div>

      {/* Cohérence domaine */}
      <div className={`rounded-xl border p-3.5 flex items-start gap-2.5 ${
        coherence === 'ok'
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20'
      }`}>
        {coherence === 'ok'
          ? <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-600" />
          : <Shield size={14} className="mt-0.5 shrink-0 text-amber-600" />}
        <div>
          <p className={`text-xs font-bold ${coherence === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {coherence === 'ok' ? 'Cohérence entreprise vérifiée' : 'Vérification manuelle requise'}
          </p>
          <p className={`text-[11px] mt-0.5 ${coherence === 'ok' ? 'text-emerald-600' : 'text-amber-600'}`}>
            {coherence === 'ok'
              ? `Le domaine @${emailD} correspond à ${websiteD}`
              : `@${emailD} sera vérifié manuellement par notre équipe`}
          </p>
        </div>
      </div>

      {/* Info délai */}
      <div className="rounded-xl border border-[#124bd2]/20 bg-[#124bd2]/5 dark:border-[#124bd2]/30 dark:bg-[#124bd2]/10 p-3.5 flex items-start gap-2.5">
        <Lock size={13} className="mt-0.5 shrink-0 text-[#124bd2]" />
        <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
          Votre dossier sera examiné sous <strong>24–48h</strong>. Vous recevrez un email à l'activation.
        </p>
      </div>

      <button onClick={onNext} disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(18,75,210,0.5)] transition hover:bg-[#0b3fbc] disabled:opacity-60">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
        Continuer vers les engagements
      </button>
    </div>
  )
}

// ─── Étape 4 : CGU ────────────────────────────────────────────────────────────
function Step4({
  onComplete, loading, error,
}: {
  onComplete: (checked: boolean[]) => void; loading: boolean; error: string | null
}) {
  const [checked, setChecked] = useState(Array(CGU_ITEMS.length).fill(false))
  const allChecked = checked.every(Boolean)

  const toggle = (i: number) => setChecked(prev => prev.map((v, j) => j === i ? !v : v))
  const checkAll = () => setChecked(Array(CGU_ITEMS.length).fill(true))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3.5">
        <Shield size={15} className="mt-0.5 shrink-0 text-[#124bd2]" />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          Ces engagements sont obligatoires et juridiquement contraignants pour accéder aux services de trouvé!
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {CGU_ITEMS.map((item, i) => (
          <button key={i} type="button" onClick={() => toggle(i)}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${
              checked[i]
                ? 'border-[#124bd2]/30 bg-[#124bd2]/5 dark:bg-[#124bd2]/10'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'
            }`}>
            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
              checked[i] ? 'border-[#124bd2] bg-[#124bd2]' : 'border-slate-300 dark:border-slate-600'
            }`}>
              {checked[i] && <Check size={11} className="text-white" />}
            </div>
            <span className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">{item}</span>
          </button>
        ))}
      </div>

      {!allChecked && (
        <button type="button" onClick={checkAll}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#124bd2]/40 py-2 text-xs font-semibold text-[#124bd2] hover:bg-[#124bd2]/5 transition">
          <Zap size={12} /> Tout accepter d'un coup
        </button>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <button type="button" onClick={() => onComplete(checked)} disabled={!allChecked || loading}
        className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] py-3 text-sm font-bold text-white shadow-[0_8px_24px_-8px_rgba(18,75,210,0.5)] transition hover:bg-[#0b3fbc] disabled:opacity-40">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
        {loading ? 'Finalisation…' : 'Finaliser mon inscription'}
      </button>

      {allChecked && !loading && (
        <p className="text-center text-[10px] text-slate-400 leading-relaxed">
          En finalisant, vous acceptez l'ensemble des conditions ci-dessus.
          Ces informations sont conservées conformément à notre politique de confidentialité.
        </p>
      )}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function RegisterWizard({ onComplete, onBackToLogin }: Props) {
  const [step, setStep]           = useState(0)
  const [maxReached, setMaxReached] = useState(0)
  const [data, setData]           = useState<WizardData>({
    firstName: '', lastName: '', email: '', password: '',
    functionTitle: '', company: '', siren: '', website: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const goTo = (i: number) => {
    setStep(i)
    setError(null)
  }

  const advance = (i: number) => {
    setStep(i)
    setMaxReached(prev => Math.max(prev, i))
    setError(null)
  }

  const change = (k: keyof WizardData, v: string) => {
    setData(prev => ({ ...prev, [k]: v }))
    setError(null)
  }

  const stepTitles = [
    'Votre identité',
    'Votre entreprise',
    'Vérifiez votre email',
    'Récapitulatif',
    'Engagements professionnels',
  ]
  const stepSubs = [
    'Vos informations personnelles',
    'Votre société et activité',
    'Entrez le code reçu par email',
    'Votre dossier en un coup d\'œil',
    'Lecture et acceptation requises',
  ]

  // Étape 0 → local seulement (pas d'API)
  const handleStep0 = () => advance(1)

  // Étape 1 → signUp Supabase (avec toutes les données)
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
      if (authData.user.email_confirmed_at) { advance(3) }
      else { advance(2) }
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

  // Étape 2 → verifyOtp
  const handleOtp = async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email: data.email.trim().toLowerCase(),
        token: code,
        type:  'signup',
      })
      if (verifyErr) throw verifyErr
      advance(3)
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
    const supabase = getSupabaseClient()
    await supabase.auth.resend({ type: 'signup', email: data.email.trim().toLowerCase() })
  }

  // Étape 3 → updateUser
  const handleStep3 = async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      await supabase.auth.updateUser({
        data: { function_title: data.functionTitle.trim(), website: data.website.trim() },
      })
      advance(4)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.')
    } finally {
      setLoading(false)
    }
  }

  // Étape 4 → accept_cgu
  const handleCgu = async (_checked: boolean[]) => {
    setLoading(true)
    setError(null)
    try {
      const ip = await getClientIP()
      const supabase = getSupabaseClient()
      const { error: cguErr } = await supabase.rpc('accept_cgu', { p_version: CGU_VERSION, p_ip: ip })
      if (cguErr) throw cguErr
      onComplete(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la finalisation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex w-full items-center gap-2">
          {step > 0 && (
            <button
              type="button"
              onClick={() => goTo(step - 1)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-[#124bd2] hover:text-[#124bd2]"
              aria-label="Étape précédente"
            >
              <ArrowLeft size={15} />
            </button>
          )}
          <div className={`flex flex-1 items-center gap-2 rounded-xl bg-[#07113d] px-3.5 py-2 ${step === 0 ? '' : ''}`}>
            <Shield size={12} className="text-[#5b8fff]" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-white">Réservé aux professionnels</span>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{stepTitles[step]}</h2>
          <p className="mt-0.5 text-[11px] text-slate-400">{stepSubs[step]}</p>
        </div>
        <StepIndicator current={step} total={5} maxReached={maxReached} onGoTo={goTo} />
      </div>

      {/* Étapes */}
      {step === 0 && <Step0 data={data} onChange={change} onNext={handleStep0} />}
      {step === 1 && <Step1 data={data} onChange={change} onNext={handleStep1} onBack={() => goTo(0)} loading={loading} error={error} />}
      {step === 2 && <Step2 email={data.email} onVerify={handleOtp} onResend={handleResend} loading={loading} error={error} />}
      {step === 3 && <Step3 data={data} onNext={handleStep3} loading={loading} />}
      {step === 4 && <Step4 onComplete={handleCgu} loading={loading} error={error} />}

    </div>
  )
}
