import { Lock } from 'lucide-react'

export default function DemoLockModal({ onCta }: { onCta: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/40">
          <Lock size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white mb-3">
          Votre démo est terminée
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-7">
          Vous avez utilisé tous vos crédits de déblocage. Souscrivez à un abonnement pour continuer vos recherches et accéder aux coordonnées complètes de vos contacts.
        </p>
        <button
          onClick={onCta}
          className="w-full rounded-xl bg-[#1B54FF] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#0b3fbc] shadow-lg shadow-blue-200 dark:shadow-blue-900/30"
        >
          Voir les offres d'abonnement →
        </button>
        <p className="mt-4 text-[11px] text-slate-400">Sans engagement · Accès immédiat</p>
      </div>
    </div>
  )
}
