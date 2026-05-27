import { useState } from 'react'
import { Clock, Search, RotateCcw, Trash2, TrendingUp, X } from 'lucide-react'
import type { Account } from '@/lib/accountStore'

interface HistoryEntry {
  queryLabel: string
  filters: Record<string, unknown>
  resultCount: number
  createdAt: string
}

interface HistoryPageProps {
  account: Account
  onReplay: (query: string, dept: string, code: string) => void
  onClose?: () => void
  /** embedded=true → rendered inline inside the app shell (no fixed overlay) */
  embedded?: boolean
}

const HISTORY_KEY = 'trouve_searches_v1'

function loadHistory(): HistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

function clearHistory() {
  localStorage.setItem(HISTORY_KEY, '[]')
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return "À l'instant"
  if (m < 60) return `Il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `Il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `Il y a ${d}j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

export default function HistoryPage({ account, onReplay, onClose, embedded = false }: HistoryPageProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadHistory)

  const handleClear = () => {
    clearHistory()
    setEntries([])
  }

  const handleReplay = (e: HistoryEntry) => {
    onReplay(
      e.queryLabel === 'secteur immobilier' ? '' : e.queryLabel,
      (e.filters?.department as string) ?? '',
      (e.filters?.activityCode as string) ?? '',
    )
  }

  const grouped = entries.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
    const date = new Date(e.createdAt).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    })
    acc[date] = acc[date] ?? []
    acc[date].push(e)
    return acc
  }, {})

  const body = (
    <div className={embedded ? 'mx-auto max-w-3xl px-5 py-6' : 'mx-auto max-w-3xl px-5 py-8'}>

      {/* Toolbar inline (only in embedded mode) */}
      {embedded && (
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Historique des recherches</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Retrouvez et rejouez vos recherches précédentes.</p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-red-200 hover:text-red-500 dark:border-slate-700 dark:text-slate-400"
            >
              <Trash2 size={12} /> Tout effacer
            </button>
          )}
        </div>
      )}

      {/* Stats bar */}
      {entries.length > 0 && (
        <div className="mb-8 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-bold text-[#124bd2]">{entries.length}</p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Recherches ce mois</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {Math.max(...entries.map(e => e.resultCount)).toLocaleString('fr-FR')}
            </p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Meilleur résultat</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 text-center dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {account.quota - account.monthlyUsage}
            </p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Recherches restantes</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-100 dark:bg-slate-800">
            <Clock size={26} className="text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Aucune recherche récente</h2>
          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
            Vos recherches apparaîtront ici automatiquement.
          </p>
        </div>
      )}

      {/* Grouped list */}
      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="mb-7">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {date}
          </p>
          <div className="space-y-2">
            {items.map((e, i) => (
              <div
                key={i}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-3.5 transition hover:border-blue-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                  <Search size={14} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {e.queryLabel === 'secteur immobilier' ? 'Secteur immobilier (tous)' : `"${e.queryLabel}"`}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                    <TrendingUp size={11} />
                    <span>{e.resultCount.toLocaleString('fr-FR')} résultats</span>
                    {e.filters?.department && <span>· Dép. {e.filters.department as string}</span>}
                    {e.filters?.activityCode && <span>· {e.filters.activityCode as string}</span>}
                  </div>
                </div>

                <span className="hidden shrink-0 text-xs text-slate-400 dark:text-slate-500 sm:block">
                  {formatRelative(e.createdAt)}
                </span>

                <button
                  onClick={() => handleReplay(e)}
                  title="Rejouer cette recherche"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-blue-50 hover:text-[#124bd2] dark:text-slate-600 dark:hover:bg-blue-950 dark:hover:text-blue-400"
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  // Embedded mode: just the content, no overlay wrapper
  if (embedded) {
    return <div className="flex-1 overflow-y-auto animate-fade-in">{body}</div>
  }

  // Legacy overlay mode (kept for backward compat)
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f8ff] dark:bg-[#0d1424] animate-fade-in">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#124bd2]">Historique</p>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recherches effectuees</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-800 dark:text-slate-400"
            aria-label="Fermer l'historique"
          >
            <X size={17} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </div>
  )
}
