import React, { useState, useRef } from "react"
import { motion } from "framer-motion"
import { X, AlertCircle, Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import NumberFlow from "@number-flow/react"
import confetti from "canvas-confetti"

interface PricingSectionProps {
  onCheckout: (planCode: string, period: 'monthly' | 'annual') => void
  checkoutLoading: string | null
  checkoutError: string | null
  onClearError: () => void
}

// ─── Background SVG shapes ────────────────────────────────────────────────────

const BGComponent1 = () => (
  <motion.svg
    viewBox="0 0 320 384" preserveAspectRatio="xMidYMid slice"
    fill="none" xmlns="http://www.w3.org/2000/svg"
    variants={{ hover: { scale: 1.5 } }}
    transition={{ duration: 1, ease: "backInOut" }}
    className="absolute inset-0 z-0"
  >
    <motion.circle
      variants={{ hover: { scaleY: 0.5, y: -25 } }}
      transition={{ duration: 1, ease: "backInOut", delay: 0.2 }}
      cx="160.5" cy="114.5" r="101.5"
      fill="rgba(0,0,0,0.18)"
    />
    <motion.ellipse
      variants={{ hover: { scaleY: 2.25, y: -25 } }}
      transition={{ duration: 1, ease: "backInOut", delay: 0.2 }}
      cx="160.5" cy="265.5" rx="101.5" ry="43.5"
      fill="rgba(0,0,0,0.18)"
    />
  </motion.svg>
)

const BGComponent2 = () => (
  <motion.svg
    viewBox="0 0 320 384" preserveAspectRatio="xMidYMid slice"
    fill="none" xmlns="http://www.w3.org/2000/svg"
    variants={{ hover: { scale: 1.05 } }}
    transition={{ duration: 1, ease: "backInOut" }}
    className="absolute inset-0 z-0"
  >
    <motion.rect
      x="14" width="153" height="153" rx="15"
      fill="rgba(0,0,0,0.18)"
      variants={{ hover: { y: 219, rotate: "90deg", scaleX: 2 } }}
      style={{ y: 12 }}
      transition={{ delay: 0.2, duration: 1, ease: "backInOut" }}
    />
    <motion.rect
      x="155" width="153" height="153" rx="15"
      fill="rgba(0,0,0,0.18)"
      variants={{ hover: { y: 12, rotate: "90deg", scaleX: 2 } }}
      style={{ y: 219 }}
      transition={{ delay: 0.2, duration: 1, ease: "backInOut" }}
    />
  </motion.svg>
)

const BGComponent3 = () => (
  <motion.svg
    viewBox="0 0 320 384" preserveAspectRatio="xMidYMid slice"
    fill="none" xmlns="http://www.w3.org/2000/svg"
    variants={{ hover: { scale: 1.25 } }}
    transition={{ duration: 1, ease: "backInOut" }}
    className="absolute inset-0 z-0"
  >
    <motion.path
      variants={{ hover: { y: -50 } }}
      transition={{ delay: 0.3, duration: 1, ease: "backInOut" }}
      d="M148.893 157.531C154.751 151.673 164.249 151.673 170.107 157.531L267.393 254.818C273.251 260.676 273.251 270.173 267.393 276.031L218.75 324.674C186.027 357.397 132.973 357.397 100.25 324.674L51.6068 276.031C45.7489 270.173 45.7489 260.676 51.6068 254.818L148.893 157.531Z"
      fill="rgba(0,0,0,0.18)"
    />
    <motion.path
      variants={{ hover: { y: -50 } }}
      transition={{ delay: 0.2, duration: 1, ease: "backInOut" }}
      d="M148.893 99.069C154.751 93.2111 164.249 93.2111 170.107 99.069L267.393 196.356C273.251 202.213 273.251 211.711 267.393 217.569L218.75 266.212C186.027 298.935 132.973 298.935 100.25 266.212L51.6068 217.569C45.7489 211.711 45.7489 202.213 51.6068 196.356L148.893 99.069Z"
      fill="rgba(0,0,0,0.18)"
    />
    <motion.path
      variants={{ hover: { y: -50 } }}
      transition={{ delay: 0.1, duration: 1, ease: "backInOut" }}
      d="M148.893 40.6066C154.751 34.7487 164.249 34.7487 170.107 40.6066L267.393 137.893C273.251 143.751 273.251 153.249 267.393 159.106L218.75 207.75C186.027 240.473 132.973 240.473 100.25 207.75L51.6068 159.106C45.7489 153.249 45.7489 143.751 51.6068 137.893L148.893 40.6066Z"
      fill="rgba(0,0,0,0.18)"
    />
  </motion.svg>
)

// ─── Plans data ───────────────────────────────────────────────────────────────

type BGComp = () => React.ReactElement

interface PlanData {
  code: string
  label: string
  description: string
  monthlyPrice: number | null
  annualPrice: number | null
  priceNote?: string
  features: string[]
  cta: string
  isPopular: boolean
  background: string
  BGComponent: BGComp
}

const PLANS: PlanData[] = [
  {
    code: 'solo',
    label: 'Solo',
    description: 'Pour les indépendants qui veulent prospecter avec précision dans tout le territoire',
    monthlyPrice: 30,
    annualPrice: 24,
    features: [
      'Recherches de profils illimitées',
      'E-mails B2B professionnels illimités',
      '200 Clés de déblocage par mois',
      '· Téléphone direct : 3 clés',
      '· Adresse postale : 2 clés',
      '· E-mail direct : 1 clé',
      '1 compte utilisateur',
    ],
    cta: 'Choisir Solo',
    isPopular: false,
    background: 'bg-indigo-500',
    BGComponent: BGComponent1,
  },
  {
    code: 'agence',
    label: 'Agence',
    description: 'Pour les agences sérieuses qui veulent maximiser leur pipeline commercial',
    monthlyPrice: 89,
    annualPrice: 71,
    priceNote: '/licence',
    features: [
      'Recherches de profils illimitées',
      'E-mails B2B professionnels illimités',
      '800 Clés de déblocage par mois',
      '· Téléphone direct : 3 clés',
      '· Adresse postale : 2 clés',
      '· E-mail direct : 1 clé',
      'Export CSV & option Bulk',
      'Tableau de bord équipe',
    ],
    cta: 'Choisir Agence',
    isPopular: true,
    background: 'bg-[#124bd2]',
    BGComponent: BGComponent2,
  },
  {
    code: 'entreprise',
    label: 'Entreprise',
    description: 'Pour les grandes équipes avec des besoins en prospection illimités et automatisés',
    monthlyPrice: null,
    annualPrice: null,
    features: [
      'Recherches & e-mails B2B illimités',
      'Crédits téléphone illimités',
      'E-mails directs personnels illimités',
      'Accès API complet',
      'Gestion des équipes & rôles',
      'Support prioritaire dédié',
    ],
    cta: 'Nous contacter',
    isPopular: false,
    background: 'bg-[#07113d]',
    BGComponent: BGComponent3,
  },
]

// ─── PricingCard ──────────────────────────────────────────────────────────────

const PricingCard = ({
  label,
  description,
  monthlyPrice,
  annualPrice,
  priceNote,
  features,
  cta,
  background,
  isPopular,
  isAnnual,
  BGComponent,
  onCta,
  loading,
}: PlanData & { isAnnual: boolean; onCta: () => void; loading: boolean }) => {
  const price = isAnnual ? annualPrice : monthlyPrice

  return (
    <motion.div
      whileHover="hover"
      transition={{ duration: 1, ease: "backInOut" }}
      variants={{ hover: { scale: 1.05 } }}
      className={`relative w-80 shrink-0 overflow-hidden rounded-xl p-8 pb-20 ${background} shadow-lg ${isPopular ? 'ring-[3px] ring-white shadow-[0_0_0_6px_rgba(255,255,255,0.18),0_25px_60px_rgba(18,75,210,0.4)]' : ''}`}
    >

      <div className="relative z-10 text-white">
        {price !== null && (
          <span className="mb-4 block w-fit rounded-full border border-white/20 bg-white/20 px-4 py-1 text-lg font-black backdrop-blur-sm">
            {label}
          </span>
        )}

        {price === null ? (
          <motion.div
            initial={{ scale: 0.85 }}
            variants={{ hover: { scale: 1 } }}
            transition={{ duration: 1, ease: "backInOut" }}
            className="my-2 origin-top-left"
          >
            <span className="block font-mono text-5xl font-black leading-tight">Sur</span>
            <span className="block font-mono text-5xl font-black leading-tight">mesure</span>
          </motion.div>
        ) : (
          <motion.div
            initial={{ scale: 0.85 }}
            variants={{ hover: { scale: 1 } }}
            transition={{ duration: 1, ease: "backInOut" }}
            className="my-2 origin-top-left"
          >
            <span className="block font-mono text-6xl font-black leading-tight">
              <NumberFlow value={price} /> €
            </span>
            <span className="block font-mono text-3xl font-black leading-tight opacity-75">
              /mois{priceNote && <span className="text-xl"> {priceNote}</span>}
            </span>
          </motion.div>
        )}

        <p className="mt-1 text-sm leading-snug text-white/80">{description}</p>

        {/* Feature list */}
        <ul className="mt-4 space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-white/90">
              {/^[^\x00-\x7F]/u.test(f)
                ? <span className="w-3.5 shrink-0" />
                : <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />}
              {f}
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={onCta}
        disabled={loading}
        className="absolute bottom-4 left-4 right-4 z-20 flex items-center justify-center gap-2 rounded-lg border-2 border-white bg-white py-2 font-mono font-black uppercase text-neutral-800 transition-all duration-200 hover:bg-white/10 hover:text-white hover:border-white/80 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-60"
      >
        {loading ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : cta}
      </button>

      <BGComponent />
    </motion.div>
  )
}

// ─── PricingSection (exported) ────────────────────────────────────────────────

export function PricingSection({
  onCheckout,
  checkoutLoading,
  checkoutError,
  onClearError,
}: PricingSectionProps) {
  const [isAnnual, setIsAnnual] = useState(false)
  const switchRef = useRef<HTMLButtonElement>(null)

  const handleToggle = (checked: boolean) => {
    setIsAnnual(checked)
    if (checked && switchRef.current) {
      const rect = switchRef.current.getBoundingClientRect()
      confetti({
        particleCount: 60,
        spread: 70,
        origin: {
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight,
        },
        colors: ['#1B54FF', '#3b8eff', '#124bd2', '#e0e9ff', '#a5c4ff'],
        ticks: 200,
        gravity: 1.2,
        decay: 0.94,
        startVelocity: 30,
        shapes: ['circle'],
      })
    }
  }

  return (
    <section id="tarifs" className="px-4 pb-24 pt-10 md:pb-32 md:pt-16">

      {/* Header */}
      <div className="mb-12 text-center">
        <p className="mb-2 text-sm font-semibold text-[#124bd2]">Offres</p>
        <h2 className="text-4xl font-bold tracking-tight text-[#070f22] sm:text-5xl">
          Débloquez l'accès complet.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-500">
          Testez en aperçu, inscrivez votre société, puis accédez aux coordonnées complètes après validation.
        </p>
      </div>

      {/* Annual toggle */}
      <div className="mb-10 flex items-center justify-center gap-3">
        <span className={`text-sm font-semibold transition-colors ${!isAnnual ? "text-[#124bd2]" : "text-slate-400"}`}>
          Mensuel
        </span>
        <Label>
          <Switch
            ref={switchRef as unknown as React.RefObject<HTMLButtonElement>}
            checked={isAnnual}
            onCheckedChange={handleToggle}
          />
        </Label>
        <span className={`text-sm font-semibold transition-colors ${isAnnual ? "text-[#124bd2]" : "text-slate-400"}`}>
          Annuel <span className="font-bold text-emerald-600">(-20 %)</span>
        </span>
      </div>

      {/* Error banner */}
      {checkoutError && (
        <div className="mx-auto mb-6 flex max-w-xl items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle size={16} className="shrink-0 text-red-500" />
          <span className="flex-1">{checkoutError}</span>
          <button onClick={onClearError} className="text-red-400 transition hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Cards */}
      <div className="mx-auto flex w-fit flex-wrap items-center justify-center gap-4 pt-5">
        {PLANS.map((plan) => (
          <div key={plan.code} className="relative">
            {plan.isPopular && (
              <div className="absolute -top-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-xs font-bold text-[#124bd2] shadow-lg ring-1 ring-[#124bd2]/20">
                ✦ Recommandé
              </div>
            )}
            <PricingCard
              {...plan}
              isAnnual={isAnnual}
              onCta={() => onCheckout(plan.code, isAnnual ? 'annual' : 'monthly')}
              loading={checkoutLoading === plan.code}
            />
          </div>
        ))}
      </div>

      {/* Reassurance strip */}
      <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-slate-400">
        {[
          'Paiement sécurisé par Stripe',
          'Facture TVA automatique',
          'Aperçu gratuit : 5 recherches masquées',
          'Validation pro avant accès complet',
        ].map((item) => (
          <span key={item} className="flex items-center gap-1.5">
            <Check className="h-3 w-3 text-emerald-500" /> {item}
          </span>
        ))}
      </div>

    </section>
  )
}
