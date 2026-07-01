import { useState, useEffect, useMemo } from 'react'
import { Clock, Search, RotateCcw, Trash2, TrendingUp, ChevronRight, X, MapPin, Tag, Building2, Zap } from 'lucide-react'
import type { Account } from '@/lib/accountStore'
import { usesRemoteDatabase } from '@/lib/accountStore'
import { getSupabaseClient } from '@/lib/supabase'

export interface HistoryEntry {
  id?: string
  queryLabel: string
  filters: Record<string, unknown>
  resultCount: number
  createdAt: string
}

interface HistoryPageProps {
  account: Account
  onReplay: (entry: HistoryEntry) => void
  onClose?: () => void
  embedded?: boolean
  onGoSearch?: () => void
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

function formatDateGroup(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7)  return d.toLocaleDateString('fr-FR', { weekday: 'long' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function FilterBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
      {icon}
      {label}
    </span>
  )
}

export default function HistoryPage({ account, onReplay, onClose, embedded = false, onGoSearch }: HistoryPageProps) {
  const [entries, setEntries]   = useState<HistoryEntry[]>(loadHistory)
  const [loading, setLoading]   = useState(usesRemoteDatabase)
  const [search, setSearch]     = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    if (!usesRemoteDatabase) return
    let cancelled = false
    getSupabaseClient()
      .rpc('get_search_history', { p_limit: 200, p_offset: 0 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) {
          setEntries(
            (data as Array<{ id: string; query_label: string; filters: Record<string, unknown>; result_count: number; created_at: string }>)
              .map(r => ({ id: r.id, queryLabel: r.query_label, filters: r.filters, resultCount: r.result_count, createdAt: r.created_at }))
          )
        }
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleClear = () => {
    clearHistory()
    setEntries([])
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return entries
    const q = search.toLowerCase()
    return entries.filter(e =>
      e.queryLabel.toLowerCase().includes(q) ||
      Object.values(e.filters ?? {}).some(v => String(v).toLowerCase().includes(q))
    )
  }, [entries, search])

  const grouped = useMemo(() =>
    filtered.reduce<Record<string, HistoryEntry[]>>((acc, e) => {
      const key = formatDateGroup(e.createdAt)
      acc[key] = acc[key] ?? []
      acc[key].push(e)
      return acc
    }, {}),
  [filtered])

  const totalResults = entries.reduce((s, e) => s + e.resultCount, 0)
  const bestResult   = entries.reduce((m, e) => Math.max(m, e.resultCount), 0)
  const remaining    = account.quota - account.monthlyUsage
  const remainingDisplay = remaining > 9999 ? '∞' : remaining.toLocaleString('fr-FR')

  const body = (
    <div className={embedded ? 'mx-auto max-w-3xl px-5 py-6' : 'mx-auto max-w-3xl px-5 py-8'}>

      {/* Breadcrumb */}
      {embedded && onGoSearch && (
        <nav className="mb-5 flex items-center gap-1.5 text-xs text-slate-400">
          <button onClick={onGoSearch} className="hover:text-[#124bd2] transition font-medium">Recherche</button>
          <ChevronRight size={12} className="text-slate-300" />
          <span className="text-slate-600 font-medium">Historique</span>
        </nav>
      )}

      {/* Header */}
      {embedded && (
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Historique des recherches</h2>
            <p className="mt-0.5 text-sm text-slate-400">Retrouvez et rejouez vos recherches précédentes.</p>
          </div>
          {entries.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 size={12} /> Tout effacer
            </button>
          )}
        </div>
      )}

      {/* Stats bar */}
      {!loading && entries.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="relative overflow-hidden rounded-2xl border border-[#124bd2]/20 bg-gradient-to-br from-[#124bd2]/8 to-[#124bd2]/3 p-4 text-center">
            <div className="absolute right-2 top-2 opacity-10"><Search size={28} className="text-[#124bd2]" /></div>
            <p className="text-2xl font-bold text-[#124bd2]">{entries.length}</p>
            <p className="mt-0.5 text-xs text-slate-500">Recherches total</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <div className="absolute right-2 top-2 opacity-10"><TrendingUp size={28} className="text-emerald-500" /></div>
            <p className="text-2xl font-bold text-slate-800">{bestResult.toLocaleString('fr-FR')}</p>
            <p className="mt-0.5 text-xs text-slate-500">Meilleur résultat</p>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <div className="absolute right-2 top-2 opacity-10"><Zap size={28} className="text-amber-400" /></div>
            <p className="text-2xl font-bold text-slate-800">{remainingDisplay}</p>
            <p className="mt-0.5 text-xs text-slate-500">Recherches restantes</p>
          </div>
        </div>
      )}

      {/* Search bar */}
      {!loading && entries.length > 0 && (
        <div className="relative mb-6">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrer l'historique…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-[#124bd2]/40 focus:ring-2 focus:ring-[#124bd2]/10"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#124bd2] border-t-transparent" />
          <p className="text-sm text-slate-400">Chargement de l'historique…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-28 text-center">
          <div className="relative mb-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-slate-100 to-slate-50 shadow-inner">
              <Clock size={32} className="text-slate-300" />
            </div>
            <div className="absolute -right-1 -top-1 h-5 w-5 animate-pulse rounded-full bg-[#124bd2]/20" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700">Aucune recherche pour l'instant</h3>
          <p className="mt-2 max-w-xs text-sm text-slate-400 leading-relaxed">
            Vos recherches apparaîtront ici automatiquement après votre première recherche.
          </p>
          {onGoSearch && (
            <button
              onClick={onGoSearch}
              className="mt-6 flex items-center gap-2 rounded-xl bg-[#124bd2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#124bd2]/30 transition hover:bg-[#0b3fbc]"
            >
              <Search size={14} /> Lancer une recherche
            </button>
          )}
        </div>
      )}

      {/* No filter results */}
      {!loading && entries.length > 0 && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={24} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">Aucun résultat pour « {search} »</p>
          <button onClick={() => setSearch('')} className="mt-3 text-xs text-[#124bd2] hover:underline">Effacer le filtre</button>
        </div>
      )}

      {/* Grouped entries */}
      {!loading && Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="mb-8">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{date}</span>
            <div className="h-px flex-1 bg-slate-100" />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{items.length}</span>
          </div>

          <div className="space-y-2">
            {items.map((e, i) => {
              const key = e.id ?? `${e.createdAt}-${i}`
              const isRemoving = removing === key
              const dept    = e.filters?.department  as string | undefined
              const code    = e.filters?.activityCode as string | undefined
              const zip     = e.filters?.zipCode     as string | undefined
              const city    = e.filters?.city        as string | undefined
              const address = e.filters?.address     as string | undefined
              const nom     = e.filters?.nom         as string | undefined
              const prenom  = e.filters?.prenom      as string | undefined

              const hasFilters = dept || code || zip || city || address || nom || prenom

              return (
                <div
                  key={key}
                  className={`group relative flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 transition-all duration-200 hover:border-[#124bd2]/30 hover:shadow-md hover:shadow-[#124bd2]/5 ${isRemoving ? 'scale-95 opacity-0' : ''} border-slate-200/80`}
                >
                  {/* Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#124bd2]/10 to-[#124bd2]/5 text-[#124bd2] transition group-hover:from-[#124bd2]/20 group-hover:to-[#124bd2]/10">
                    <Search size={15} />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {e.queryLabel || <span className="text-slate-400 italic">Recherche sans critère</span>}
                    </p>

                    {hasFilters && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {dept    && <FilterBadge icon={<Building2 size={9} />} label={`Dép. ${dept}`} />}
                        {code    && <FilterBadge icon={<Tag size={9} />} label={code} />}
                        {(city || zip) && <FilterBadge icon={<MapPin size={9} />} label={[zip, city].filter(Boolean).join(' ')} />}
                        {address && <FilterBadge icon={<MapPin size={9} />} label={address} />}
                      </div>
                    )}

                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                      <TrendingUp size={10} className="shrink-0" />
                      <span className="font-medium text-slate-500">{e.resultCount.toLocaleString('fr-FR')}</span>
                      <span>résultat{e.resultCount > 1 ? 's' : ''}</span>
                      <span className="text-slate-200">·</span>
                      <span>{formatRelative(e.createdAt)}</span>
                    </div>
                  </div>

                  {/* Replay */}
                  <button
                    onClick={() => onReplay(e)}
                    title="Rejouer cette recherche"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-300 transition hover:border-[#124bd2]/20 hover:bg-[#124bd2]/5 hover:text-[#124bd2] sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )

  if (embedded) {
    return <div className="flex-1 overflow-y-auto">{body}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f5f8ff]">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white/85 px-5 py-4 backdrop-blur-xl">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#124bd2]">Historique</p>
          <h2 className="text-base font-semibold text-slate-900">Recherches effectuées</h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:border-blue-200 hover:text-[#124bd2]">
            <X size={17} />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </div>
  )
}
