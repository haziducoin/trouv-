import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Ban,
  BarChart3,
  Building2,
  Check,
  Database,
  Download,
  Heart,
  History,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  UserRoundCheck,
  X,
  Zap,
} from 'lucide-react'
import AccountPanel, { type AccountPanelView } from '@/components/account/AccountPanel'
import ChatWidget from '@/components/ChatWidget'
import trouveLogo from '@/assets/trouve-logo.png'

import { clearSession, restoreSession, type Account } from '@/lib/accountStore'
import { getSupabaseClient } from '@/lib/supabase'

type BillingPeriod = 'monthly' | 'quarterly' | 'annual'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

const resultRows = [
  { name: 'Cabinet Rivoli', city: 'Paris 08', type: 'Agence', status: 'Vérifié' },
  { name: 'Atelier Habitat', city: 'Lyon 02', type: 'Mandataire', status: 'Vérifié' },
  { name: 'Maison Sud', city: 'Bordeaux', type: 'Agence', status: 'Nouveau' },
]

const safeguards = [
  { icon: Ban, label: "Pas d'export massif" },
  { icon: History, label: "Logs d'utilisation" },
  { icon: UserRoundCheck, label: 'Compte nominatif' },
  { icon: LockKeyhole, label: 'Anti-extraction' },
]

const STATS = [
  { icon: Database, value: '10 M+',  label: 'entreprises indexées' },
  { icon: Timer,    value: '<200 ms', label: 'temps de réponse' },
  { icon: ShieldCheck, value: '100%', label: 'données Sirene officielles' },
  { icon: Download, value: 'CSV',    label: 'export instantané' },
]

const STEPS = [
  {
    num: '01',
    title: 'Accédez en 2 minutes',
    desc: 'Vérification SIREN + email pro. Votre compte est actif immédiatement.',
    color: 'bg-blue-50 text-[#124bd2]',
  },
  {
    num: '02',
    title: 'Recherchez. Filtrez.',
    desc: 'Nom, ville, département, type d\'activité. Résultats en moins de 200 ms.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    num: '03',
    title: 'Exportez. Développez.',
    desc: 'CSV en un clic. Données officielles Sirene, toujours à jour.',
    color: 'bg-emerald-50 text-emerald-600',
  },
]

// ─── Catalogue de plans ───────────────────────────────────────────────────────
const PLANS = [
  {
    code: 'solo',
    name: 'Solo',
    description: 'Pour les agents indépendants',
    users: 1,
    searches: 1500,
    recommended: false,
    pricing: {
      monthly:   { amount: 199, label: '199 €' },
      quarterly: { amount: 169, label: '169 €', saving: '1 mois offert' },
      annual:    { amount: 159, label: '159 €', saving: '2 mois offerts' },
    },
    features: [
      '1 500 recherches / mois',
      '1 compte nominatif',
      'Export PDF',
      'Historique 90 jours',
      'Support email',
    ],
  },
  {
    code: 'agence',
    name: 'Agence',
    description: 'Pour les agences immobilières',
    users: 3,
    searches: 5000,
    recommended: true,
    pricing: {
      monthly:   { amount: 499, label: '499 €' },
      quarterly: { amount: 424, label: '424 €', saving: '1 mois offert' },
      annual:    { amount: 399, label: '399 €', saving: '2 mois offerts' },
    },
    features: [
      '5 000 recherches / mois',
      '3 comptes nominatifs',
      'Dashboard + statistiques',
      'Export CSV illimité',
      'Historique 12 mois',
      'Support prioritaire',
      'Onboarding dédié',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Pour les structures multi-équipes',
    users: 7,
    searches: 12000,
    recommended: false,
    pricing: {
      monthly:   { amount: 899, label: '899 €' },
      quarterly: { amount: 764, label: '764 €', saving: '1 mois offert' },
      annual:    { amount: 719, label: '719 €', saving: '2 mois offerts' },
    },
    features: [
      '12 000 recherches / mois',
      '7 comptes nominatifs',
      'Multi-agence (1 réseau)',
      'API REST incluse',
      'Intégrations CRM',
      'SLA 99,9 %',
      'Support téléphonique',
    ],
  },
  {
    code: 'reseau',
    name: 'Réseau',
    description: 'Sur mesure pour grands réseaux',
    users: null,
    searches: null,
    recommended: false,
    pricing: {
      monthly:   { amount: 0, label: 'Sur devis' },
      quarterly: { amount: 0, label: 'Sur devis' },
      annual:    { amount: 0, label: 'Sur devis' },
    },
    features: [
      'Utilisateurs illimités',
      'Volume adapté',
      'Infrastructure dédiée',
      'SSO / SAML',
      'Contrat personnalisé',
      'CSM dédié',
    ],
  },
]

const PERIOD_LABELS: Record<BillingPeriod, string> = {
  monthly:   'Mensuel',
  quarterly: 'Trimestriel',
  annual:    'Annuel',
}

const PERIOD_SUBLABELS: Record<BillingPeriod, string | null> = {
  monthly:   null,
  quarterly: '-15 %',
  annual:    '-20 %',
}

interface LandingPageProps {
  // Quand App.tsx gère la session, il passe ces props
  externalAccountPanel?:  AccountPanelView | null
  onOpenAccountPanel?:    (v: AccountPanelView | null) => void
  onAuthenticated?:       (a: Account) => void
  onLogout?:              () => void | Promise<void>
}

export default function LandingPage({
  externalAccountPanel,
  onOpenAccountPanel,
  onAuthenticated,
  onLogout,
}: LandingPageProps = {}) {
  // Si App.tsx gère l'état → on utilise ses callbacks ; sinon mode standalone
  const [_localPanel, _setLocalPanel]           = useState<AccountPanelView | null>(null)
  const [currentAccount, setCurrentAccount]     = useState<Account | null>(null)
  const [billingPeriod, setBillingPeriod]       = useState<BillingPeriod>('monthly')
  const [checkoutLoading, setCheckoutLoading]   = useState<string | null>(null)
  const [checkoutError, setCheckoutError]       = useState<string | null>(null)

  const accountPanel    = externalAccountPanel  !== undefined ? externalAccountPanel  : _localPanel
  const setAccountPanel = onOpenAccountPanel    !== undefined ? onOpenAccountPanel    : _setLocalPanel

  useEffect(() => {
    if (!onAuthenticated) {
      void restoreSession().then(setCurrentAccount)
    }
  }, [onAuthenticated])

  const logout = async () => {
    if (onLogout) { await onLogout(); return }
    await clearSession()
    setCurrentAccount(null)
    setAccountPanel(null)
  }

  const handleCheckout = async (planCode: string) => {
    if (planCode === 'reseau') {
      window.location.href = 'mailto:contact@trouve.fr?subject=Offre Réseau'
      return
    }

    if (!currentAccount) {
      setAccountPanel('register')
      return
    }

    setCheckoutLoading(planCode)
    try {
      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setAccountPanel('login'); return }

      const res = await fetch(`${API_URL}/api/stripe/checkout`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_code: planCode, period: billingPeriod }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setCheckoutError(data.error ?? 'Une erreur est survenue. Veuillez réessayer.')
      }
    } catch {
      setCheckoutError('Service momentanément indisponible. Réessayez dans quelques instants.')
    } finally {
      setCheckoutLoading(null)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f5f8ff] text-[#081228] selection:bg-blue-600/20">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-14rem] h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-blue-300/25 blur-[100px]" />
        <div className="absolute right-[-10rem] top-[30rem] h-[28rem] w-[28rem] rounded-full bg-indigo-300/15 blur-[100px]" />
      </div>

      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between rounded-2xl border border-white/80 bg-white/75 px-5 shadow-[0_14px_50px_-22px_rgba(15,23,42,0.24)] backdrop-blur-xl md:px-6">
          <a href="#" aria-label="trouvé! accueil" className="cursor-pointer">
            <img src={trouveLogo} alt="trouvé!" className="h-8 w-auto md:h-9" />
          </a>
          <div className="hidden items-center gap-7 text-sm font-medium text-slate-500 md:flex">
            <a href="#produit" className="transition-colors hover:text-slate-950">Produit</a>
            <a href="#securite" className="transition-colors hover:text-slate-950">Sécurité</a>
            <a href="#tarifs" className="transition-colors hover:text-slate-950">Tarifs</a>
          </div>
          {currentAccount ? (
            <button
              type="button"
              onClick={() => setAccountPanel('workspace')}
              className="flex items-center gap-2 rounded-xl bg-[#124bd2] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]"
            >
              <BadgeCheck size={15} />
              {currentAccount.firstName} · {currentAccount.role === 'admin' ? 'Admin' : currentAccount.role === 'agence' ? 'Agence' : 'Agent'}
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setAccountPanel('login')}
                className="group inline-flex h-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/90 px-4 text-sm font-semibold text-slate-700 shadow-[0_10px_28px_-20px_rgba(15,23,42,0.55)] backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-[#124bd2] hover:shadow-[0_16px_36px_-22px_rgba(18,75,210,0.55)] active:translate-y-0 sm:px-5"
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setAccountPanel('register')}
                className="group relative inline-flex h-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-[#124bd2] via-[#1558ef] to-[#0b43c9] px-5 text-sm font-bold text-white shadow-[0_18px_38px_-18px_rgba(18,75,210,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-18px_rgba(18,75,210,0.95)] active:translate-y-0 sm:px-6"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                <span className="relative inline-flex items-center gap-2">
                  S'inscrire
                  <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>
          )}
        </nav>
      </header>

      <main>
        <section id="produit" className="px-5 pb-14 pt-36 md:pb-20 md:pt-40">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-blue-200/70 bg-white/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#124bd2] shadow-sm backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#124bd2] animate-pulse" />
              Outil privé · Accès professionnel uniquement
            </div>
            <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.06] tracking-[-0.04em] text-[#070f22] sm:text-5xl md:text-[4.5rem]">
              Trouvez les bons contacts.
              <span className="block bg-gradient-to-r from-[#124bd2] via-[#1e6cff] to-[#3b8eff] bg-clip-text text-transparent">Instantanément.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-slate-500 md:text-lg">
              Le moteur de recherche métier des professionnels de l'immobilier.
              Rapide, fiable, sécurisé.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setAccountPanel('register')}
                className="btn-glow inline-flex h-13 cursor-pointer items-center gap-2.5 rounded-2xl bg-[#124bd2] px-8 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0f3fc7]"
              >
                Accéder gratuitement
                <ArrowRight size={17} />
              </button>
              <a href="#tarifs" className="inline-flex h-13 cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-7 font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all hover:border-blue-200 hover:bg-blue-50 hover:text-[#124bd2]">
                Voir les offres
              </a>
            </div>

            {/* Stats strip */}
            <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-3">
              {STATS.map(s => (
                <div key={s.label} className="flex items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-2.5 backdrop-blur-sm shadow-sm">
                  <s.icon size={14} className="shrink-0 text-[#124bd2]" />
                  <span className="text-sm font-bold text-slate-800 tabular-nums">{s.value}</span>
                  <span className="text-xs text-slate-400">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto mt-16 max-w-6xl">
            <div className="absolute -left-8 top-32 hidden rounded-2xl border border-white bg-white/90 p-4 shadow-xl lg:block">
              <ShieldCheck className="mb-3 text-[#124bd2]" size={20} />
              <p className="text-sm font-semibold">Accès filtré</p>
              <p className="mt-1 text-xs text-slate-500">SIREN + email pro</p>
            </div>
            <div className="absolute -right-7 bottom-28 hidden rounded-2xl border border-white bg-white/95 p-4 shadow-xl lg:block">
              <p className="text-xs text-slate-500">Usage ce mois</p>
              <p className="mt-1 text-xl font-semibold">684 <span className="text-sm text-slate-400">/ 1 500</span></p>
              <p className="mt-2 text-xs font-medium text-emerald-600">Fair use actif</p>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.35)]">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <div className="ml-4 rounded-lg bg-slate-50 px-4 py-1.5 text-xs text-slate-400">app.trouve.fr/recherche</div>
              </div>
              <div className="grid md:grid-cols-[230px_1fr]">
                <aside className="hidden border-r border-slate-100 bg-[#0a1630] p-5 text-white md:block">
                  <img src={trouveLogo} alt="" className="h-7 w-auto brightness-0 invert" />
                  <div className="mt-10 space-y-2 text-sm">
                    <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-3 font-medium"><Search size={17} /> Recherche</div>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/55"><Heart size={17} /> Favoris</div>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/55"><History size={17} /> Historique</div>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-3 text-white/55"><BarChart3 size={17} /> Usage</div>
                  </div>
                </aside>
                <div className="p-5 sm:p-7 md:p-8">
                  <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Recherche professionnelle</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Nouveau ciblage</h2>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                      <ShieldCheck size={15} /> Compte nominatif validé
                    </div>
                  </div>
                  <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row">
                    <div className="flex flex-1 items-center gap-3 rounded-xl bg-white px-4 py-3 text-slate-500 shadow-sm">
                      <Search size={17} />
                      <span className="text-sm">Agence immobilière · Paris 08</span>
                    </div>
                    <button className="rounded-xl bg-[#124bd2] px-6 py-3 text-sm font-semibold text-white">Rechercher</button>
                  </div>
                  <div className="mt-7 flex items-center justify-between">
                    <p className="font-semibold">3 résultats utiles</p>
                    <p className="text-xs text-slate-500">Consultation journalisée</p>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100">
                    {resultRows.map((row, index) => (
                      <div key={row.name} className={`flex items-center justify-between gap-4 bg-white px-4 py-4 ${index !== resultRows.length - 1 ? 'border-b border-slate-100' : ''}`}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{row.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{row.type} · {row.city}</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{row.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section "Comment ça marche" ─────────────────────────────────── */}
        <section className="px-5 py-14 md:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#124bd2]">Simple et rapide</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#070f22]">
                Opérationnel en 5 minutes chrono.
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div key={step.num} className="card-lift relative rounded-3xl border border-slate-100 bg-white p-7 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08)]">
                  <div className={`mb-5 inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${step.color}`}>
                    {step.num}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="absolute right-0 top-1/2 hidden -translate-y-1/2 translate-x-1/2 text-slate-200 md:block">
                      <ArrowRight size={18} />
                    </div>
                  )}
                  <h3 className="font-bold text-slate-800">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section Recherche avancée ────────────────────────────────────── */}
        <section className="px-5 py-14 md:py-20">
          {/* Heading */}
          <div className="mx-auto mb-10 max-w-4xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-[#124bd2]">Recherche avancée</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#070f22] md:text-4xl">
              Ciblez avec précision.<br />
              <span className="text-[#124bd2]">Des dizaines de critères combinables.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-500">
              Combinez librement état civil, coordonnées, adresse et réseaux pour obtenir des résultats ultra-précis en moins de 200 ms.
            </p>
          </div>

          {/* Browser-chrome mockup */}
          <div className="mx-auto max-w-4xl">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_40px_100px_rgba(15,23,42,0.18)]">
              {/* Browser bar */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <div className="ml-4 rounded-lg bg-slate-50 px-4 py-1.5 text-xs text-slate-400">app.trouve.fr/recherche-avancee</div>
              </div>

              <div className="grid md:grid-cols-[230px_1fr]">
                {/* Sidebar */}
                <aside className="hidden border-r border-slate-100 bg-[#0a1630] p-5 text-white md:block">
                  <img src={trouveLogo} alt="" className="h-7 w-auto brightness-0 invert" />
                  <div className="mt-10 space-y-1 text-sm">
                    <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 font-medium"><Search size={16} /> Recherche</div>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/50"><Heart size={16} /> Favoris</div>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/50"><History size={16} /> Historique</div>
                    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/50"><BarChart3 size={16} /> Usage</div>
                  </div>
                </aside>

                {/* Content area */}
                <div className="flex flex-col bg-slate-50">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#124bd2]">Recherche avancée</p>
                      <p className="text-base font-semibold tracking-tight">Nouveau ciblage</p>
                    </div>
                    <button className="rounded-lg bg-[#124bd2] px-3 py-1.5 text-xs font-bold text-white">Lancer →</button>
                  </div>

                  {/* Category pills */}
                  <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-white px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#124bd2]">État civil</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">Origine</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">Coordonnées</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-600">Adresse</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">Jeux &amp; Réseaux</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">Autres données</span>
                  </div>

                  {/* Active fields */}
                  <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4 md:grid-cols-4">
                    <div className="rounded-lg border-2 border-blue-200 bg-white p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Prénom</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#124bd2]">Martin</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nom</p>
                      <p className="mt-0.5 text-sm text-slate-300">ex: Dupont</p>
                    </div>
                    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/50 p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ville naissance</p>
                      <p className="mt-0.5 text-sm font-semibold text-indigo-600">Paris</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Date naissance</p>
                      <p className="mt-0.5 text-sm text-slate-300">jj/mm/aaaa</p>
                    </div>
                  </div>

                  {/* Results */}
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">2 correspondances</span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">187 ms</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">Martin Pierre</p>
                          <p className="text-[11px] text-slate-400">Né le 12/03/1985 · Paris 11e</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">Vérifié</span>
                      </div>
                      <div className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">Martin Thomas</p>
                          <p className="text-[11px] text-slate-400">Né le 07/11/1990 · Paris 08e</p>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700">Vérifié</span>
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-400">Consultation journalisée · Données officielles Sirene</p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <a
                href="#tarifs"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#124bd2] px-8 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-[#0b3fbc]"
              >
                ⚡ Commencer — 14 jours offerts →
              </a>
              <p className="text-xs text-slate-400">Sans engagement · Résiliation en 1 clic · Accès immédiat</p>
            </div>
          </div>
        </section>

        <section id="securite" className="px-5 py-14 md:py-20">
          <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-[2rem] bg-[#0a1630] p-7 text-white md:p-10">
              <p className="text-sm font-semibold text-blue-300">Pensé pour les équipes métier</p>
              <h2 className="mt-3 max-w-lg text-3xl font-semibold tracking-tight md:text-4xl">
                Prospection utile. Usage maîtrisé.
              </h2>
              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                {safeguards.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <item.icon className="text-blue-300" size={18} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-7 text-sm text-white/60">
                Opposition et suppression possibles. Revente et extraction automatisée interdites.
              </p>
            </div>

            <div id="acces" className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-blue-50 p-2.5 text-[#124bd2]"><Building2 size={20} /></div>
                <div>
                  <h2 className="font-semibold">Comptes professionnels</h2>
                  <p className="text-xs text-slate-500">Inscription et validation contrôlée</p>
                </div>
              </div>
              <div className="mt-6 space-y-3 text-sm text-slate-600">
                <p className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <Check size={15} className="text-blue-600" /> SIREN vérifié lors de l’inscription
                </p>
                <p className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <Check size={15} className="text-blue-600" /> Comptes Agent et Agence nominatifs
                </p>
                <p className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <Check size={15} className="text-blue-600" /> Validation et supervision Admin
                </p>
              </div>
              <div className="mt-6 space-y-3">
                <button
                  type="button"
                  onClick={() => setAccountPanel('register')}
                  className="h-12 w-full cursor-pointer rounded-xl bg-[#124bd2] text-sm font-semibold text-white transition hover:bg-[#0b3fbc]"
                >
                  Créer un compte professionnel
                </button>
                <button
                  type="button"
                  onClick={() => setAccountPanel('login')}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Ouvrir mon espace
                </button>
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">
                Données entreprise : Annuaire des Entreprises / Sirene
              </p>
            </div>
          </div>
        </section>

        <section id="tarifs" className="px-5 pb-24 pt-10 md:pb-32 md:pt-16">
          <div className="mx-auto max-w-6xl">

            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-semibold text-[#124bd2]">Offres</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Un abonnement, pas des fichiers.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
                Usage mensuel raisonnable inclus, sans export massif, avec limites anti-abus
                adaptées à votre équipe.
              </p>
            </div>

            {/* Toggle période */}
            <div className="mt-8 flex justify-center">
              <div className="relative flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                {(Object.keys(PERIOD_LABELS) as BillingPeriod[]).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setBillingPeriod(period)}
                    className={`relative flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                      billingPeriod === period
                        ? 'bg-[#124bd2] text-white shadow'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {PERIOD_LABELS[period]}
                    {PERIOD_SUBLABELS[period] && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                        billingPeriod === period
                          ? 'bg-white/20 text-white'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {PERIOD_SUBLABELS[period]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {billingPeriod === 'annual' && (
              <p className="mt-3 text-center text-xs text-emerald-600 font-medium">
                🎉 Économisez jusqu'à <strong>2 160 €</strong> par an sur le plan Pro
              </p>
            )}
            {billingPeriod === 'quarterly' && (
              <p className="mt-3 text-center text-xs text-emerald-600 font-medium">
                💡 Idéal pour tester sans engagement annuel · 1 mois offert par trimestre
              </p>
            )}

            {/* Erreur checkout */}
            {checkoutError && (
              <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertCircle size={16} className="shrink-0 text-red-500" />
                <span className="flex-1">{checkoutError}</span>
                <button onClick={() => setCheckoutError(null)} className="text-red-400 hover:text-red-600 transition">
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Grille de plans */}
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => {
                const price     = plan.pricing[billingPeriod]
                const isDevis   = plan.code === 'reseau'
                const isLoading = checkoutLoading === plan.code

                return (
                  <div
                    key={plan.code}
                    className={`relative flex flex-col rounded-3xl border bg-white p-6 transition-all ${
                      plan.recommended
                        ? 'border-blue-300 shadow-[0_14px_50px_-20px_rgba(18,75,210,0.5)]'
                        : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                    }`}
                  >
                    {plan.recommended && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#124bd2] px-4 py-1 text-[11px] font-bold text-white shadow-lg shadow-blue-500/30">
                        ⭐ Populaire
                      </span>
                    )}

                    {/* En-tête du plan */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{plan.description}</p>
                      <p className="mt-1 text-xl font-bold">{plan.name}</p>
                    </div>

                    {/* Prix */}
                    <div className="mt-5">
                      {isDevis ? (
                        <p className="text-2xl font-bold text-slate-800">Sur devis</p>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold tracking-tight">{price.amount}&nbsp;€</span>
                            <span className="text-sm text-slate-400">/ mois</span>
                          </div>
                          {'saving' in price && price.saving && (
                            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                              <Sparkles size={10} />
                              {price.saving}
                            </span>
                          )}
                          {billingPeriod !== 'monthly' && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              {billingPeriod === 'quarterly'
                                ? `Facturé ${(price.amount * 3).toLocaleString('fr-FR')} € / trimestre`
                                : `Facturé ${(price.amount * 12).toLocaleString('fr-FR')} € / an`}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <div className="my-5 h-px bg-slate-100" />

                    {/* Features */}
                    <ul className="flex-1 space-y-2.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                          <Check size={14} className="mt-0.5 shrink-0 text-[#124bd2]" />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      type="button"
                      onClick={() => handleCheckout(plan.code)}
                      disabled={isLoading}
                      className={`mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition ${
                        plan.recommended
                          ? 'bg-[#124bd2] text-white hover:bg-[#0b3fbc] shadow-lg shadow-blue-500/20'
                          : isDevis
                            ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:opacity-60`}
                    >
                      {isLoading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : isDevis ? (
                        <>Nous contacter <ArrowRight size={14} /></>
                      ) : (
                        <>
                          {plan.recommended ? <Zap size={14} /> : null}
                          Commencer — 14 jours offerts
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>

                    {!isDevis && (
                      <p className="mt-2 text-center text-[10px] text-slate-400">
                        Sans engagement · Résiliation en 1 clic
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Bannière add-ons */}
            <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">Besoin de plus ?</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    Ajoutez des recherches ou des sièges à la carte, sans changer de plan.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold">+500 recherches</p>
                      <p className="text-xs text-slate-500">Valable 30 jours</p>
                    </div>
                    <span className="text-lg font-bold text-[#124bd2]">49 €</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-semibold">Siège supplémentaire</p>
                      <p className="text-xs text-slate-500">Par mois</p>
                    </div>
                    <span className="text-lg font-bold text-[#124bd2]">59 €</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Réassurance */}
            <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Paiement sécurisé par Stripe</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Facture TVA automatique</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> 14 jours d'essai gratuit</span>
              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Résiliation sans frais</span>
            </div>

          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <img src={trouveLogo} alt="trouvé!" className="h-7 w-auto" />
          <p className="text-xs text-slate-500">Outil privé B2B · Accès vérifié · © 2026 trouvé!</p>
        </div>
      </footer>
      <ChatWidget />
      {accountPanel && (
        <AccountPanel
          initialView={accountPanel}
          currentAccount={currentAccount}
          onAuthenticated={(a) => {
            setCurrentAccount(a)
            onAuthenticated?.(a)
          }}
          onClose={() => setAccountPanel(null)}
          onLogout={logout}
        />
      )}
    </div>
  )
}
