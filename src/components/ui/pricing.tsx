import { useState, useRef } from "react"
import { motion } from "framer-motion"
import { Check, Star, ArrowRight, Mail, X, AlertCircle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useMediaQuery } from "@/hooks/use-media-query"
import confetti from "canvas-confetti"
import NumberFlow from "@number-flow/react"

interface TrouvePlan {
  code: string
  name: string
  description: string
  monthlyPrice: number
  annualPrice: number
  features: string[]
  buttonText: string
  isPopular: boolean
}

interface PricingSectionProps {
  onCheckout: (planCode: string, period: 'monthly' | 'annual') => void
  checkoutLoading: string | null
  checkoutError: string | null
  onClearError: () => void
}

const PLANS: TrouvePlan[] = [
  {
    code: 'solo',
    name: 'Solo',
    description: 'Accès complet indépendant',
    monthlyPrice: 199,
    annualPrice: 159,
    features: [
      'Accès complet après validation',
      '1 500 recherches / mois',
      '1 compte nominatif',
      'Coordonnées complètes',
      'Historique 90 jours',
      'Export PDF maîtrisé',
    ],
    buttonText: 'Choisir Solo',
    isPopular: false,
  },
  {
    code: 'agence',
    name: 'Agence',
    description: 'Offre équipe principale',
    monthlyPrice: 499,
    annualPrice: 399,
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
    buttonText: 'Choisir Agence',
    isPopular: true,
  },
  {
    code: 'pro',
    name: 'Pro',
    description: 'Pour structures avancées',
    monthlyPrice: 899,
    annualPrice: 719,
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
    buttonText: 'Choisir Pro',
    isPopular: false,
  },
]

export function PricingSection({
  onCheckout,
  checkoutLoading,
  checkoutError,
  onClearError,
}: PricingSectionProps) {
  const [isAnnual, setIsAnnual] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 768px)")
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
    <section id="tarifs" className="px-5 pb-24 pt-10 md:pb-32 md:pt-16">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-12 text-center space-y-3">
          <p className="text-sm font-semibold text-[#124bd2]">Offres</p>
          <h2 className="text-4xl font-bold tracking-tight text-[#070f22] sm:text-5xl">
            Débloquez l'accès complet.
          </h2>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-500">
            Testez en aperçu, inscrivez votre société, puis accédez aux coordonnées complètes après validation professionnelle.
          </p>
        </div>

        {/* Toggle annuel / mensuel */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span className={cn("text-sm font-semibold transition-colors", !isAnnual ? "text-[#124bd2]" : "text-slate-400")}>
            Mensuel
          </span>
          <Label>
            <Switch
              ref={switchRef as unknown as React.RefObject<HTMLButtonElement>}
              checked={isAnnual}
              onCheckedChange={handleToggle}
            />
          </Label>
          <span className={cn("text-sm font-semibold transition-colors", isAnnual ? "text-[#124bd2]" : "text-slate-400")}>
            Annuel <span className="text-emerald-600 font-bold">(-20 %)</span>
          </span>
        </div>

        {/* Checkout error */}
        {checkoutError && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle size={16} className="shrink-0 text-red-500" />
            <span className="flex-1">{checkoutError}</span>
            <button onClick={onClearError} className="text-red-400 hover:text-red-600 transition">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Plans — 3 cartes avec effet 3D */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan, index) => (
            <motion.div
              key={plan.code}
              initial={{ y: 50, opacity: 1 }}
              whileInView={
                isDesktop
                  ? {
                      y: plan.isPopular ? -20 : 0,
                      opacity: 1,
                      x: index === 2 ? -30 : index === 0 ? 30 : 0,
                      scale: index === 0 || index === 2 ? 0.94 : 1.0,
                    }
                  : {}
              }
              viewport={{ once: true }}
              transition={{
                duration: 1.6,
                type: 'spring',
                stiffness: 100,
                damping: 30,
                delay: 0.4,
              }}
              className={cn(
                'rounded-3xl border p-6 bg-white text-center flex flex-col relative',
                plan.isPopular
                  ? 'border-[#124bd2] border-2 shadow-[0_14px_50px_-20px_rgba(18,75,210,0.5)]'
                  : 'border-slate-200',
                !plan.isPopular && 'mt-5',
                index === 0 || index === 2 ? 'z-0' : 'z-10',
              )}
            >
              {plan.isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-[#124bd2] px-4 py-1 shadow-lg shadow-blue-500/30">
                  <Star className="h-3.5 w-3.5 fill-white text-white" />
                  <span className="text-white text-[11px] font-bold">Populaire</span>
                </div>
              )}

              <div className="flex-1 flex flex-col">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{plan.description}</p>
                <p className="mt-1 text-xl font-bold text-[#070f22]">{plan.name}</p>

                {/* Prix animé */}
                <div className="mt-6 flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold tracking-tight text-[#070f22]">
                    <NumberFlow
                      value={isAnnual ? plan.annualPrice : plan.monthlyPrice}
                      transformTiming={{ duration: 500, easing: 'ease-out' }}
                      willChange
                    />
                  </span>
                  <span className="text-lg font-semibold text-slate-400"> €</span>
                  <span className="text-sm text-slate-400">/ mois</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isAnnual ? 'facturé annuellement' : 'facturé mensuellement'}
                </p>
                {isAnnual && (
                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-600">
                    Vous économisez {(plan.monthlyPrice - plan.annualPrice) * 12} € / an
                  </p>
                )}

                {/* Features */}
                <ul className="mt-5 space-y-2 text-left flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#124bd2]" />
                      {f}
                    </li>
                  ))}
                </ul>

                <hr className="my-5 border-slate-100" />

                <button
                  type="button"
                  onClick={() => onCheckout(plan.code, isAnnual ? 'annual' : 'monthly')}
                  disabled={checkoutLoading === plan.code}
                  className={cn(
                    'flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-200',
                    plan.isPopular
                      ? 'bg-[#124bd2] text-white hover:bg-[#0b3fbc] shadow-lg shadow-blue-500/20 hover:-translate-y-0.5'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-[#124bd2] hover:text-[#124bd2] hover:-translate-y-0.5',
                    'disabled:opacity-60 disabled:translate-y-0'
                  )}
                >
                  {checkoutLoading === plan.code ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <>{plan.buttonText} <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>

                <p className="mt-3 text-center text-[10px] text-slate-400">
                  Accès complet après validation professionnelle
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Réseau — contact banner */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold text-[#070f22]">Réseau · Sur mesure</p>
              <p className="mt-1 text-sm text-slate-500">
                Multi-agences, volume personnalisé, SSO/SAML, contrat dédié et accompagnement CSM.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCheckout('reseau', 'monthly')}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:border-[#124bd2] hover:text-[#124bd2]"
            >
              <Mail className="h-4 w-4" /> Nous contacter
            </button>
          </div>
        </div>

        {/* Reassurance strip */}
        <div className="mt-6 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Paiement sécurisé par Stripe</span>
          <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Facture TVA automatique</span>
          <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Aperçu gratuit : 5 recherches masquées</span>
          <span className="flex items-center gap-1.5"><Check className="h-3 w-3 text-emerald-500" /> Validation pro avant accès complet</span>
        </div>

      </div>
    </section>
  )
}
