import { X, Zap } from 'lucide-react'

export default function DemoToast({ remaining, onCta, onClose }: {
  remaining: number
  onCta: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed bottom-6 right-6 z-[150] w-80 rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-slate-100 dark:border-gray-800 p-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40">
          <Zap size={16} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Version démo
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Il ne vous reste que <strong className="text-amber-600">{remaining} déblocage{remaining > 1 ? 's' : ''}</strong> avant la restriction. Accédez aux numéros complets avec un abonnement.
          </p>
          <button
            onClick={onCta}
            className="mt-2.5 text-xs font-bold text-[#1B54FF] hover:underline"
          >
            Voir les offres →
          </button>
        </div>
        <button onClick={onClose} className="shrink-0 text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400">
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
