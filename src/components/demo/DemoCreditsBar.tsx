import { KeyRound, Mail } from 'lucide-react'

export default function DemoCreditsBar({ phone, email }: { phone: number; email: number }) {
  const phoneWarn = phone <= 1
  const emailWarn = email <= 0

  return (
    <div className="mx-3 mb-3 rounded-xl border border-slate-100 dark:border-gray-800 bg-slate-50 dark:bg-gray-900 px-3 py-3 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Crédits démo</p>

      {/* Téléphone */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <KeyRound size={12} className={phoneWarn ? 'text-red-500' : 'text-slate-400'} />
          <span className={`text-xs font-medium ${phoneWarn ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-300'}`}>
            Téléphone
          </span>
        </div>
        <span className={`text-xs font-extrabold tabular-nums ${phoneWarn ? 'text-red-500' : 'text-[#1B54FF]'}`}>
          {phone}/5
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700">
        <div
          className={`h-1.5 rounded-full transition-all ${phoneWarn ? 'bg-red-500' : 'bg-[#1B54FF]'}`}
          style={{ width: `${(phone / 5) * 100}%` }}
        />
      </div>

      {/* Email */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1.5">
          <Mail size={12} className={emailWarn ? 'text-orange-500' : 'text-slate-400'} />
          <span className={`text-xs font-medium ${emailWarn ? 'text-orange-600 dark:text-orange-400' : 'text-slate-600 dark:text-slate-300'}`}>
            Email
          </span>
        </div>
        <span className={`text-xs font-extrabold tabular-nums ${emailWarn ? 'text-orange-500' : 'text-emerald-600'}`}>
          {email}/2
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700">
        <div
          className={`h-1.5 rounded-full transition-all ${emailWarn ? 'bg-orange-500' : 'bg-emerald-500'}`}
          style={{ width: `${(email / 2) * 100}%` }}
        />
      </div>
    </div>
  )
}
