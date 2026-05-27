import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, SlidersHorizontal, Star, ChevronLeft, ChevronRight,
  Building2, MapPin, Hash, Users, LogOut, X,
  Zap, RefreshCw, ExternalLink, LayoutGrid, List,
  ShieldCheck, AlertCircle, Download, Clock, Keyboard,
  ArrowRight, Globe, TrendingUp, FileText, Info,
  Moon, Sun, History,
} from 'lucide-react'

type AppView = 'search' | 'history' | 'favorites'
import trouveLogo from '@/assets/trouve-logo.png'
import {
  searchCompanies, DEPARTMENTS, TYPE_LABELS,
  type CompanyResult, type SearchParams,
} from '@/lib/searchApi'
import { recordSearch, saveFavorite, type Account } from '@/lib/accountStore'
import HistoryPage from './HistoryPage'

// ─── Props ────────────────────────────────────────────────────────────────────
interface SearchPageProps {
  account: Account
  onLogout: () => void
  onOpenAccount: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const RECENT_SEARCHES_KEY = 'trouve_recent_q'
const MAX_RECENT = 6

function quotaPercent(used: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((used / total) * 100))
}

function formatSiren(s: string) {
  return s.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')
}

function departmentLabel(code: string) {
  return DEPARTMENTS.find(d => d.code === code)?.label ?? `Dép. ${code}`
}

function isNew(createdAt: string | null) {
  if (!createdAt) return false
  const d = new Date(createdAt)
  const months12Ago = new Date()
  months12Ago.setMonth(months12Ago.getMonth() - 12)
  return d > months12Ago
}

function exportCSV(results: CompanyResult[], query: string) {
  const headers = ['SIREN','Nom','Type','Ville','Code postal','Département','Salariés','Statut','Création','NAF','Libellé NAF']
  const rows = results.map(c => [
    c.siren, c.name, c.typeLabel, c.city, c.zipCode, c.department,
    c.employees ?? '', c.isActive ? 'Actif' : 'Cessé',
    c.createdAt ? new Date(c.createdAt).toLocaleDateString('fr-FR') : '',
    c.activityCode, c.activityLabel,
  ])
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `prospection_${query || 'immobilier'}_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

function readRecentSearches(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]') } catch { return [] }
}

function saveRecentSearch(q: string) {
  if (!q.trim()) return
  const recent = readRecentSearches().filter(r => r !== q)
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([q, ...recent].slice(0, MAX_RECENT)))
}

// ─── Résultats par page ───────────────────────────────────────────────────────
const PER_PAGE_OPTIONS = [20, 50, 100]

// Favoris persistés localement (indexed by SIREN)
const FAV_STORE_KEY = 'trouve_fav_data_v1'

interface FavStored { siren: string; name: string; city: string; type: string; savedAt: string }

function loadStoredFavs(): FavStored[] {
  try { return JSON.parse(localStorage.getItem(FAV_STORE_KEY) ?? '[]') } catch { return [] }
}
function saveStoredFav(c: CompanyResult) {
  const favs = loadStoredFavs().filter(f => f.siren !== c.siren)
  localStorage.setItem(FAV_STORE_KEY, JSON.stringify([
    { siren: c.siren, name: c.name, city: c.city, type: c.typeLabel, savedAt: new Date().toISOString() },
    ...favs,
  ].slice(0, 200)))
}
function removeStoredFav(siren: string) {
  localStorage.setItem(FAV_STORE_KEY, JSON.stringify(loadStoredFavs().filter(f => f.siren !== siren)))
}

// ─── Favoris Drawer ───────────────────────────────────────────────────────────
function FavoritesDrawer({
  onClose, onToggleFav, favorites,
}: {
  onClose: () => void
  onToggleFav: (siren: string) => void
  favorites: Set<string>
}) {
  const [favs, setFavs] = useState<FavStored[]>(loadStoredFavs)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleRemove = (siren: string) => {
    removeStoredFav(siren)
    onToggleFav(siren)
    setFavs(loadStoredFavs())
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="flex h-full w-full max-w-sm flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-400" fill="currentColor" />
            <h2 className="font-semibold text-slate-800 dark:text-slate-100">Mes favoris</h2>
            {favs.length > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">{favs.length}</span>
            )}
          </div>
          <button onClick={onClose} className="rounded-xl p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Export CSV favoris */}
        {favs.length > 0 && (
          <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <button
              onClick={() => {
                const csv = ['SIREN;Nom;Ville;Type;Ajouté le',
                  ...favs.map(f => `${f.siren};"${f.name}";"${f.city}";"${f.type}";${new Date(f.savedAt).toLocaleDateString('fr-FR')}`)
                ].join('\n')
                const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'favoris.csv'; a.click(); URL.revokeObjectURL(url)
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-700"
            >
              <Download size={12} /> Exporter mes favoris ({favs.length}) en CSV
            </button>
          </div>
        )}

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {favs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-300">
                <Star size={24} />
              </div>
              <p className="font-medium text-slate-700">Aucun favori</p>
              <p className="mt-1 text-xs text-slate-400">Cliquez sur ★ sur une fiche pour la sauvegarder ici.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {favs.map(f => (
                <div key={f.siren} className="flex items-start gap-3 px-5 py-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold ${typeAccent(f.type)}`}>
                    {companyInitials(f.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{f.type} · {f.city}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-slate-300">{f.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${f.siren}`}
                      target="_blank" rel="noopener"
                      className="rounded-lg p-1.5 text-slate-300 transition hover:text-[#124bd2]"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      onClick={() => handleRemove(f.siren)}
                      className="rounded-lg p-1.5 text-amber-400 transition hover:text-red-400"
                    >
                      <Star size={13} fill="currentColor" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Quick filters ─────────────────────────────────────────────────────────────
const QUICK_FILTERS = [
  { label: 'Paris',          query: '', dept: '75', code: '' },
  { label: 'Île-de-France',  query: '', dept: '92', code: '' },
  { label: 'Agences',        query: '', dept: '', code: '6831Z' },
  { label: 'Bailleurs',      query: '', dept: '', code: '6820A' },
  { label: 'Marchands biens',query: '', dept: '', code: '6810Z' },
  { label: 'PACA',           query: '', dept: '13', code: '' },
  { label: 'Lyon',           query: 'lyon', dept: '69', code: '' },
]

// ─── Composant QuotaBar ────────────────────────────────────────────────────────
function QuotaBar({ used, total }: { used: number; total: number }) {
  const pct     = quotaPercent(used, total)
  const isLow   = pct >= 80
  const isEmpty = used >= total

  return (
    <div className="flex items-center gap-2">
      <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 sm:block dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${isEmpty ? 'bg-red-500' : isLow ? 'bg-amber-400' : 'bg-[#124bd2]'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${isEmpty ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-slate-500'}`}>
        {used.toLocaleString('fr-FR')}&thinsp;/&thinsp;{total.toLocaleString('fr-FR')}
      </span>
    </div>
  )
}

// ─── Company Detail Slide-Over ─────────────────────────────────────────────────
function CompanySlideOver({ company, onClose }: { company: CompanyResult; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      {/* Panel */}
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right duration-200 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${typeAccent(company.typeLabel)}`}>
              {companyInitials(company.name)}
            </div>
            <div>
              <h2 className="font-bold leading-snug text-slate-800 dark:text-slate-100">{company.name}</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{company.typeLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="mt-0.5 rounded-xl p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        {/* Statut */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${company.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${company.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
            {company.isActive ? 'Entreprise active' : 'Activité cessée'}
          </span>
          {isNew(company.createdAt) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#124bd2]">
              <TrendingUp size={10} /> Nouvelle
            </span>
          )}
        </div>

        {/* Corps */}
        <div className="flex-1 space-y-5 p-6">
          {/* Bloc identité */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Identité</p>
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/50">
              <Row icon={<Hash size={13} className="text-slate-300" />} label="SIREN" value={formatSiren(company.siren)} mono />
              <Row icon={<Zap size={13} className="text-slate-300" />} label="Code NAF" value={`${company.activityCode} — ${company.activityLabel || company.typeLabel}`} />
              {company.createdAt && (
                <Row icon={<Clock size={13} className="text-slate-300" />} label="Création" value={new Date(company.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric'})} />
              )}
              {company.etablissements > 1 && (
                <Row icon={<Building2 size={13} className="text-slate-300" />} label="Établissements" value={String(company.etablissements)} />
              )}
            </div>
          </section>

          {/* Bloc localisation */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Localisation</p>
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/50">
              {company.address && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Adresse" value={company.address} />}
              <Row icon={<MapPin size={13} className="text-slate-300" />} label="Commune" value={`${company.city} (${company.zipCode})`} />
              <Row icon={<MapPin size={13} className="text-slate-300" />} label="Département" value={departmentLabel(company.department)} />
            </div>
          </section>

          {/* Bloc RH */}
          {company.employees && company.employees !== 'NC' && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Ressources humaines</p>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <Row icon={<Users size={13} className="text-slate-300" />} label="Salariés" value={`${company.employees} salariés`} />
              </div>
            </section>
          )}

          {/* Liens externes */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Sources</p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${company.siren}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-medium text-[#124bd2] transition hover:bg-blue-100 dark:border-blue-900/50 dark:bg-blue-950/30 dark:hover:bg-blue-950/50"
              >
                <ShieldCheck size={13} /> Annuaire officiel
              </a>
              <a
                href={`https://www.societe.com/cgi-bin/search?champs=${company.siren}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <Globe size={13} /> Societe.com
              </a>
              <a
                href={`https://www.infogreffe.fr/societe/${company.siren}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <FileText size={13} /> Infogreffe
              </a>
              <a
                href={`https://pappers.fr/entreprise/${company.siren}`}
                target="_blank" rel="noopener"
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                <Info size={13} /> Pappers
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// Returns a colour pair (bg + text) for the company avatar based on typeLabel
function typeAccent(typeLabel: string): string {
  const t = typeLabel.toLowerCase()
  if (t.includes('agence') || t.includes('agent'))
    return 'bg-blue-50 text-[#124bd2] dark:bg-blue-950/40 dark:text-blue-400'
  if (t.includes('bailleur') || t.includes('location') || t.includes('social'))
    return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
  if (t.includes('marchand'))
    return 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400'
  if (t.includes('administration') || t.includes('gestionnaire') || t.includes('administrat'))
    return 'bg-orange-50 text-orange-500 dark:bg-orange-950/40 dark:text-orange-400'
  if (t.includes('fonds') || t.includes('investissement') || t.includes('scpi'))
    return 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'
  return 'bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
}

// Get 1-2 letter initials from a company name
function companyInitials(name: string): string {
  const words = name.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="shrink-0 text-xs text-slate-400 w-24 dark:text-slate-500">{label}</span>
      <span className={`flex-1 break-words text-xs text-slate-700 dark:text-slate-300 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

// ─── Composant CompanyCard ─────────────────────────────────────────────────────
function CompanyCard({
  company, isFavorite, onToggleFavorite, viewMode, onDetail,
}: {
  company: CompanyResult
  isFavorite: boolean
  onToggleFavorite: (c: CompanyResult) => void
  viewMode: 'grid' | 'list'
  onDetail: (c: CompanyResult) => void
}) {
  if (viewMode === 'list') {
    return (
      <div className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 transition hover:border-blue-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-900">
        {/* Avatar */}
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${typeAccent(company.typeLabel)}`}>
          {companyInitials(company.name)}
        </div>

        {/* Infos */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDetail(company)}
              className="truncate font-semibold text-slate-800 hover:text-[#124bd2] hover:underline text-left dark:text-slate-100"
            >
              {company.name}
            </button>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${company.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {company.isActive ? 'Actif' : 'Cessé'}
            </span>
            {isNew(company.createdAt) && (
              <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-[#124bd2]">Nouveau</span>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{company.typeLabel} · {company.city} ({company.zipCode}) · {company.employees ? `${company.employees} sal.` : ''}</p>
        </div>

        {/* SIREN */}
        <p className="hidden shrink-0 font-mono text-xs text-slate-400 sm:block dark:text-slate-500">{formatSiren(company.siren)}</p>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={() => onToggleFavorite(company)}
            className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
          >
            <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => onDetail(company)}
            className="rounded-lg p-1.5 text-slate-300 transition hover:text-[#124bd2]"
            title="Voir la fiche"
          >
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  // Vue grille
  return (
    <div className={`card-lift group flex flex-col rounded-2xl border bg-white p-5 cursor-pointer dark:bg-slate-900 ${company.isActive ? 'border-slate-200 hover:border-blue-200 dark:border-slate-800 dark:hover:border-blue-800' : 'border-slate-200 opacity-75 dark:border-slate-800'}`}
      onClick={() => onDetail(company)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${typeAccent(company.typeLabel)}`}>
          {companyInitials(company.name)}
        </div>
        <div className="flex items-center gap-1">
          {isNew(company.createdAt) && (
            <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-[#124bd2]">NEW</span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(company) }}
            className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-slate-200 group-hover:text-slate-300 hover:!text-amber-400'}`}
          >
            <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      {/* Nom + statut */}
      <div className="mt-3">
        <p className="line-clamp-2 font-semibold leading-snug text-slate-800 group-hover:text-[#124bd2] transition dark:text-slate-100">{company.name}</p>
        <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${company.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${company.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {company.isActive ? 'Actif' : 'Cessé'}
        </span>
      </div>

      <div className="my-3 h-px bg-slate-100 dark:bg-slate-800" />

      {/* Détails */}
      <div className="flex-1 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
        <p className="flex items-center gap-2">
          <Hash size={12} className="shrink-0 text-slate-300" />
          <span className="font-mono tracking-tight">{formatSiren(company.siren)}</span>
        </p>
        <p className="flex items-center gap-2">
          <MapPin size={12} className="shrink-0 text-slate-300" />
          <span className="truncate">{company.city} ({company.zipCode})</span>
        </p>
        <p className="flex items-center gap-2">
          <Zap size={12} className="shrink-0 text-slate-300" />
          <span className="truncate">{company.typeLabel}</span>
        </p>
        {company.employees && company.employees !== 'NC' && (
          <p className="flex items-center gap-2">
            <Users size={12} className="shrink-0 text-slate-300" />
            <span>{company.employees} salariés</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 flex gap-2">
        <button
          onClick={e => { e.stopPropagation(); onDetail(company) }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] hover:bg-blue-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-800 dark:hover:bg-blue-950/30"
        >
          Voir la fiche
          <ArrowRight size={12} />
        </button>
        <a
          href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${company.siren}`}
          target="_blank" rel="noopener"
          onClick={e => e.stopPropagation()}
          className="flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-400 transition hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-700 dark:text-slate-500 dark:hover:border-blue-800"
          title="Fiche officielle"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  )
}

// ─── Vue Favoris (inline) ─────────────────────────────────────────────────────
function FavoritesView({
  favorites, onToggleFav, onGoSearch,
}: {
  favorites: Set<string>
  onToggleFav: (siren: string) => void
  onGoSearch: () => void
}) {
  const [favs, setFavs] = useState<FavStored[]>(loadStoredFavs)

  const handleRemove = (siren: string) => {
    removeStoredFav(siren)
    onToggleFav(siren)
    setFavs(loadStoredFavs())
  }

  const handleExport = () => {
    const csv = ['SIREN;Nom;Ville;Type;Ajouté le',
      ...favs.map(f => `${f.siren};"${f.name}";"${f.city}";"${f.type}";${new Date(f.savedAt).toLocaleDateString('fr-FR')}`)
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'favoris.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-6 animate-fade-in">
      {/* Toolbar */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Mes favoris</h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            {favs.length} contact{favs.length !== 1 ? 's' : ''} sauvegardé{favs.length !== 1 ? 's' : ''}
          </p>
        </div>
        {favs.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-700"
          >
            <Download size={12} /> Exporter en CSV
          </button>
        )}
      </div>

      {/* Empty state */}
      {favs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 dark:bg-amber-950/30">
            <Star size={26} className="text-amber-300" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Aucun favori</h2>
          <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
            Cliquez sur ★ sur une fiche pour sauvegarder une entreprise.
          </p>
          <button
            onClick={onGoSearch}
            className="mt-6 flex items-center gap-2 rounded-xl bg-[#124bd2] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0f3fc7]"
          >
            <Search size={14} /> Lancer une recherche
          </button>
        </div>
      )}

      {/* Grille favoris */}
      {favs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {favs.map(f => (
            <div
              key={f.siren}
              className="card-lift group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold ${typeAccent(f.type)}`}>
                {companyInitials(f.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.name}</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{f.type}</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{f.city}</p>
                <p className="mt-1 font-mono text-[10px] text-slate-300 dark:text-slate-600">
                  {f.siren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100">
                <a
                  href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${f.siren}`}
                  target="_blank" rel="noopener"
                  className="rounded-lg p-1.5 text-slate-300 transition hover:text-[#124bd2] dark:text-slate-600 dark:hover:text-blue-400"
                >
                  <ExternalLink size={13} />
                </a>
                <button
                  onClick={() => handleRemove(f.siren)}
                  className="rounded-lg p-1.5 text-amber-400 transition hover:text-red-400"
                >
                  <Star size={13} fill="currentColor" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function SearchPage({ account, onLogout, onOpenAccount }: SearchPageProps) {
  // État de recherche
  const [query, setQuery]               = useState('')
  const [inputValue, setInputValue]     = useState('')
  const [department, setDepartment]     = useState('')
  const [activityCode, setActivityCode] = useState('')
  const [activeOnly, setActiveOnly]     = useState(true)
  const [page, setPage]                 = useState(1)
  const [perPage, setPerPage]           = useState(20)
  const [viewMode, setViewMode]         = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters]   = useState(false)

  // Résultats
  const [results, setResults]       = useState<CompanyResult[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setLoading]     = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // UI extras
  const [selectedCompany, setSelectedCompany] = useState<CompanyResult | null>(null)
  const [showRecent, setShowRecent]           = useState(false)
  const [recentSearches, setRecentSearches]   = useState<string[]>([])
  const [favorites, setFavorites]             = useState<Set<string>>(() => new Set(loadStoredFavs().map(f => f.siren)))
  const [appView, setAppView]                 = useState<AppView>('search')
  const [usedQuota, setUsedQuota]             = useState(account.monthlyUsage)
  const [darkMode, setDarkMode]               = useState(() => document.documentElement.classList.contains('dark'))

  // Sync dark mode with <html> class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('trouve_dark', darkMode ? '1' : '0')
  }, [darkMode])

  // Refs
  const searchInputRef  = useRef<HTMLInputElement>(null)
  const debounceRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeFiltersCount = [department, activityCode, !activeOnly].filter(Boolean).length

  // Charger les recherches récentes
  useEffect(() => {
    setRecentSearches(readRecentSearches())
  }, [])

  // ⌘K / Ctrl+K pour focaliser la recherche
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ─── Lancer une recherche ───────────────────────────────────────────────────
  const doSearch = useCallback(async (params: SearchParams, pg = 1) => {
    if (usedQuota >= account.quota && account.quota > 0) {
      setError('Quota mensuel atteint — passez à un plan supérieur pour continuer.')
      return
    }
    setLoading(true); setError(null)

    try {
      const res = await searchCompanies({ ...params, page: pg, perPage: params.perPage ?? perPage })
      setResults(res.results)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(pg)
      setHasSearched(true)

      if (params.query?.trim()) {
        saveRecentSearch(params.query.trim())
        setRecentSearches(readRecentSearches())
      }
      setUsedQuota(q => q + 1)
      recordSearch(params.query || 'secteur immobilier', { department: params.department, activityCode: params.activityCode, activeOnly: params.activeOnly }, res.total).catch(() => {})
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la recherche')
    } finally {
      setLoading(false)
    }
  }, [usedQuota, account.quota])

  // Debounce search-as-you-type
  useEffect(() => {
    if (!hasSearched) return // pas de debounce avant la 1ère recherche manuelle
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch({ query: inputValue, department, activityCode, activeOnly })
    }, 420)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [inputValue]) // eslint-disable-line

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(inputValue)
    setShowRecent(false)
    doSearch({ query: inputValue, department, activityCode, activeOnly })
  }

  const handleQuickFilter = (f: typeof QUICK_FILTERS[0]) => {
    setInputValue(f.query)
    setQuery(f.query)
    setDepartment(f.dept)
    setActivityCode(f.code)
    doSearch({ query: f.query, department: f.dept, activityCode: f.code, activeOnly })
  }

  const handleRecentSearch = (q: string) => {
    setInputValue(q); setQuery(q); setShowRecent(false)
    doSearch({ query: q, department, activityCode, activeOnly })
  }

  // Recherche auto au montage
  useEffect(() => {
    doSearch({ query: '', department: '', activityCode: '', activeOnly: true })
  }, []) // eslint-disable-line

  const handlePageChange = (pg: number) => {
    doSearch({ query, department, activityCode, activeOnly }, pg)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleFavorite = async (company: CompanyResult) => {
    const newFavs = new Set(favorites)
    if (newFavs.has(company.siren)) {
      newFavs.delete(company.siren)
      removeStoredFav(company.siren)
    } else {
      newFavs.add(company.siren)
      saveStoredFav(company)
      saveFavorite(account, { targetSiren: company.siren, targetName: company.name, targetCity: company.city }).catch(() => {})
    }
    setFavorites(newFavs)
  }

  const handleToggleFavFromDrawer = (siren: string) => {
    const newFavs = new Set(favorites)
    newFavs.delete(siren)
    setFavorites(newFavs)
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8ff] dark:bg-[#0d1424]">

      {/* ── Topbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-lg dark:border-slate-800 dark:bg-[#111827]/95">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-6">

          {/* Logo */}
          <a href="#" onClick={e => e.preventDefault()} className="shrink-0">
            <img src={trouveLogo} alt="trouvé!" className="h-7 w-auto" />
          </a>

          {/* Barre de recherche */}
          <form onSubmit={handleSearch} className="relative flex flex-1 items-center gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onFocus={() => setShowRecent(true)}
                onBlur={() => setTimeout(() => setShowRecent(false), 150)}
                placeholder="Nom, ville, SIREN… (⌘K)"
                autoComplete="off"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-800 dark:focus:border-blue-600"
              />

              {/* Dropdown recherches récentes */}
              {showRecent && recentSearches.length > 0 && (
                <div className="absolute top-full left-0 z-50 mt-1.5 w-full rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Récents</p>
                  {recentSearches.map(r => (
                    <button
                      key={r}
                      type="button"
                      onMouseDown={() => handleRecentSearch(r)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Clock size={13} className="shrink-0 text-slate-300 dark:text-slate-600" /> {r}
                    </button>
                  ))}
                  <button
                    type="button"
                    onMouseDown={() => { localStorage.removeItem(RECENT_SEARCHES_KEY); setRecentSearches([]) }}
                    className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs text-slate-400 hover:text-slate-600 dark:border-slate-800 dark:text-slate-600 dark:hover:text-slate-400"
                  >
                    <X size={11} /> Effacer l'historique
                  </button>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="flex h-10 items-center gap-2 rounded-xl bg-[#124bd2] px-4 text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-60"
            >
              {isLoading
                ? <RefreshCw size={14} className="animate-spin" />
                : <><Search size={14} /> <span className="hidden sm:inline">Rechercher</span></>
              }
            </button>
          </form>

          {/* Actions topbar */}
          <div className="flex shrink-0 items-center gap-2">
            <QuotaBar used={usedQuota} total={account.quota} />

            {/* Export CSV — seulement sur vue recherche avec résultats */}
            {appView === 'search' && results.length > 0 && (
              <button
                onClick={() => exportCSV(results, query)}
                title="Exporter en CSV"
                className="hidden h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-blue-300 hover:text-[#124bd2] dark:border-slate-700 dark:text-slate-400 md:flex"
              >
                <Download size={14} />
              </button>
            )}

            {/* Avatar */}
            <button
              onClick={onOpenAccount}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#124bd2]/10 text-[#124bd2] text-xs font-bold transition hover:bg-[#124bd2]/20"
              title={`${account.firstName} ${account.lastName}`}
            >
              {account.firstName[0]}{account.lastName[0]}
            </button>

            {/* Dark mode */}
            <button
              onClick={() => setDarkMode(d => !d)}
              title={darkMode ? 'Mode clair' : 'Mode sombre'}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {/* Logout */}
            <button
              onClick={onLogout}
              title="Se déconnecter"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-300 transition hover:bg-red-50 hover:text-red-500 dark:text-slate-600"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Nav tabs + quick filters */}
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-4 pb-2 md:px-6">
          {/* Onglets de navigation */}
          {(
            [
              { key: 'search',    label: 'Recherche',  icon: Search },
              { key: 'history',   label: 'Historique', icon: History },
              { key: 'favorites', label: `Favoris${favorites.size > 0 ? ` (${favorites.size})` : ''}`, icon: Star },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAppView(key)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                appView === key
                  ? 'bg-[#124bd2]/8 text-[#124bd2] dark:bg-blue-950/40 dark:text-blue-400'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon size={12} className={appView === key && key === 'favorites' ? 'fill-current' : ''} />
              {label}
            </button>
          ))}

          {/* Séparateur + quick filters (seulement sur la vue Recherche) */}
          {appView === 'search' && (
            <>
              <div className="mx-1.5 h-4 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
              {QUICK_FILTERS.map(f => (
                <button
                  key={f.label}
                  onClick={() => handleQuickFilter(f)}
                  className={`hidden rounded-full border px-3 py-1 text-xs font-medium transition md:block
                    ${(department === f.dept && activityCode === f.code && (inputValue === f.query || f.query === ''))
                      ? 'border-[#124bd2] bg-[#124bd2]/8 text-[#124bd2] dark:bg-blue-950/50'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-700'
                    }`}
                >
                  {f.label}
                </button>
              ))}
            </>
          )}
        </div>
      </header>

      {/* ── Corps ──────────────────────────────────────────────────────────── */}

      {/* Vue Historique */}
      {appView === 'history' && (
        <HistoryPage
          account={account}
          embedded
          onReplay={(q, dept, code) => {
            setAppView('search')
            setInputValue(q); setQuery(q); setDepartment(dept); setActivityCode(code)
            doSearch({ query: q, department: dept, activityCode: code, activeOnly })
          }}
        />
      )}

      {/* Vue Favoris */}
      {appView === 'favorites' && (
        <FavoritesView
          favorites={favorites}
          onToggleFav={handleToggleFavFromDrawer}
          onGoSearch={() => setAppView('search')}
        />
      )}

      {/* Vue Recherche */}
      <div className={`mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-5 md:px-6 ${appView !== 'search' ? 'hidden' : ''}`}>

        {/* Sidebar filtres — desktop */}
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Filtres</p>

              {/* Département */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Département</label>
                <select
                  value={department}
                  onChange={e => { setDepartment(e.target.value); setPage(1) }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">Tous</option>
                  {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                </select>
              </div>

              {/* Type d'activité */}
              <div className="mt-3 space-y-1.5">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Type</label>
                <select
                  value={activityCode}
                  onChange={e => { setActivityCode(e.target.value); setPage(1) }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">Tous les types</option>
                  {Object.entries(TYPE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              {/* Statut */}
              <div className="mt-3">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <div
                    onClick={() => setActiveOnly(!activeOnly)}
                    className={`flex h-4 w-4 items-center justify-center rounded border-2 transition ${activeOnly ? 'border-[#124bd2] bg-[#124bd2]' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'}`}
                  >
                    {activeOnly && <span className="h-2 w-2 rounded-sm bg-white" />}
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Actives uniquement</span>
                </label>
              </div>

              <button
                onClick={handleSearch}
                className="mt-4 w-full rounded-xl bg-[#124bd2] py-2 text-xs font-semibold text-white transition hover:bg-[#0b3fbc]"
              >
                Appliquer
              </button>

              {activeFiltersCount > 0 && (
                <button
                  onClick={() => { setDepartment(''); setActivityCode(''); setActiveOnly(true) }}
                  className="mt-2 w-full rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Réinitialiser
                </button>
              )}
            </div>

            {/* Quota card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Quota mensuel</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-bold text-[#124bd2]">{usedQuota.toLocaleString('fr-FR')}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">/ {account.quota.toLocaleString('fr-FR')}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all ${quotaPercent(usedQuota, account.quota) >= 80 ? 'bg-amber-400' : 'bg-[#124bd2]'}`}
                  style={{ width: `${quotaPercent(usedQuota, account.quota)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">Renouvellement le 1er du mois</p>
            </div>

            {/* Keyboard shortcut hint */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900">
              <Keyboard size={12} className="text-slate-300 dark:text-slate-600" />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">⌘K</kbd> pour focaliser la recherche
              </span>
            </div>
          </div>
        </aside>

        {/* Zone résultats */}
        <main className="flex-1 min-w-0">

          {/* Toolbar résultats */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasSearched && !isLoading && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{total.toLocaleString('fr-FR')}</span>
                  {' '}résultat{total > 1 ? 's' : ''}
                  {query && <span> pour <em className="text-slate-700 dark:text-slate-300">"{query}"</em></span>}
                  {department && <span> · {departmentLabel(department)}</span>}
                </p>
              )}

              {/* Filtres mobile */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition lg:hidden ${activeFiltersCount > 0 ? 'border-blue-300 bg-blue-50 text-[#124bd2]' : 'border-slate-200 text-slate-600'}`}
              >
                <SlidersHorizontal size={13} />
                Filtres
                {activeFiltersCount > 0 && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#124bd2] text-[10px] font-bold text-white">{activeFiltersCount}</span>}
              </button>
            </div>

            {/* Actions droite */}
            <div className="flex items-center gap-2">
              {results.length > 0 && (
                <button
                  onClick={() => exportCSV(results, query)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] md:hidden"
                >
                  <Download size={12} /> Export
                </button>
              )}
              {/* Résultats par page */}
              <select
                value={perPage}
                onChange={e => {
                  const pp = Number(e.target.value)
                  setPerPage(pp)
                  doSearch({ query, department, activityCode, activeOnly, perPage: pp }, 1)
                }}
                className="hidden h-8 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none transition focus:border-blue-300 hover:border-blue-200 sm:block dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>

              {/* Switcher vue */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-lg p-1.5 transition ${viewMode === 'grid' ? 'bg-[#124bd2] text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-lg p-1.5 transition ${viewMode === 'list' ? 'bg-[#124bd2] text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Filtres mobile */}
          {showFilters && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 lg:hidden dark:border-slate-800 dark:bg-slate-900">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Département</label>
                  <select value={department} onChange={e => setDepartment(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <option value="">Tous</option>
                    {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                  <select value={activityCode} onChange={e => setActivityCode(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                    <option value="">Tous</option>
                    {Object.entries(TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded" />
                <span className="text-xs text-slate-600">Actives uniquement</span>
              </label>
              <button onClick={() => { handleSearch(); setShowFilters(false) }}
                className="mt-3 w-full rounded-xl bg-[#124bd2] py-2 text-xs font-semibold text-white">
                Appliquer les filtres
              </button>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle size={16} className="shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto text-amber-400 hover:text-amber-600"><X size={14} /></button>
            </div>
          )}

          {/* Skeleton */}
          {isLoading && (
            <div className={viewMode === 'grid' ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-2'}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
                      <div className="h-2.5 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-2.5 w-full rounded bg-slate-100 dark:bg-slate-800" />
                    <div className="h-2.5 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !hasSearched && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#124bd2]">
                <Search size={28} />
              </div>
              <h3 className="text-lg font-semibold text-slate-800">Commencez votre prospection</h3>
              <p className="mt-2 max-w-sm text-sm text-slate-400">
                Entrez un nom, une ville, ou laissez vide pour voir toutes les agences immobilières de France.
              </p>
            </div>
          )}

          {/* Aucun résultat */}
          {!isLoading && hasSearched && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <Building2 size={28} />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">Aucun résultat</h3>
              <p className="mt-2 text-sm text-slate-400">Essayez avec d'autres critères ou supprimez des filtres.</p>
              <button
                onClick={() => { setInputValue(''); setDepartment(''); setActivityCode(''); setActiveOnly(true); doSearch({ query: '', department: '', activityCode: '', activeOnly: true }) }}
                className="mt-4 rounded-xl bg-[#124bd2] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]"
              >
                Réinitialiser
              </button>
            </div>
          )}

          {/* Résultats */}
          {!isLoading && results.length > 0 && (
            <>
              {viewMode === 'grid' ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {results.map(c => (
                    <CompanyCard
                      key={c.siren} company={c}
                      isFavorite={favorites.has(c.siren)}
                      onToggleFavorite={toggleFavorite}
                      viewMode="grid"
                      onDetail={setSelectedCompany}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {results.map(c => (
                    <CompanyCard
                      key={c.siren} company={c}
                      isFavorite={favorites.has(c.siren)}
                      onToggleFavorite={toggleFavorite}
                      viewMode="list"
                      onDetail={setSelectedCompany}
                    />
                  ))}
                </div>
              )}

              {/* Export en bas */}
              {results.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => exportCSV(results, query)}
                    className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] md:flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-blue-700"
                  >
                    <Download size={13} />
                    Exporter ces {results.length} résultats en CSV
                  </button>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page <= 1}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-[#124bd2] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    const pg = i + Math.max(1, Math.min(page - 3, totalPages - 6))
                    return (
                      <button
                        key={pg}
                        onClick={() => handlePageChange(pg)}
                        className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-medium transition ${pg === page ? 'border-[#124bd2] bg-[#124bd2] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
                      >
                        {pg}
                      </button>
                    )
                  })}

                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-[#124bd2] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                  >
                    <ChevronRight size={16} />
                  </button>

                  <span className="ml-2 hidden text-xs text-slate-400 sm:inline dark:text-slate-500">
                    Page {page}/{totalPages} · {total.toLocaleString('fr-FR')} résultats
                  </span>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Slide-over détail entreprise */}
      {selectedCompany && (
        <CompanySlideOver
          company={selectedCompany}
          onClose={() => setSelectedCompany(null)}
        />
      )}

    </div>
  )
}
