import { useEffect, useState } from 'react'
import { CheckCircle2, ArrowRight, Sparkles, Building2, Search, Clock } from 'lucide-react'
import trouveLogo from '@/assets/trouve-logo.png'

const PLAN_LABELS: Record<string, { name: string; searches: string; trial: string }> = {
  solo:   { name: 'Solo',   searches: '1 500',  trial: 'Accès complet validé' },
  agence: { name: 'Agence', searches: '5 000',  trial: 'Accès complet validé' },
  pro:    { name: 'Pro',    searches: '12 000', trial: 'Accès complet validé' },
}

const STEPS = [
  { icon: Building2, title: 'Compte activé',   desc: 'Votre accès professionnel est confirmé.' },
  { icon: Search,    title: 'Lancez une recherche', desc: 'Cherchez par nom, ville ou SIREN.' },
  { icon: Sparkles,  title: 'Exploitez vos résultats', desc: 'Favoris, historique et exports maîtrisés.' },
]

interface SuccessPageProps {
  plan?: string
  onGoToApp: () => void
}

export default function SuccessPage({ plan = 'agence', onGoToApp }: SuccessPageProps) {
  const [dots, setDots] = useState(0)
  const info = PLAN_LABELS[plan] ?? PLAN_LABELS.agence

  // Petit timer pour simuler "activation en cours"
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 1800)
    const d = setInterval(() => setDots(n => (n + 1) % 4), 400)
    return () => { clearTimeout(t); clearInterval(d) }
  }, [])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f8ff] px-4">
      {/* Gradient blob */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-10rem] h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-blue-300/20 blur-[100px]" />
      </div>

      <img src={trouveLogo} alt="trouvé!" className="mb-8 h-9 w-auto" />

      <div className="w-full max-w-md">
        {/* Card principale */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
          {/* Header vert */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 px-8 py-10 text-center text-white">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20">
              <CheckCircle2 size={32} className="text-white" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-bold">Bienvenue dans trouvé&nbsp;!</h1>
            <p className="mt-2 text-sm text-emerald-100">
              Votre abonnement <strong>{info.name}</strong> est activé.
            </p>
          </div>

          {/* Corps */}
          <div className="p-7">
            {/* Badge trial */}
            <div className="mb-6 flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <Clock size={16} className="text-[#124bd2]" />
                <span className="text-sm font-semibold text-[#124bd2]">{info.trial}</span>
              </div>
              <span className="text-sm text-slate-600 font-medium">{info.searches} recherches&nbsp;/&nbsp;mois</span>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              {STEPS.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-[#124bd2]">
                    <step.icon size={15} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{step.title}</p>
                    <p className="text-xs text-slate-400">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={onGoToApp}
              disabled={!ready}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#124bd2] text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-70"
            >
              {ready ? (
                <>Accéder à mon espace <ArrowRight size={15} /></>
              ) : (
                <span className="font-mono text-sm">Activation en cours{'.'.repeat(dots)}</span>
              )}
            </button>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          Une confirmation a été envoyée à votre email. Questions&nbsp;?&nbsp;
          <a href="mailto:support@trouve.fr" className="text-[#124bd2] hover:underline">support@trouve.fr</a>
        </p>
      </div>
    </div>
  )
}
