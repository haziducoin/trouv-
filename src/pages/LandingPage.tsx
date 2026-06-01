import { useEffect, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Ban,
  BarChart3,
  Check,
  Heart,
  History,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
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
  {
    name: 'Camille Moreau',
    context: 'Camille Moreau · Paris 16',
    phone: '06 42 18 74 93',
    email: 'camille.moreau@gmail.com',
    status: 'Contact trouvé',
    confidenceLabel: 'Confiance élevée',
    confidenceScore: '98%',
  },
  {
    name: 'Camille M.',
    context: 'Boulogne · même nom, ville proche',
    phone: '07 58 29 64 21',
    email: 'c.moreau.pro@gmail.com',
    status: 'Homonyme possible',
    confidenceLabel: 'Confiance moyenne',
    confidenceScore: '62%',
  },
  {
    name: 'C. Moreau',
    context: 'Lyon · écarté par localisation',
    phone: '06 11 90 35 48',
    email: 'contact.moreau@gmail.com',
    status: 'Écarté',
    confidenceLabel: 'Confiance faible',
    confidenceScore: '24%',
  },
]

const safeguards = [
  { icon: UserRoundCheck, label: 'Comptes nominatifs vérifiés' },
  { icon: Ban, label: 'Anti-extraction massive' },
  { icon: History, label: "Registres d'utilisation" },
  { icon: LockKeyhole, label: 'Conformité stricte' },
]

const STEPS = [
  {
    num: '01',
    title: 'Essayez en aperçu',
    desc: '5 recherches de démonstration. Les numéros 06/07 et emails restent masqués.',
    color: 'bg-blue-50 text-[#124bd2]',
  },
  {
    num: '02',
    title: 'Croisez les indices',
    desc: 'Nom, prénom, ville, téléphone, email, adresse, entreprise ou réseau public.',
    color: 'bg-indigo-50 text-indigo-600',
  },
  {
    num: '03',
    title: 'Débloquez le contact',
    desc: 'Accès complet : mobiles 06/07, emails directs, favoris, historique et exports maîtrisés.',
    color: 'bg-emerald-50 text-emerald-600',
  },
]

const DEMO_FLOW = [
  {
    label: 'Aperçu',
    title: '5 recherches de démonstration',
    desc: 'Explorez le moteur avec des données de démo. Les emails et téléphones restent masqués.',
  },
  {
    label: 'Validation',
    title: 'Compte pro vérifié',
    desc: 'Inscription avec email professionnel. L’accès complet est activé après validation.',
  },
  {
    label: 'Complet',
    title: 'Coordonnées déverrouillées',
    desc: 'Recherches, favoris, historique, exports maîtrisés et quotas selon votre offre.',
  },
]

// ─── Catalogue de plans ───────────────────────────────────────────────────────
const PLANS = [
  {
    code: 'solo',
    name: 'Solo',
    description: 'Accès complet indépendant',
    users: 1,
    searches: 1500,
    recommended: false,
    pricing: {
      monthly:   { amount: 199, label: '199 €' },
      quarterly: { amount: 169, label: '169 €', saving: '1 mois offert' },
      annual:    { amount: 159, label: '159 €', saving: '2 mois offerts' },
    },
    features: [
      'Accès complet après validation',
      '1 500 recherches / mois',
      '1 compte nominatif',
      'Coordonnées complètes',
      'Historique 90 jours',
      'Export PDF maîtrisé',
    ],
  },
  {
    code: 'agence',
    name: 'Agence',
    description: 'Offre équipe principale',
    users: 3,
    searches: 5000,
    recommended: true,
    pricing: {
      monthly:   { amount: 499, label: '499 €' },
      quarterly: { amount: 424, label: '424 €', saving: '1 mois offert' },
      annual:    { amount: 399, label: '399 €', saving: '2 mois offerts' },
    },
    features: [
      'Accès complet équipe',
      '5 000 recherches / mois',
      '3 comptes nominatifs',
      'Dashboard agence',
      'Exports CSV encadrés',
      'Historique 12 mois',
      "Logs d'utilisation",
      'Support prioritaire',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Pour structures avancées',
    users: 7,
    searches: 12000,
    recommended: false,
    pricing: {
      monthly:   { amount: 899, label: '899 €' },
      quarterly: { amount: 764, label: '764 €', saving: '1 mois offert' },
      annual:    { amount: 719, label: '719 €', saving: '2 mois offerts' },
    },
    features: [
      'Accès complet multi-équipe',
      '12 000 recherches / mois',
      '7 comptes nominatifs',
      'Rôles agence / admin',
      'API disponible sur validation',
      'Intégrations CRM',
      "Audit d'usage avancé",
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
      'Multi-agences',
      'Volume personnalisé',
      'Infrastructure adaptée',
      'SSO / SAML',
      'Contrat dédié',
      'Accompagnement CSM',
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

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function ContactPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-[#124bd2] ring-1 ring-blue-100/80">
      <span className="text-[#124bd2]">{icon}</span>
      <span>{children}</span>
    </span>
  )
}

function statusClasses(status: string) {
  if (status === 'Contact trouvé') return 'bg-emerald-50 text-emerald-700'
  if (status === 'Homonyme possible') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-500'
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
    <div className="min-h-screen overflow-x-hidden bg-white text-[#081228] selection:bg-blue-600/20">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-16rem] h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-blue-100/45 blur-[110px]" />
      </div>

      <header className="fixed inset-x-0 top-0 z-50 px-6 py-6">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between bg-white/85 backdrop-blur-sm">
          <a href="#" aria-label="trouvé! accueil" className="cursor-pointer">
            <img src={trouveLogo} alt="trouvé!" className="h-9 w-auto md:h-11" />
          </a>
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
                className="inline-flex h-12 items-center justify-center rounded-full px-4 text-base font-semibold text-slate-800 transition hover:text-[#124bd2] sm:px-6"
              >
                Connexion
              </button>
              <button
                type="button"
                onClick={() => setAccountPanel('register')}
                className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-[#124bd2] via-[#1558ef] to-[#0b43c9] px-6 text-base font-bold text-white shadow-[0_18px_38px_-18px_rgba(18,75,210,0.9)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-18px_rgba(18,75,210,0.95)] active:translate-y-0 sm:px-8"
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
        <section id="produit" className="flex min-h-[92vh] items-center px-5 pb-16 pt-32 md:pb-20 md:pt-36">
          <div className="mx-auto max-w-5xl text-center">
            <h1 className="mx-auto max-w-4xl text-4xl font-bold leading-[1.06] tracking-[-0.04em] text-[#070f22] sm:text-5xl md:text-[4.5rem]">
              Identifiez le bon contact.
              <span className="block bg-gradient-to-r from-[#124bd2] via-[#1e6cff] to-[#3b8eff] bg-clip-text text-transparent">Instantanément.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-4xl text-xl leading-relaxed text-slate-800 md:text-2xl">
              Le moteur de recherche pour identifier et contacter vos cibles qualifiées.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => { window.location.href = '/?demo=1' }}
                className="btn-glow inline-flex h-16 cursor-pointer items-center gap-3 rounded-full bg-[#124bd2] px-10 text-lg font-bold text-white shadow-[0_22px_44px_-22px_rgba(18,75,210,0.85)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0f3fc7]"
              >
                Voir la démo
                <ArrowRight size={22} />
              </button>
              <button
                type="button"
                onClick={() => setAccountPanel('register')}
                className="inline-flex h-16 cursor-pointer items-center gap-3 rounded-full border border-slate-200 bg-white px-8 text-lg font-bold text-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:text-[#124bd2]"
              >
                Créer un accès complet
              </button>
            </div>
          </div>
        </section>

        <section id="demo" className="px-5 pb-14 md:pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[#070f22] md:text-4xl">
                Retrouvez un 06, un 07 ou un email.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-base text-slate-500">
                Entrez les indices que vous avez. trouvé! recoupe et vous montre les coordonnées utiles en aperçu.
              </p>
            </div>

            <div className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.35)]">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                <div className="ml-4 rounded-lg bg-slate-50 px-4 py-1.5 text-xs text-slate-400">www.xn--trouv-fsa.fr/recherche</div>
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
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">Recherche par indices</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Coordonnées à retrouver</h2>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                      <ShieldCheck size={15} /> Aperçu sécurisé
                    </div>
                  </div>
                  <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row">
                    <div className="flex flex-1 items-center gap-3 rounded-xl bg-white px-4 py-3 text-slate-500 shadow-sm">
                      <Search size={17} />
                      <span className="text-sm font-bold text-slate-900">Camille Moreau · Paris 16</span>
                    </div>
                    <button className="rounded-xl bg-[#124bd2] px-6 py-3 text-sm font-semibold text-white">Rechercher</button>
                  </div>
                  <div className="mt-7 flex items-center justify-between">
                    <p className="font-semibold">Contacts probables</p>
                    <p className="text-xs text-slate-500">Aperçu masqué</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {resultRows.map((row, index) => (
                      <div key={`${row.name}-${row.context}`} className="grid gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.5)] md:grid-cols-[1fr_190px] md:items-center">
                        <div className="flex min-w-0 gap-4">
                          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-xl font-extrabold ${
                            index === 1 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-[#124bd2]'
                          }`}>
                            {initialsFromName(row.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-lg font-extrabold text-[#081228]">{row.name}</p>
                              {index === 0 && <BadgeCheck size={18} className="fill-[#124bd2] text-white" />}
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-slate-500">
                              <MapPin size={15} className="text-slate-400" />
                              {row.context}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <ContactPill icon={<Phone size={17} />}>{row.phone}</ContactPill>
                              <ContactPill icon={<Mail size={17} />}>{row.email}</ContactPill>
                            </div>
                          </div>
                        </div>
                        <div className="border-slate-100 md:border-l md:pl-6">
                          <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${statusClasses(row.status)}`}>
                            {index === 0 ? <Check size={16} /> : index === 1 ? <AlertCircle size={16} /> : <X size={15} />}
                            {row.status}
                          </span>
                          <div className="mt-5 flex items-center justify-between gap-3 text-sm font-bold text-slate-600">
                            <span className="inline-flex items-center gap-2">
                              <ShieldCheck size={18} className="text-[#124bd2]" />
                              {row.confidenceLabel}
                            </span>
                            <span className="text-[#124bd2]">{row.confidenceScore}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-3">
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
        <section id="criteres" className="px-5 py-14 md:py-20">
          {/* Heading */}
          <div className="mx-auto mb-10 max-w-4xl text-center">
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#070f22] md:text-4xl">
              Ciblez avec une précision chirurgicale.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-500">
              Cherchez avec un nom, un prénom, une ville, un bout de téléphone, un email, une adresse, une entreprise ou un profil public.
              L’outil isole les homonymes et indique les coordonnées à débloquer.
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
                <div className="ml-4 rounded-lg bg-slate-50 px-4 py-1.5 text-xs text-slate-400">www.xn--trouv-fsa.fr/recherche-avancee</div>
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
                      <p className="text-base font-semibold tracking-tight">Anti-homonymes actif</p>
                    </div>
                    <button className="rounded-lg bg-[#124bd2] px-3 py-1.5 text-xs font-bold text-white">Lancer →</button>
                  </div>

                  {/* Category pills */}
                  <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-white px-5 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-[#124bd2]">Nom / prénom</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-600">06 / 07</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600">Email direct</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">Ville / adresse</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-600">Entreprise</span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500">Réseaux publics</span>
                  </div>

                  {/* Active fields */}
                  <div className="grid grid-cols-2 gap-2 border-b border-slate-200 p-4 md:grid-cols-4">
                    <div className="rounded-lg border-2 border-blue-200 bg-white p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Nom</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#124bd2]">Camille Moreau</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Téléphone</p>
                      <p className="mt-0.5 text-sm text-slate-700">06 42 18</p>
                    </div>
                    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/50 p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Ville</p>
                      <p className="mt-0.5 text-sm font-semibold text-indigo-600">Paris 16</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Email</p>
                      <p className="mt-0.5 text-sm text-emerald-600">gmail.com</p>
                    </div>
                  </div>

                  {/* Results */}
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700">Meilleure correspondance</span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">06/07 détecté</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="px-5 py-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-base font-bold">Camille Moreau</p>
                            <p className="mt-1 text-sm text-slate-500">Paris 16 · Adresse cohérente · profil public trouvé</p>
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold text-emerald-700">Contact trouvé</span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <ContactPill icon={<Phone size={17} />}>06 42 18 74 93</ContactPill>
                          <ContactPill icon={<Mail size={17} />}>camille.moreau@gmail.com</ContactPill>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </section>

        <section id="securite" className="px-5 py-14 md:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="rounded-[2rem] bg-[#0a1630] p-7 text-white md:p-10">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                    Un usage maîtrisé et responsable.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/60">
                    Infrastructure sécurisée. Comptes nominatifs, email professionnel et validation avant accès complet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAccountPanel('register')}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-bold text-[#0a1630] transition hover:bg-blue-50"
                >
                  Créer un accès pro
                </button>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {safeguards.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                    <item.icon className="text-blue-300" size={18} />
                    <p className="mt-3 text-sm font-semibold">{item.label}</p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-xs text-white/45">
                Sources publiques et professionnelles. Logs auditables par les admins.
              </p>
            </div>
          </div>
        </section>

        <section id="apercu" className="px-5 py-12 md:py-16">
          <div className="mx-auto max-w-6xl">
            <div className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_30px_90px_-45px_rgba(18,75,210,0.55)]">
              <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                <div className="bg-gradient-to-br from-[#124bd2] to-[#071a56] p-7 text-white md:p-9">
                  <p className="text-sm font-semibold text-blue-100">Vision démo</p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                    Essayez avant de débloquer.
                  </h2>
                  <p className="mt-4 text-sm leading-relaxed text-blue-50/80">
                    La démo montre le moteur sans exposer les coordonnées complètes. L’accès complet arrive après inscription professionnelle et validation.
                  </p>
                  <button
                    type="button"
                    onClick={() => { window.location.href = '/?demo=1' }}
                    className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-bold text-[#124bd2] transition hover:bg-blue-50"
                  >
                    Lancer l’aperçu gratuit
                    <ArrowRight size={16} />
                  </button>
                </div>

                <div className="p-6 md:p-8">
                  <div className="grid gap-3 md:grid-cols-3">
                    {DEMO_FLOW.map((item, index) => (
                      <div key={item.label} className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white text-xs font-bold text-[#124bd2] shadow-sm">
                          {index + 1}
                        </span>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{item.label}</p>
                        <h3 className="mt-2 text-base font-bold text-slate-900">{item.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">Démo visible : 5 recherches masquées</p>
                        <p className="mt-1 text-xs text-slate-500">Compte en attente : 10 recherches masquées. Offre active : accès complet selon quota.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAccountPanel('register')}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#124bd2] px-4 text-sm font-bold text-white transition hover:bg-[#0b3fbc]"
                      >
                        Demander l’accès complet
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="tarifs" className="px-5 pb-24 pt-10 md:pb-32 md:pt-16">
          <div className="mx-auto max-w-6xl">

            {/* Header */}
            <div className="text-center">
              <p className="text-sm font-semibold text-[#124bd2]">Offres</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
                Débloquez l’accès complet.
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
                Testez en aperçu, inscrivez votre société, puis accédez aux coordonnées complètes après validation professionnelle.
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
                Économisez jusqu'à <strong>2 160 €</strong> par an sur le plan Pro
              </p>
            )}
            {billingPeriod === 'quarterly' && (
              <p className="mt-3 text-center text-xs text-emerald-600 font-medium">
                Idéal pour tester sans engagement annuel · 1 mois offert par trimestre
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

	                    {!isDevis && (
	                      <p className="mt-4 rounded-2xl bg-blue-50 px-3 py-2 text-xs font-semibold text-[#124bd2]">
	                        Accès complet après validation professionnelle
	                      </p>
	                    )}

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
	                          {plan.recommended ? 'Choisir Agence' : `Choisir ${plan.name}`}
	                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>

                    {!isDevis && (
                      <p className="mt-2 text-center text-[10px] text-slate-400">
	                        Aperçu gratuit disponible avant inscription
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
	                  <p className="font-semibold">Besoin de plus après validation ?</p>
	                  <p className="mt-0.5 text-sm text-slate-500">
	                    Ajoutez des recherches ou des sièges à la carte, avec le même contrôle d’usage.
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
	              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Aperçu gratuit : 5 recherches masquées</span>
	              <span className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500" /> Validation pro avant accès complet</span>
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
