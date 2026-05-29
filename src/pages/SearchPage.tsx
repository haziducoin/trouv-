import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, SlidersHorizontal, Star, ChevronLeft, ChevronRight,
  Building2, MapPin, Hash, Users, LogOut, X,
  Zap, RefreshCw, ExternalLink, LayoutGrid, List,
  ShieldCheck, AlertCircle, Download, Clock,
  ArrowRight, Globe, TrendingUp, FileText, Info,
  Moon, Sun, History, ChevronUp, ChevronDown,
  UserCircle2, LayoutDashboard, UserPlus, FolderSearch, MessageSquare,
  Phone, Mail, Database,
} from 'lucide-react'

type AppView = 'search' | 'history' | 'favorites'
import trouveLogo from '@/assets/trouve-logo.png'
import { DEPARTMENTS, TYPE_LABELS, EMPLOYEE_RANGES, LEGAL_FORMS } from '@/lib/searchApi'
import {
  searchProspects, exportProspectsCSV,
  type ProspectResult, type ProspectSearchParams,
} from '@/lib/prospectApi'
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
const FAV_STORE_KEY = 'trouve_fav_data_v2'

interface FavStored {
  id:          string
  name:        string
  jobTitle:    string
  companyName: string
  city:        string
  savedAt:     string
}

function loadStoredFavs(): FavStored[] {
  try { return JSON.parse(localStorage.getItem(FAV_STORE_KEY) ?? '[]') } catch { return [] }
}
function saveStoredFav(p: ProspectResult) {
  const favs = loadStoredFavs().filter(f => f.id !== p.id)
  localStorage.setItem(FAV_STORE_KEY, JSON.stringify([
    {
      id:          p.id,
      name:        p.fullName,
      jobTitle:    p.jobTitle    ?? '',
      companyName: p.companyName ?? '',
      city:        p.city        ?? '',
      savedAt:     new Date().toISOString(),
    },
    ...favs,
  ].slice(0, 200)))
}
function removeStoredFav(id: string) {
  localStorage.setItem(FAV_STORE_KEY, JSON.stringify(loadStoredFavs().filter(f => f.id !== id)))
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

  const handleRemove = (id: string) => {
    removeStoredFav(id)
    onToggleFav(id)
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
                const csv = ['Nom;Poste;Entreprise;Ville;Ajouté le',
                  ...favs.map(f => `"${f.name}";"${f.jobTitle}";"${f.companyName}";"${f.city}";${new Date(f.savedAt).toLocaleDateString('fr-FR')}`)
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
                <div key={f.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[10px] font-bold text-[#124bd2]">
                    {prospectInitials(f.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{f.jobTitle} · {f.companyName}</p>
                    <p className="mt-0.5 text-xs text-slate-300">{f.city}</p>
                  </div>
                  <button
                    onClick={() => handleRemove(f.id)}
                    className="rounded-lg p-1.5 text-amber-400 transition hover:text-red-400"
                  >
                    <Star size={13} fill="currentColor" />
                  </button>
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

// ─── Prospect Detail Slide-Over ────────────────────────────────────────────────
function ProspectSlideOver({ prospect, onClose }: { prospect: ProspectResult; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-bold ${prospectAccent(prospect.jobTitle)}`}>
              {prospectInitials(prospect.fullName)}
            </div>
            <div>
              <h2 className="font-bold leading-snug text-slate-800">{prospect.fullName}</h2>
              {prospect.jobTitle && <p className="mt-0.5 text-sm text-slate-500">{prospect.jobTitle}</p>}
              {prospect.companyName && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[#124bd2]">
                  <Building2 size={11} /> {prospect.companyName}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="mt-0.5 rounded-xl p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        {/* Statut */}
        <div className="border-b border-slate-100 px-6 py-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${prospect.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${prospect.isActive ? 'bg-emerald-500' : 'bg-red-400'}`} />
            {prospect.isActive ? 'Contact actif' : 'Inactif'}
          </span>
        </div>

        {/* Corps */}
        <div className="flex-1 space-y-5 p-6">

          {/* Coordonnées */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Coordonnées</p>
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
              {prospect.phone && (
                <div className="flex items-center gap-2.5">
                  <Phone size={13} className="shrink-0 text-slate-300" />
                  <a href={`tel:${prospect.phone}`} className="text-xs text-[#124bd2] hover:underline">{prospect.phone}</a>
                </div>
              )}
              {prospect.phoneMobile && (
                <div className="flex items-center gap-2.5">
                  <Phone size={13} className="shrink-0 text-slate-300" />
                  <a href={`tel:${prospect.phoneMobile}`} className="text-xs text-[#124bd2] hover:underline">{prospect.phoneMobile} <span className="text-slate-400">(mobile)</span></a>
                </div>
              )}
              {prospect.email && (
                <div className="flex items-center gap-2.5">
                  <Mail size={13} className="shrink-0 text-slate-300" />
                  <a href={`mailto:${prospect.email}`} className="truncate text-xs text-[#124bd2] hover:underline">{prospect.email}</a>
                </div>
              )}
              {prospect.linkedinUrl && (
                <div className="flex items-center gap-2.5">
                  <ExternalLink size={13} className="shrink-0 text-slate-300" />
                  <a href={prospect.linkedinUrl} target="_blank" rel="noopener" className="truncate text-xs text-[#124bd2] hover:underline">LinkedIn</a>
                </div>
              )}
              {!prospect.phone && !prospect.email && !prospect.phoneMobile && (
                <p className="text-xs text-slate-400">Aucune coordonnée disponible</p>
              )}
            </div>
          </section>

          {/* Entreprise */}
          {(prospect.companyName || prospect.activityCode || prospect.companySize) && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Entreprise</p>
              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
                {prospect.companyName && <Row icon={<Building2 size={13} className="text-slate-300" />} label="Société" value={prospect.companyName} />}
                {prospect.companySiren && <Row icon={<Hash size={13} className="text-slate-300" />} label="SIREN" value={prospect.companySiren.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3')} mono />}
                {prospect.activityCode && <Row icon={<Zap size={13} className="text-slate-300" />} label="Activité" value={`${prospect.activityCode}${prospect.activityLabel ? ` — ${prospect.activityLabel}` : ''}`} />}
                {prospect.companySize && <Row icon={<Users size={13} className="text-slate-300" />} label="Effectif" value={prospect.companySize} />}
                {prospect.companyType && <Row icon={<FileText size={13} className="text-slate-300" />} label="Forme" value={prospect.companyType} />}
              </div>
            </section>
          )}

          {/* Localisation */}
          {(prospect.address || prospect.city) && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Localisation</p>
              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
                {prospect.address && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Adresse" value={prospect.address} />}
                {prospect.city && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Commune" value={`${prospect.city}${prospect.zipCode ? ` (${prospect.zipCode})` : ''}`} />}
                {prospect.region && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Région" value={prospect.region} />}
              </div>
            </section>
          )}

          {/* Sources externes */}
          {prospect.companySiren && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Sources entreprise</p>
              <div className="grid grid-cols-2 gap-2">
                <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${prospect.companySiren}`}
                  target="_blank" rel="noopener"
                  className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs font-medium text-[#124bd2] transition hover:bg-blue-100">
                  <ShieldCheck size={13} /> Annuaire officiel
                </a>
                <a href={`https://pappers.fr/entreprise/${prospect.companySiren}`}
                  target="_blank" rel="noopener"
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">
                  <Info size={13} /> Pappers
                </a>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// Initiales pour l'avatar prospect
function prospectInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

// Couleur avatar selon le poste
function prospectAccent(jobTitle: string | null): string {
  const t = (jobTitle ?? '').toLowerCase()
  if (t.includes('directeur') || t.includes('direction') || t.includes('pdg') || t.includes('gérant'))
    return 'bg-blue-50 text-[#124bd2]'
  if (t.includes('commercial') || t.includes('vente') || t.includes('agent'))
    return 'bg-emerald-50 text-emerald-600'
  if (t.includes('responsable') || t.includes('manager') || t.includes('chef'))
    return 'bg-purple-50 text-purple-600'
  if (t.includes('négociateur') || t.includes('conseiller'))
    return 'bg-amber-50 text-amber-600'
  return 'bg-slate-50 text-slate-500'
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

// ─── Composant ProspectCard ────────────────────────────────────────────────────
function ProspectCard({
  prospect, isFavorite, onToggleFavorite, viewMode, onDetail,
}: {
  prospect:          ProspectResult
  isFavorite:        boolean
  onToggleFavorite:  (p: ProspectResult) => void
  viewMode:          'grid' | 'list'
  onDetail:          (p: ProspectResult) => void
}) {
  const initials = prospectInitials(prospect.fullName)
  const accent   = prospectAccent(prospect.jobTitle)

  if (viewMode === 'list') {
    return (
      <div className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 transition hover:border-blue-200 hover:shadow-sm">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${accent}`}>
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => onDetail(prospect)}
              className="font-semibold text-slate-800 hover:text-[#124bd2] hover:underline text-left">
              {prospect.fullName}
            </button>
            {prospect.jobTitle && (
              <span className="text-xs text-slate-400">{prospect.jobTitle}</span>
            )}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${prospect.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {prospect.isActive ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {prospect.companyName}{prospect.companyName && prospect.city ? ' · ' : ''}{prospect.city}
            {prospect.zipCode ? ` (${prospect.zipCode})` : ''}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          {prospect.phone && (
            <a href={`tel:${prospect.phone}`} onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-slate-500 transition hover:text-[#124bd2]">
              <Phone size={11} /> {prospect.phone}
            </a>
          )}
          {prospect.email && (
            <a href={`mailto:${prospect.email}`} onClick={e => e.stopPropagation()}
              className="text-xs text-slate-400 transition hover:text-[#124bd2] truncate max-w-[140px]">
              {prospect.email}
            </a>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => onToggleFavorite(prospect)}
            className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}>
            <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button onClick={() => onDetail(prospect)}
            className="rounded-lg p-1.5 text-slate-300 transition hover:text-[#124bd2]">
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    )
  }

  // Vue grille
  return (
    <div
      className="card-lift group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 cursor-pointer hover:border-blue-200 hover:shadow-sm transition"
      onClick={() => onDetail(prospect)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${accent}`}>
          {initials}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(prospect) }}
          className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-slate-200 group-hover:text-slate-300 hover:!text-amber-400'}`}
        >
          <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Identité */}
      <div className="mt-3">
        <p className="font-semibold leading-snug text-slate-800 group-hover:text-[#124bd2] transition">{prospect.fullName}</p>
        {prospect.jobTitle && (
          <p className="mt-0.5 text-xs text-slate-400">{prospect.jobTitle}</p>
        )}
        {prospect.companyName && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[#124bd2]">
            <Building2 size={10} className="shrink-0" /> {prospect.companyName}
          </p>
        )}
      </div>

      <div className="my-3 h-px bg-slate-100" />

      {/* Coordonnées */}
      <div className="flex-1 space-y-1.5 text-xs text-slate-500">
        {prospect.phone ? (
          <p className="flex items-center gap-2">
            <Phone size={11} className="shrink-0 text-slate-300" />
            <a href={`tel:${prospect.phone}`} onClick={e => e.stopPropagation()}
              className="hover:text-[#124bd2] transition">{prospect.phone}</a>
          </p>
        ) : prospect.phoneMobile ? (
          <p className="flex items-center gap-2">
            <Phone size={11} className="shrink-0 text-slate-300" />
            <a href={`tel:${prospect.phoneMobile}`} onClick={e => e.stopPropagation()}
              className="hover:text-[#124bd2] transition">{prospect.phoneMobile}</a>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-slate-300">
            <Phone size={11} className="shrink-0" /> —
          </p>
        )}

        {prospect.email ? (
          <p className="flex items-center gap-2">
            <Mail size={11} className="shrink-0 text-slate-300" />
            <a href={`mailto:${prospect.email}`} onClick={e => e.stopPropagation()}
              className="truncate hover:text-[#124bd2] transition">{prospect.email}</a>
          </p>
        ) : (
          <p className="flex items-center gap-2 text-slate-300">
            <Mail size={11} className="shrink-0" /> —
          </p>
        )}

        {prospect.city && (
          <p className="flex items-center gap-2">
            <MapPin size={11} className="shrink-0 text-slate-300" />
            <span>{prospect.city}{prospect.zipCode ? ` (${prospect.zipCode})` : ''}</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4">
        <button
          onClick={e => { e.stopPropagation(); onDetail(prospect) }}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] hover:bg-blue-50"
        >
          Voir la fiche <ArrowRight size={12} />
        </button>
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

  const handleRemove = (id: string) => {
    removeStoredFav(id)
    onToggleFav(id)
    setFavs(loadStoredFavs())
  }

  const handleExport = () => {
    const csv = ['Nom;Poste;Entreprise;Ville;Ajouté le',
      ...favs.map(f => `"${f.name}";"${f.jobTitle}";"${f.companyName}";"${f.city}";${new Date(f.savedAt).toLocaleDateString('fr-FR')}`)
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
              key={f.id}
              className="card-lift group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[10px] font-bold text-[#124bd2]">
                {prospectInitials(f.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{f.name}</p>
                <p className="mt-0.5 text-xs text-slate-400">{f.jobTitle}</p>
                <p className="mt-0.5 text-xs text-slate-400">{f.companyName}</p>
                <p className="mt-0.5 text-xs text-slate-300">{f.city}</p>
              </div>
              <button
                onClick={() => handleRemove(f.id)}
                className="rounded-lg p-1.5 text-amber-400 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
              >
                <Star size={13} fill="currentColor" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── User Menu dropdown ────────────────────────────────────────────────────────
function UserMenu({ account, onLogout, onOpenAccount }: { account: Account; onLogout: () => void; onOpenAccount: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Nom affiché : société > prénom nom > préfixe email
  const displayName = account.companyName
    || `${account.firstName} ${account.lastName}`.trim()
    || account.email.split('@')[0]

  // Initiale pour l'avatar dans le bouton trigger
  const initial = (
    account.firstName?.[0] ?? account.companyName?.[0] ?? account.email[0] ?? 'U'
  ).toUpperCase()

  const items = [
    { icon: UserCircle2,     label: 'Mon profil',             action: () => { setOpen(false); onOpenAccount() } },
    { icon: LayoutDashboard, label: 'Dashboard',              action: () => setOpen(false) },
    { icon: UserPlus,        label: 'Parrainage',             action: () => setOpen(false) },
    { icon: FolderSearch,    label: 'Dossier investigation',  action: () => setOpen(false) },
    { icon: MessageSquare,   label: 'Support',                action: () => setOpen(false) },
  ]

  return (
    <div ref={ref} className="relative">
      {/* Trigger — initiale + nom complet + chevron */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-1.5 pr-3 py-1.5 transition hover:border-blue-200 hover:shadow-sm"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1B54FF] text-white text-xs font-bold shrink-0">
          {initial}
        </span>
        <span className="max-w-[140px] truncate text-sm font-medium text-slate-700">{displayName}</span>
        {open
          ? <ChevronUp size={13} className="text-slate-400" />
          : <ChevronDown size={13} className="text-slate-400" />
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header — username affiché une seule fois ici */}
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B54FF] text-white text-sm font-bold">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{displayName}</p>
              <p className="truncate text-xs text-slate-400">{account.email}</p>
            </div>
          </div>

          {/* Items — sans flèches */}
          <div className="py-1.5">
            {items.map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                onClick={action}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                  <Icon size={15} className="text-[#1B54FF]" />
                </span>
                <span className="whitespace-nowrap font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Separator + Logout */}
          <div className="border-t border-slate-100 py-1.5 dark:border-slate-800">
            <button
              onClick={() => { setOpen(false); onLogout() }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
                <LogOut size={15} className="text-red-500" />
              </span>
              <span className="font-medium">Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Recherche avancée (6 sections) ──────────────────────────────────────────
interface AdvancedFiltersProps {
  // État civil
  firstName: string; setFirstName: (v: string) => void
  lastName:  string; setLastName:  (v: string) => void
  jobTitle:  string; setJobTitle:  (v: string) => void
  // Adresse
  city:       string; setCity:       (v: string) => void
  address:    string; setAddress:    (v: string) => void
  zipCode:    string; setZipCode:    (v: string) => void
  department: string; setDepartment: (v: string) => void
  // Coordonnées
  phone: string; setPhone: (v: string) => void
  email: string; setEmail: (v: string) => void
  // Entreprise
  companyName:   string; setCompanyName:   (v: string) => void
  activityCode:  string; setActivityCode:  (v: string) => void
  employeeRange: string; setEmployeeRange: (v: string) => void
  legalForm:     string; setLegalForm:     (v: string) => void
  // Réseaux sociaux
  linkedin: string; setLinkedin: (v: string) => void
  // Actions
  onSearch: () => void
  onReset:  () => void
}

function AdvSection({
  id, icon, title, color, open, onToggle, children,
}: {
  id: string; icon: React.ReactNode; title: string; color: string
  open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-slate-700 hover:bg-slate-50/80 transition"
      >
        <span className="flex items-center gap-3">
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${color}`}>
            {icon}
          </span>
          <span className="font-semibold">{title}</span>
        </span>
        {open
          ? <ChevronUp size={14} className="text-slate-300" />
          : <ChevronDown size={14} className="text-slate-300" />
        }
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

function AdvInput({
  label, value, onChange, onEnter, placeholder, type = 'text',
}: {
  label: string; value: string; onChange: (v: string) => void
  onEnter?: () => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white placeholder:text-slate-300"
      />
    </div>
  )
}

function AdvSelect({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white"
      >
        {children}
      </select>
    </div>
  )
}

function AdvancedFilters(props: AdvancedFiltersProps) {
  const {
    firstName, setFirstName, lastName, setLastName, jobTitle, setJobTitle,
    city, setCity, address, setAddress, zipCode, setZipCode, department, setDepartment,
    phone, setPhone, email, setEmail,
    companyName, setCompanyName, activityCode, setActivityCode, employeeRange, setEmployeeRange, legalForm, setLegalForm,
    linkedin, setLinkedin,
    onSearch, onReset,
  } = props

  const [open, setOpen] = useState<string[]>(['civil', 'address', 'contact', 'company'])
  const tog = (k: string) => setOpen(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* 1 — État civil */}
      <AdvSection id="civil" icon={<UserCircle2 size={15} />} title="État civil"
        color="bg-blue-50 text-[#124bd2]" open={open.includes('civil')} onToggle={() => tog('civil')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AdvInput label="Prénom" value={firstName} onChange={setFirstName} onEnter={onSearch} placeholder="Jean" />
          <AdvInput label="Nom" value={lastName} onChange={setLastName} onEnter={onSearch} placeholder="Dupont" />
          <AdvInput label="Poste / Titre" value={jobTitle} onChange={setJobTitle} onEnter={onSearch} placeholder="Directeur commercial" />
        </div>
      </AdvSection>

      {/* 2 — Adresse */}
      <AdvSection id="address" icon={<MapPin size={15} />} title="Adresse"
        color="bg-emerald-50 text-emerald-600" open={open.includes('address')} onToggle={() => tog('address')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="Rue / Adresse" value={address} onChange={setAddress} onEnter={onSearch} placeholder="122 Boulevard Murat" />
          <AdvInput label="Ville" value={city} onChange={setCity} onEnter={onSearch} placeholder="Paris" />
          <AdvInput label="Code postal" value={zipCode}
            onChange={v => setZipCode(v.replace(/\D/g, '').slice(0, 5))}
            onEnter={onSearch} placeholder="75016" />
          <AdvSelect label="Département" value={department} onChange={v => { setDepartment(v); onSearch() }}>
            <option value="">Tous les départements</option>
            {DEPARTMENTS.map(d => <option key={d.code} value={d.code}>{d.label}</option>)}
          </AdvSelect>
        </div>
      </AdvSection>

      {/* 3 — Coordonnées */}
      <AdvSection id="contact" icon={<Phone size={15} />} title="Coordonnées"
        color="bg-purple-50 text-purple-600" open={open.includes('contact')} onToggle={() => tog('contact')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="Téléphone" value={phone} onChange={setPhone} onEnter={onSearch} placeholder="06 12 34 56 78" type="tel" />
          <AdvInput label="Email" value={email} onChange={setEmail} onEnter={onSearch} placeholder="jean.dupont@agence.fr" type="email" />
        </div>
      </AdvSection>

      {/* 4 — Entreprise */}
      <AdvSection id="company" icon={<Building2 size={15} />} title="Entreprise"
        color="bg-amber-50 text-amber-600" open={open.includes('company')} onToggle={() => tog('company')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="Nom de la société" value={companyName} onChange={setCompanyName} onEnter={onSearch} placeholder="Acme Immobilier" />
          <AdvSelect label="Secteur d'activité" value={activityCode} onChange={v => { setActivityCode(v); onSearch() }}>
            <option value="">Tous les secteurs</option>
            {Object.entries(TYPE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </AdvSelect>
          <AdvSelect label="Taille (effectif)" value={employeeRange} onChange={v => { setEmployeeRange(v); onSearch() }}>
            <option value="">Toutes tailles</option>
            {EMPLOYEE_RANGES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
          </AdvSelect>
          <AdvSelect label="Forme juridique" value={legalForm} onChange={v => { setLegalForm(v); onSearch() }}>
            <option value="">Toutes formes</option>
            {LEGAL_FORMS.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
          </AdvSelect>
        </div>
      </AdvSection>

      {/* 5 — Réseaux sociaux */}
      <AdvSection id="social" icon={<Globe size={15} />} title="Réseaux sociaux"
        color="bg-sky-50 text-sky-600" open={open.includes('social')} onToggle={() => tog('social')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="LinkedIn (URL ou nom)" value={linkedin} onChange={setLinkedin} onEnter={onSearch} placeholder="linkedin.com/in/jean-dupont" />
        </div>
      </AdvSection>

      {/* 6 — Autres informations */}
      <AdvSection id="other" icon={<Info size={15} />} title="Autres informations"
        color="bg-slate-100 text-slate-500" open={open.includes('other')} onToggle={() => tog('other')}>
        <p className="text-xs text-slate-400">D'autres critères seront disponibles après l'import de votre base de données.</p>
      </AdvSection>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3">
        <button type="button" onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-700">
          <RefreshCw size={11} /> Réinitialiser
        </button>
        <button type="button" onClick={onSearch}
          className="flex items-center gap-2 rounded-xl bg-[#124bd2] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#0b3fbc]">
          <Search size={12} /> Rechercher
        </button>
      </div>
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
  const [zipCode, setZipCode]           = useState('')
  const [employeeRange, setEmployeeRange] = useState('')
  const [legalForm, setLegalForm]       = useState('')
  // Filtres avancés — champs texte (libres)
  const [advFirstName, setAdvFirstName]     = useState('')
  const [advLastName, setAdvLastName]       = useState('')
  const [advJobTitle, setAdvJobTitle]       = useState('')
  const [advCity, setAdvCity]               = useState('')
  const [advAddress, setAdvAddress]         = useState('')
  const [advPhone, setAdvPhone]             = useState('')
  const [advEmail, setAdvEmail]             = useState('')
  const [advCompanyName, setAdvCompanyName] = useState('')
  const [advLinkedin, setAdvLinkedin]       = useState('')
  const [page, setPage]                 = useState(1)
  const [perPage, setPerPage]           = useState(20)
  const [viewMode, setViewMode]         = useState<'grid' | 'list'>('grid')
  const [showFilters, setShowFilters]   = useState(false)

  // Résultats
  const [results, setResults]       = useState<ProspectResult[]>([])
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setLoading]     = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  // UI extras
  const [selectedCompany, setSelectedCompany] = useState<ProspectResult | null>(null)
  const [showRecent, setShowRecent]           = useState(false)
  const [recentSearches, setRecentSearches]   = useState<string[]>([])
  const [favorites, setFavorites]             = useState<Set<string>>(() => new Set(loadStoredFavs().map(f => f.id)))
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
  const activeFiltersCount = [
    department, activityCode, zipCode, employeeRange, legalForm,
    advFirstName, advLastName, advJobTitle, advCity, advAddress, advPhone, advEmail, advCompanyName, advLinkedin,
  ].filter(Boolean).length

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

  // Construit la requête FTS en combinant la barre principale + tous les champs avancés texte
  const buildQuery = () =>
    [inputValue, advFirstName, advLastName, advJobTitle, advCity, advAddress, advPhone, advEmail, advCompanyName, advLinkedin]
      .map(s => s.trim()).filter(Boolean).join(' ')

  // ─── Lancer une recherche ───────────────────────────────────────────────────
  const doSearch = useCallback(async (params: ProspectSearchParams, pg = 1) => {
    if (usedQuota >= account.quota && account.quota > 0) {
      setError('Quota mensuel atteint — passez à un plan supérieur pour continuer.')
      return
    }
    setLoading(true); setError(null)

    try {
      const res = await searchProspects({ ...params, page: pg, perPage: params.perPage ?? perPage })
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
      recordSearch(params.query || 'prospects immobilier', { department: params.department, activityCode: params.activityCode }, res.total).catch(() => {})
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la recherche')
    } finally {
      setLoading(false)
    }
  }, [usedQuota, account.quota])

  // Debounce search-as-you-type (barre principale uniquement)
  useEffect(() => {
    if (!hasSearched) return // pas de debounce avant la 1ère recherche manuelle
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const q = [inputValue, advFirstName, advLastName, advJobTitle, advCity, advAddress, advPhone, advEmail, advCompanyName, advLinkedin]
        .map(s => s.trim()).filter(Boolean).join(' ')
      doSearch({ query: q, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
    }, 420)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [inputValue]) // eslint-disable-line

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(inputValue)
    setShowRecent(false)
    doSearch({ query: buildQuery(), department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
  }

  const handleQuickFilter = (f: typeof QUICK_FILTERS[0]) => {
    setInputValue(f.query)
    setQuery(f.query)
    setDepartment(f.dept)
    setActivityCode(f.code)
    doSearch({ query: f.query, department: f.dept, activityCode: f.code, activeOnly, zipCode, employeeRange, legalForm })
  }

  const handleRecentSearch = (q: string) => {
    setInputValue(q); setQuery(q); setShowRecent(false)
    // Pour une recherche récente on efface les champs avancés texte et relance sur q seul
    doSearch({ query: q, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
  }

  // Recherche auto au montage (pas de recherche vide — attendre la saisie)
  useEffect(() => {
    doSearch({ query: '', department: '', activityCode: '', activeOnly: true })
  }, []) // eslint-disable-line

  const handlePageChange = (pg: number) => {
    doSearch({ query: buildQuery(), department, activityCode, activeOnly, zipCode, employeeRange, legalForm }, pg)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleFavorite = async (prospect: ProspectResult) => {
    const newFavs = new Set(favorites)
    if (newFavs.has(prospect.id)) {
      newFavs.delete(prospect.id)
      removeStoredFav(prospect.id)
    } else {
      newFavs.add(prospect.id)
      saveStoredFav(prospect)
      saveFavorite(account, { targetSiren: prospect.companySiren ?? undefined, targetName: prospect.fullName, targetCity: prospect.city ?? undefined }).catch(() => {})
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
    <div className="flex min-h-screen bg-slate-50">

      {/* ── Sidebar gauche (fixe, dark) ──────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-[#07113d]">

        {/* Logo */}
        <div className="flex h-16 items-center px-6">
          <img src={trouveLogo} alt="trouvé!" className="h-7 w-auto brightness-0 invert" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-3 pt-2">
          {([
            { key: 'search',    label: 'Recherche',  icon: Search },
            { key: 'history',   label: 'Historique', icon: History },
            { key: 'favorites', label: `Favoris${favorites.size > 0 ? ` (${favorites.size})` : ''}`, icon: Star },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setAppView(key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                appView === key
                  ? 'bg-white/12 text-white'
                  : 'text-white/50 hover:bg-white/6 hover:text-white/80'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

      </aside>

      {/* ── Zone principale ──────────────────────────────────────────────── */}
      <div className="ml-60 flex flex-1 flex-col">

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
        {appView === 'search' && (
          <div className="flex flex-1 flex-col px-8 py-8">

            {/* En-tête */}
            <div className="mb-7 flex items-start justify-between">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-[#124bd2]">
                  Recherche professionnelle
                </p>
                <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-[#07113d]">
                  {hasSearched && query ? `"${query}"` : 'Nouveau ciblage'}
                </h1>
              </div>
              <div className="flex items-center gap-3">
                {account.status === 'approved' && (
                  <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                    <ShieldCheck size={12} />
                    Compte nominatif validé
                  </div>
                )}
                <UserMenu account={account} onLogout={onLogout} onOpenAccount={onOpenAccount} />
              </div>
            </div>

            {/* Barre de recherche principale */}
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onFocus={() => setShowRecent(true)}
                  onBlur={() => setTimeout(() => setShowRecent(false), 150)}
                  placeholder="Nom, prénom, entreprise, téléphone, adresse..."
                  autoComplete="off"
                  className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 text-base shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
                {showRecent && recentSearches.length > 0 && (
                  <div className="absolute top-full left-0 z-50 mt-1.5 w-full rounded-2xl border border-slate-200 bg-white shadow-lg">
                    <p className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Récents</p>
                    {recentSearches.map(r => (
                      <button key={r} type="button" onMouseDown={() => handleRecentSearch(r)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
                        <Clock size={13} className="shrink-0 text-slate-300" /> {r}
                      </button>
                    ))}
                    <button type="button" onMouseDown={() => { localStorage.removeItem(RECENT_SEARCHES_KEY); setRecentSearches([]) }}
                      className="flex w-full items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs text-slate-400 hover:text-slate-600">
                      <X size={11} /> Effacer l'historique
                    </button>
                  </div>
                )}
              </div>
              <button type="submit" disabled={isLoading}
                className="flex h-14 items-center gap-2 rounded-2xl bg-[#124bd2] px-8 text-base font-semibold text-white shadow-sm transition hover:bg-[#0b3fbc] disabled:opacity-60">
                {isLoading ? <RefreshCw size={16} className="animate-spin" /> : 'Rechercher'}
              </button>
            </form>

            {/* Filtres inline + raccourcis */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* Raccourcis géographiques et thématiques */}
              {QUICK_FILTERS.map(f => (
                <button key={f.label} onClick={() => handleQuickFilter(f)}
                  className={`h-8 rounded-full border px-3 text-xs font-medium transition ${
                    (department === f.dept && activityCode === f.code && (inputValue === f.query || f.query === ''))
                      ? 'border-[#124bd2] bg-[#124bd2]/8 text-[#124bd2]'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-[#124bd2]'
                  }`}>
                  {f.label}
                </button>
              ))}

              <div className="mx-1 h-4 w-px bg-slate-200" />

              {/* Bouton Filtres avancés */}
              <button
                type="button"
                onClick={() => setShowFilters(v => !v)}
                className={`flex h-8 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
                  showFilters || activeFiltersCount > 0
                    ? 'border-[#124bd2] bg-[#124bd2]/8 text-[#124bd2]'
                    : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-[#124bd2]'
                }`}
              >
                <SlidersHorizontal size={12} />
                Filtres avancés
                {activeFiltersCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#124bd2] text-[9px] font-bold text-white">
                    {activeFiltersCount}
                  </span>
                )}
                {showFilters
                  ? <ChevronUp size={11} />
                  : <ChevronDown size={11} />
                }
              </button>

              {results.length > 0 && (
                <button onClick={() => exportProspectsCSV(results, query)}
                  className="ml-auto flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2]">
                  <Download size={12} /> CSV
                </button>
              )}
            </div>

            {/* Panneau de recherche avancée */}
            {showFilters && (
              <AdvancedFilters
                // État civil
                firstName={advFirstName}       setFirstName={v => { setAdvFirstName(v); setPage(1) }}
                lastName={advLastName}         setLastName={v => { setAdvLastName(v); setPage(1) }}
                jobTitle={advJobTitle}         setJobTitle={v => { setAdvJobTitle(v); setPage(1) }}
                // Adresse
                city={advCity}                 setCity={v => { setAdvCity(v); setPage(1) }}
                address={advAddress}           setAddress={v => { setAdvAddress(v); setPage(1) }}
                zipCode={zipCode}              setZipCode={v => { setZipCode(v); setPage(1) }}
                department={department}        setDepartment={v => { setDepartment(v); setPage(1) }}
                // Coordonnées
                phone={advPhone}               setPhone={v => { setAdvPhone(v); setPage(1) }}
                email={advEmail}               setEmail={v => { setAdvEmail(v); setPage(1) }}
                // Entreprise
                companyName={advCompanyName}   setCompanyName={v => { setAdvCompanyName(v); setPage(1) }}
                activityCode={activityCode}    setActivityCode={v => { setActivityCode(v); setPage(1) }}
                employeeRange={employeeRange}  setEmployeeRange={v => { setEmployeeRange(v); setPage(1) }}
                legalForm={legalForm}          setLegalForm={v => { setLegalForm(v); setPage(1) }}
                // Réseaux sociaux
                linkedin={advLinkedin}         setLinkedin={v => { setAdvLinkedin(v); setPage(1) }}
                onSearch={() => {
                  const q = [inputValue, advFirstName, advLastName, advJobTitle, advCity, advAddress, advPhone, advEmail, advCompanyName, advLinkedin]
                    .map(s => s.trim()).filter(Boolean).join(' ')
                  setQuery(inputValue)
                  doSearch({ query: q, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
                }}
                onReset={() => {
                  setAdvFirstName(''); setAdvLastName(''); setAdvJobTitle('')
                  setAdvCity(''); setAdvAddress(''); setAdvPhone(''); setAdvEmail('')
                  setAdvCompanyName(''); setAdvLinkedin('')
                  setDepartment(''); setActivityCode(''); setActiveOnly(true)
                  setZipCode(''); setEmployeeRange(''); setLegalForm('')
                  setPage(1)
                  doSearch({ query: inputValue, department: '', activityCode: '', activeOnly: true, zipCode: '', employeeRange: '', legalForm: '' })
                }}
              />
            )}

            {/* Toolbar résultats */}
            <div className="mt-5 mb-3 flex items-center justify-between min-h-[28px]">
              <div>
                {hasSearched && !isLoading && (
                  <p className="text-sm text-slate-500">
                    <span className="font-semibold text-slate-800">{total.toLocaleString('fr-FR')}</span>
                    {' '}résultat{total > 1 ? 's' : ''}
                    {query && <span> pour <em className="text-slate-700">"{query}"</em></span>}
                    {department && <span> · {departmentLabel(department)}</span>}
                  </p>
                )}
              </div>
              {hasSearched && !isLoading && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Consultation journalisée</span>
                  <select value={perPage} onChange={e => { const pp = Number(e.target.value); setPerPage(pp); doSearch({ query, department, activityCode, activeOnly, perPage: pp }, 1) }}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none">
                    {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
                    <button onClick={() => setViewMode('grid')} className={`rounded-md p-1.5 transition ${viewMode === 'grid' ? 'bg-[#124bd2] text-white' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={13} /></button>
                    <button onClick={() => setViewMode('list')} className={`rounded-md p-1.5 transition ${viewMode === 'list' ? 'bg-[#124bd2] text-white' : 'text-slate-400 hover:text-slate-600'}`}><List size={13} /></button>
                  </div>
                </div>
              )}
            </div>

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
                  <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-3/4 rounded bg-slate-100" />
                        <div className="h-2.5 w-1/2 rounded bg-slate-100" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-2.5 w-full rounded bg-slate-100" />
                      <div className="h-2.5 w-2/3 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state — recherche non lancée */}
            {!isLoading && !hasSearched && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#124bd2]">
                  <Search size={28} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Commencez votre prospection</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  Recherchez par nom, poste, entreprise, téléphone ou ville.
                </p>
              </div>
            )}

            {/* Aucun résultat / base non encore importée */}
            {!isLoading && hasSearched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-300">
                  <Database size={28} />
                </div>
                <h3 className="text-lg font-semibold text-slate-700">Aucun prospect trouvé</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  La base de données est en cours d'importation.<br />
                  Elle sera disponible très prochainement.
                </p>
                <button
                  onClick={() => {
                    setInputValue(''); setQuery('')
                    setAdvFirstName(''); setAdvLastName(''); setAdvJobTitle('')
                    setAdvCity(''); setAdvAddress(''); setAdvPhone(''); setAdvEmail('')
                    setAdvCompanyName(''); setAdvLinkedin('')
                    setDepartment(''); setActivityCode(''); setActiveOnly(true)
                    setZipCode(''); setEmployeeRange(''); setLegalForm('')
                    doSearch({ query: '', department: '', activityCode: '', activeOnly: true, zipCode: '', employeeRange: '', legalForm: '' })
                  }}
                  className="mt-6 rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-500 transition hover:border-blue-200 hover:text-[#124bd2]"
                >
                  Réinitialiser les filtres
                </button>
              </div>
            )}

            {/* Résultats */}
            {!isLoading && results.length > 0 && (
              <>
                {viewMode === 'grid' ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {results.map(p => (
                      <ProspectCard key={p.id} prospect={p}
                        isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite}
                        viewMode="grid" onDetail={setSelectedCompany} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.map(p => (
                      <ProspectCard key={p.id} prospect={p}
                        isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite}
                        viewMode="list" onDetail={setSelectedCompany} />
                    ))}
                  </div>
                )}

                {/* Export bas de page */}
                <div className="mt-4 flex justify-end">
                  <button onClick={() => exportProspectsCSV(results, query)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2]">
                    <Download size={13} />
                    Exporter ces {results.length} prospects en CSV
                  </button>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-[#124bd2] disabled:opacity-40">
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                      const pg = i + Math.max(1, Math.min(page - 3, totalPages - 6))
                      return (
                        <button key={pg} onClick={() => handlePageChange(pg)}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-medium transition ${pg === page ? 'border-[#124bd2] bg-[#124bd2] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>
                          {pg}
                        </button>
                      )
                    })}
                    <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-[#124bd2] disabled:opacity-40">
                      <ChevronRight size={16} />
                    </button>
                    <span className="ml-2 hidden text-xs text-slate-400 sm:inline">
                      Page {page}/{totalPages} · {total.toLocaleString('fr-FR')} résultats
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Slide-over détail prospect */}
      {selectedCompany && (
        <ProspectSlideOver prospect={selectedCompany} onClose={() => setSelectedCompany(null)} />
      )}
    </div>
  )
}
