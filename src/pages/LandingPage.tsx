import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
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
  MonitorPlay,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRoundCheck,
  Users,
  X,
  Zap,
} from 'lucide-react'
import AccountPanel, { type AccountPanelView } from '@/components/account/AccountPanel'
import ChatWidget from '@/components/ChatWidget'
import { NavBar } from '@/components/ui/tubelight-navbar'
import { PricingSection } from '@/components/ui/pricing'
import { AnimatedTestimonials, type Testimonial } from '@/components/ui/animated-testimonials'
import { ContainerScroll } from '@/components/ui/container-scroll-animation'
import { DynamicWaveBg } from '@/components/ui/dynamic-wave-bg'
import { FAQSection } from '@/components/ui/faq-section'
import { FranceMap } from '@/components/ui/france-map'
import { UserAvatars } from '@/components/ui/user-avatars'
import { IntegrationsStrip } from '@/components/ui/integrations-strip'
import { LiquidButton } from '@/components/ui/liquid-glass-button'
import trouveLogo from '@/assets/trouve-logo.png'

import { clearSession, restoreSession, type Account } from '@/lib/accountStore'
import { getSupabaseClient } from '@/lib/supabase'

type BillingPeriod = 'monthly' | 'quarterly' | 'annual'


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

const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    name: 'Sophie Marchand',
    role: 'Directrice agence',
    company: 'Marchand Immobilier · Paris 16e',
    content: "trouvé! a transformé notre prospection. En 30 secondes je trouve n'importe quelle agence partenaire en France. On a multiplié nos prises de contact par 4 en deux mois.",
    rating: 5,
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    initials: 'SM',
  },
  {
    id: 2,
    name: 'Karim Benali',
    role: 'Mandataire indépendant',
    company: 'IAD France · Lyon',
    content: "Les données sont fiables et toujours à jour. J'utilise l'export CSV chaque semaine pour alimenter mon CRM. Un outil indispensable pour tout pro de l'immo sérieux.",
    rating: 5,
    avatar: 'https://randomuser.me/api/portraits/men/46.jpg',
    initials: 'KB',
  },
  {
    id: 3,
    name: 'Élise Fontaine',
    role: 'Responsable développement réseau',
    company: 'Century 21 · Bordeaux',
    content: "On cherche des agences à recruter sur tout le territoire. Avant trouvé!, on passait des heures sur des annuaires obsolètes. Maintenant c'est 10 minutes par jour, résultats en temps réel.",
    rating: 5,
    avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
    initials: 'EF',
  },
]

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
  // billingPeriod géré dans PricingSection
  const [checkoutLoading, setCheckoutLoading]   = useState<string | null>(null)
  const [checkoutError, setCheckoutError]       = useState<string | null>(null)
  const [emailInput, setEmailInput]             = useState('')
  const [showQualModal, setShowQualModal]       = useState(false)
  const [demoTransition, setDemoTransition]     = useState<'hidden' | 'visible' | 'leaving'>('hidden')
  const [titleNumber, setTitleNumber]           = useState(0)
  const heroTitles = useMemo(
    () => ['Instantanément.', 'Rapidement.', 'Précisément.', 'Sûrement.'],
    []
  )
  useEffect(() => {
    const id = setTimeout(() => {
      setTitleNumber(prev => (prev === heroTitles.length - 1 ? 0 : prev + 1))
    }, 2200)
    return () => clearTimeout(id)
  }, [titleNumber, heroTitles])

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

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailInput.trim() || !emailInput.includes('@')) return
    setShowQualModal(true)
  }

  const triggerDemoTransition = () => {
    setDemoTransition('visible')
    setTimeout(() => setDemoTransition('leaving'), 1600)
    setTimeout(() => { window.location.href = '/?demo=1' }, 2000)
  }

  const handleCheckout = async (planCode: string, period: 'monthly' | 'annual' = 'monthly') => {
    if (planCode === 'entreprise' || planCode === 'reseau') {
      window.location.href = 'mailto:contact@trouve.fr?subject=Offre Entreprise sur mesure'
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

      // Same-origin : fonctions serverless Vercel (/api/stripe/*)
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan_code: planCode, period }),
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
    <div className="min-h-screen overflow-x-hidden bg-transparent text-[#081228] selection:bg-blue-600/20">
      {/* Blobs bleus animés en fond fixe sur toute la page */}
      <DynamicWaveBg />

      <header className="fixed inset-x-0 top-0 z-50 px-6 py-4">
        <nav className="mx-auto flex h-14 max-w-7xl items-center justify-between rounded-2xl bg-white/85 px-6 shadow-sm ring-1 ring-slate-100/80 backdrop-blur-md">
          <a href="#produit" aria-label="trouvé! accueil" className="cursor-pointer flex-shrink-0">
            <img src={trouveLogo} alt="trouvé!" className="h-9 w-auto md:h-10" />
          </a>

          {/* Navigation — tubelight navbar (masquée sur mobile) */}
          {!currentAccount && (
            <NavBar
              items={[
                { name: 'Démo',            url: '#demo',     icon: MonitorPlay },
                { name: 'Fonctionnalités', url: '#criteres', icon: Sparkles },
                { name: 'Tarifs',          url: '#tarifs',   icon: Tag },
                { name: 'Sécurité',        url: '#securite', icon: ShieldCheck },
              ]}
              className="absolute left-1/2 top-1/2 z-20 mb-0 hidden -translate-y-1/2 bottom-auto sm:top-1/2 sm:pt-0 md:block"
            />
          )}

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
        <section
          id="produit"
          className="relative flex min-h-[92vh] items-center overflow-hidden px-5 pb-20 pt-28 md:pb-28 md:pt-36"
        >

          <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 text-center">

            {/* H1 + animated word */}
            <div className="flex flex-col gap-5">
              <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight text-[#070f22] md:text-7xl" style={{ lineHeight: 1.05 }}>
                Retrouvez les bons contacts
                <span className="relative mt-3 flex h-[1.2em] w-full items-center justify-center overflow-hidden">
                  &nbsp;
                  {heroTitles.map((title, index) => (
                    <motion.span
                      key={index}
                      className="absolute bg-gradient-to-r from-[#124bd2] via-[#1e6cff] to-[#3b8eff] bg-clip-text text-transparent"
                      initial={{ opacity: 0, y: -60 }}
                      transition={{ type: 'spring', stiffness: 60, damping: 14 }}
                      animate={
                        titleNumber === index
                          ? { y: 0, opacity: 1 }
                          : { y: titleNumber > index ? -100 : 100, opacity: 0 }
                      }
                    >
                      {title}
                    </motion.span>
                  ))}
                </span>
              </h1>

              <p className="mx-auto max-w-xl text-lg leading-relaxed text-slate-500 md:text-xl">
                Retrouvez les bons contacts à partir d'une simple information.
              </p>
            </div>

            {/* Email form */}
            <div className="w-full max-w-2xl">
              <form
                onSubmit={handleEmailSubmit}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_8px_32px_-8px_rgba(18,75,210,0.18)] sm:flex-row sm:gap-2"
              >
                <div className="relative flex-1">
                  <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    placeholder="Entrez votre adresse email professionnelle..."
                    className="w-full rounded-xl border border-transparent bg-slate-50 py-3.5 pl-11 pr-4 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#124bd2] focus:bg-white focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-glow inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#124bd2] px-7 py-3.5 text-sm font-bold text-white shadow-[0_22px_44px_-22px_rgba(18,75,210,0.85)] transition hover:-translate-y-0.5 hover:bg-[#0f3fc7]"
                >
                  Commencer gratuitement
                  <ArrowRight size={15} />
                </button>
              </form>
            </div>

            {/* CTAs */}
            <div className="flex flex-col items-center gap-4">
              <LiquidButton size="xxxl" onClick={triggerDemoTransition} className="ring-1 ring-[#124bd2]/30">
                Accèdez à la DEMO
              </LiquidButton>
            </div>

            {/* Social proof */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
              <span className="flex items-center gap-3">
                <UserAvatars
                  size={32}
                  overlap={45}
                  maxVisible={5}
                  tooltipPlacement="top"
                  users={[
                    { id: 1, name: 'Julie Durand',   color: '#124bd2' },
                    { id: 2, name: 'Marc Lefebvre',  color: '#0e9f6e' },
                    { id: 3, name: 'Aline Sanchez',  color: '#7c3aed' },
                    { id: 4, name: 'Thomas Roux',    color: '#db2777' },
                    { id: 5, name: 'Sophie Martin',  color: '#d97706' },
                  ]}
                />
                <span><span className="font-semibold text-slate-600">+2 400 professionnels</span> actifs</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Données 100 % professionnelles
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1B54FF]" />
                RGPD & conformité stricte
              </span>
            </div>


          </div>
        </section>

        <section id="demo" className="pb-14 md:pb-20">
          <div className="mx-auto max-w-6xl px-5">
            <ContainerScroll
              titleComponent={
                <div className="mb-4">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#124bd2]">Moteur de recherche</p>
                  <h2 className="text-4xl font-bold tracking-tight text-[#070f22] md:text-5xl">
                    Retrouvez un 06, un 07 ou un email.
                  </h2>
                </div>
              }
            >
              {/* ── Browser chrome ── */}
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 shrink-0">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                  <div className="ml-4 rounded-lg bg-slate-50 px-4 py-1 text-xs text-slate-400">www.xn--trouv-fsa.fr/recherche</div>
                </div>
                <div className="grid min-h-0 flex-1 md:grid-cols-[200px_1fr]">
                  <aside className="hidden border-r border-slate-100 bg-[#0a1630] p-5 text-white md:block">
                    <img src={trouveLogo} alt="" className="h-6 w-auto brightness-0 invert" />
                    <div className="mt-8 space-y-1.5 text-sm">
                      <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 font-medium"><Search size={16} /> Recherche</div>
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/55"><Heart size={16} /> Favoris</div>
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/55"><History size={16} /> Historique</div>
                      <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/55"><BarChart3 size={16} /> Usage</div>
                    </div>
                  </aside>
                  <div className="overflow-y-auto p-4 sm:p-5">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-blue-600">Recherche par indices</p>
                        <h3 className="mt-1 text-lg font-semibold tracking-tight">Coordonnées à retrouver</h3>
                      </div>
                      <div className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
                        <ShieldCheck size={13} /> Aperçu sécurisé
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:flex-row">
                      <div className="flex flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-slate-500 shadow-sm">
                        <Search size={15} />
                        <span className="text-sm font-bold text-slate-900">Camille Moreau · Paris 16</span>
                      </div>
                      <button className="rounded-lg bg-[#124bd2] px-4 py-2.5 text-sm font-semibold text-white">Rechercher</button>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-sm font-semibold">Contacts probables</p>
                      <p className="text-xs text-slate-500">Aperçu masqué</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {resultRows.map((row, index) => (
                        <div key={`scroll-${row.name}`} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${index === 1 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-[#124bd2]'}`}>
                            {initialsFromName(row.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-sm font-bold text-[#081228]">{row.name}</p>
                              {index === 0 && <BadgeCheck size={14} className="fill-[#124bd2] text-white shrink-0" />}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-400">{row.context}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(row.status)}`}>
                            {row.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </ContainerScroll>

            <div className="mt-2 grid gap-4 md:grid-cols-3">
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

        {/* ── Section Couverture France ─────────────────────────────────────── */}
        <section id="couverture" className="px-5 py-14 md:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2">

              {/* Left — text */}
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
              >
                <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#124bd2]">Couverture</p>
                <h2 className="text-3xl font-bold tracking-tight text-[#070f22] md:text-4xl">
                  Données disponibles partout en France
                </h2>
                <p className="mt-4 text-base text-slate-500">
                  Retrouvez n'importe quel professionnel, dans tout le territoire Français, en moins d'une seconde.
                </p>
              </motion.div>

              {/* Right — map */}
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15, duration: 0.5 }}
              >
                <FranceMap
                  dots={[
                    { start: { lat: 48.8566, lng: 2.3522,  label: 'Paris' },      end: { lat: 45.764,  lng: 4.8357,  label: 'Lyon' } },
                    { start: { lat: 48.8566, lng: 2.3522,  label: 'Paris' },      end: { lat: 44.8378, lng: -0.5792, label: 'Bordeaux' } },
                    { start: { lat: 48.8566, lng: 2.3522,  label: 'Paris' },      end: { lat: 50.6292, lng: 3.0573,  label: 'Lille' } },
                    { start: { lat: 45.764,  lng: 4.8357,  label: 'Lyon' },       end: { lat: 43.2965, lng: 5.3698,  label: 'Marseille' } },
                    { start: { lat: 47.2184, lng: -1.5536, label: 'Nantes' },     end: { lat: 48.8566, lng: 2.3522,  label: 'Paris' } },
                    { start: { lat: 48.5734, lng: 7.7521,  label: 'Strasbourg' }, end: { lat: 45.764,  lng: 4.8357,  label: 'Lyon' } },
                  ]}
                />
              </motion.div>

            </div>
          </div>
        </section>

        {/* ── Intégrations ─────────────────────────────────────────────────── */}
        <IntegrationsStrip />

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

        <PricingSection
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading}
          checkoutError={checkoutError}
          onClearError={() => setCheckoutError(null)}
        />

        <AnimatedTestimonials
          title="Ce que disent nos clients"
          subtitle="Plus de 2 400 professionnels font confiance à trouvé! chaque mois."
          badgeText="Ils nous font confiance"
          autoRotateInterval={5000}
          testimonials={TESTIMONIALS}
          trustedCompanies={["IAD France", "Century 21", "ORPI", "Foncia", "Guy Hocquet", "Nexity"]}
          trustedCompaniesTitle="Utilisé par les meilleurs réseaux immobiliers"
          ratingStrip={{ score: "4,9", count: "+340", renewal: "98 %" }}
        />

                {/* ── SECTION SÉCURITÉ & CONFORMITÉ ─────────────────────────────── */}
        <section className="relative px-5 py-24">
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-slate-50/60 to-white" />
          <div className="mx-auto max-w-6xl">

            <div className="mb-14 text-center">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-[#124bd2]">Confiance & Conformité</p>
              <h2 className="text-3xl font-bold tracking-tight text-[#070f22] md:text-4xl">
                Une plateforme construite sur la{' '}
                <span className="bg-gradient-to-r from-[#124bd2] via-[#1e6cff] to-[#3b8eff] bg-clip-text text-transparent">sécurité</span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-base text-slate-500">
                Chaque fonctionnalité a été pensée pour respecter vos données et celles de vos contacts, en conformité totale avec la législation française.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">

              {/* Carte 1 — RGPD */}
              <div className="group rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(18,75,210,0.12)]">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#124bd2] transition group-hover:bg-[#124bd2] group-hover:text-white">
                  <ShieldCheck size={22} strokeWidth={1.8} />
                </div>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-[#070f22]">Protection RGPD absolue</h3>
                  <span className="mt-0.5 shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600">CNIL ✓</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-500">
                  Toutes les données sont <strong className="text-slate-700">chiffrées de bout en bout</strong>. Vos listes de prospects ne sont jamais revendues ni partagées. Vous restez seul propriétaire de vos recherches.
                </p>
                <ul className="mt-5 space-y-2">
                  {['Chiffrement AES-256', "Droit à l'oubli garanti", 'Hébergement 100 % France'].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-xs font-medium text-slate-600">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#124bd2]" />{item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Carte 2 — Sources (fond dark, mise en avant) */}
              <div className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#07113d] to-[#0f2460] p-7 shadow-xl transition hover:-translate-y-1">
                <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-[#1B54FF]/20 blur-3xl" />
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <Search size={22} strokeWidth={1.8} />
                </div>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-white">Sources ouvertes & vérifiées</h3>
                  <span className="mt-0.5 shrink-0 rounded-full border border-white/20 bg-white/15 px-2.5 py-0.5 text-[10px] font-bold text-white/80">Zéro scraping illégal</span>
                </div>
                <p className="text-sm leading-relaxed text-white/70">
                  trouvé! enrichit les données depuis des <strong className="text-white">sources publiques et partenaires agréés uniquement</strong>. Chaque accès est nominatif, tracé et limité par quota.
                </p>
                <ul className="mt-5 space-y-2">
                  {['Comptes nominatifs vérifiés', 'Anti-extraction massive', "Quotas et registres d'usage"].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-xs font-medium text-white/80">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />{item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Carte 3 — CNIL */}
              <div className="group rounded-3xl border border-slate-200/80 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(124,58,237,0.12)]">
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 transition group-hover:bg-purple-600 group-hover:text-white">
                  <BadgeCheck size={22} strokeWidth={1.8} />
                </div>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-[#070f22]">Conformité CNIL & législation</h3>
                  <span className="mt-0.5 shrink-0 rounded-full border border-purple-100 bg-purple-50 px-2.5 py-0.5 text-[10px] font-bold text-purple-600">100 % Légal</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-500">
                  Une plateforme développée en <strong className="text-slate-700">parfaite conformité</strong> avec les directives de la CNIL, le RGPD et les législations françaises sur la protection des données professionnelles.
                </p>
                <ul className="mt-5 space-y-2">
                  {['RGPD & ePrivacy', 'Directives CNIL 2024', 'Audit sécurité annuel'].map(item => (
                    <li key={item} className="flex items-center gap-2.5 text-xs font-medium text-slate-600">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />{item}
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            {/* Bande de garanties */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 rounded-2xl border border-slate-100 bg-white/60 px-8 py-5">
              {([
                { icon: ShieldCheck, label: 'Comptes nominatifs vérifiés' },
                { icon: Zap,         label: 'Anti-extraction massive' },
                { icon: History,     label: "Registres d'utilisation" },
                { icon: LockKeyhole, label: 'Données jamais revendues' },
              ] as const).map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Icon size={15} className="text-emerald-500" />
                  {label}
                </div>
              ))}
            </div>

          </div>
        </section>

        <FAQSection />

      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:gap-5 sm:text-left">
          <img src={trouveLogo} alt="trouvé!" className="h-auto w-36 max-w-[48vw] object-contain sm:h-7 sm:w-auto sm:max-w-none" />
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

      {/* ── Overlay transition Démo ── */}
      {demoTransition !== 'hidden' && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-8"
          style={{
            background: '#07113d',
            opacity: demoTransition === 'leaving' ? 0 : 1,
            transition: `opacity ${demoTransition === 'leaving' ? '400ms' : '350ms'} cubic-bezier(0.4,0,0.2,1)`,
          }}
        >
          {/* Glow ambiant */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(27,84,255,0.18) 0%, transparent 70%)' }}
          />

          {/* Logo + anneau */}
          <div className="relative flex h-40 w-40 items-center justify-center">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 160 160"
              style={{ transform: 'rotate(-90deg)' }}
            >
              <defs>
                <linearGradient id="demoRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b8eff" />
                  <stop offset="100%" stopColor="#1B54FF" />
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
              <circle
                cx="80" cy="80" r="70"
                fill="none" stroke="url(#demoRingGrad)" strokeWidth="2.5" strokeLinecap="round"
                style={{ strokeDasharray: 440, animation: 'demoRingFill 1.1s 0.22s cubic-bezier(0.4,0,0.2,1) forwards' }}
              />
            </svg>

            <svg
              width="72" height="72" viewBox="0 0 100 100"
              className="relative z-10"
              style={{
                filter: 'drop-shadow(0 0 28px rgba(27,84,255,0.6))',
                animation: 'demoLogoIn 0.45s 0.08s cubic-bezier(0.34,1.56,0.64,1) forwards',
                opacity: 0,
              }}
            >
              <rect x="21" y="12" width="19" height="76" rx="9.5" fill="white" />
              <rect x="8"  y="33" width="45" height="18" rx="9"   fill="white" />
              <rect x="66" y="12" width="17" height="50" rx="8.5" fill="white" />
              <circle cx="74.5" cy="84" r="8.5" fill="white" />
            </svg>
          </div>

          {/* Texte */}
          <p
            className="flex items-center gap-1 text-xs font-semibold tracking-wider text-white/40"
            style={{ animation: 'demoTextIn 0.4s 0.3s ease both' }}
          >
            Préparation de la démo
            <span style={{ animation: 'demoDotBounce 1.2s 0.5s infinite' }}>.</span>
            <span style={{ animation: 'demoDotBounce 1.2s 0.7s infinite' }}>.</span>
            <span style={{ animation: 'demoDotBounce 1.2s 0.9s infinite' }}>.</span>
          </p>
        </div>
      )}

      {/* ── Modale qualification post-email ── */}
      {showQualModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowQualModal(false) }}
        >
          <div className="animate-in zoom-in-95 relative w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl duration-200">
            <button
              onClick={() => setShowQualModal(false)}
              className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-50"
            >
              <X size={15} />
            </button>

            {/* Étape */}
            <div className="mb-6 flex items-center gap-2">
              <div className="h-2 w-8 rounded-full bg-[#124bd2]" />
              <div className="h-2 w-4 rounded-full bg-slate-200" />
              <div className="h-2 w-4 rounded-full bg-slate-200" />
              <span className="ml-1 text-xs font-medium text-slate-400">Étape 1 sur 2</span>
            </div>

            <div className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#124bd2]">
              <UserRoundCheck size={26} strokeWidth={1.8} />
            </div>

            <h2 className="text-xl font-bold text-[#070f22]">Quel est votre profil ?</h2>
            <p className="mt-1.5 text-sm text-slate-500">Cela nous permet de personnaliser votre accès.</p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={() => { setShowQualModal(false); setAccountPanel('register') }}
                className="group flex items-start gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-[#124bd2] hover:bg-blue-50/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#124bd2] transition group-hover:bg-[#124bd2] group-hover:text-white">
                  <Users size={18} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#070f22]">Je prospecte pour une agence ou une équipe commerciale</p>
                  <p className="mt-0.5 text-xs text-slate-400">Dirigeant, responsable commercial, équipe de vente…</p>
                </div>
                <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-[#124bd2]" />
              </button>

              <button
                onClick={() => { setShowQualModal(false); setAccountPanel('register') }}
                className="group flex items-start gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left transition hover:border-emerald-500 hover:bg-emerald-50/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:bg-emerald-500 group-hover:text-white">
                  <UserRoundCheck size={18} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#070f22]">Je travaille seul en tant qu'indépendant ou consultant</p>
                  <p className="mt-0.5 text-xs text-slate-400">Agent immobilier, freelance, auto-entrepreneur…</p>
                </div>
                <ArrowRight size={16} className="mt-1 shrink-0 text-slate-300 transition group-hover:text-emerald-500" />
              </button>
            </div>

            <button
              onClick={() => { setShowQualModal(false); setAccountPanel('register') }}
              className="mt-5 block w-full text-center text-xs text-slate-400 transition hover:text-slate-600"
            >
              Passer cette étape →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
