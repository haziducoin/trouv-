import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { motion } from 'framer-motion'
import DemoLockModal from '@/components/demo/DemoLockModal'
import DemoToast from '@/components/demo/DemoToast'
import DemoCreditsBar from '@/components/demo/DemoCreditsBar'
import { getDemoCredits, consumePhoneCredit, consumeEmailCredit, type DemoCredits } from '@/lib/demoStore'
import {
  Search, SlidersHorizontal, Star, ChevronLeft, ChevronRight,
  Building2, MapPin, Hash, Users, LogOut, X,
  Zap, RefreshCw, ExternalLink, LayoutGrid, List,
  ShieldCheck, AlertCircle, Download, Clock,
  ArrowRight, Globe, FileText, Info,
  Moon, Sun, History, ChevronUp, ChevronDown,
  UserCircle2, LayoutDashboard, UserPlus, FolderSearch, MessageSquare, CreditCard,
  Phone, Mail, Database, Calendar, Briefcase, Plus, Lock, Menu, Key, Bell, Link2, Trash2,
  CheckCircle2, Pencil,
} from 'lucide-react'
type AppView = 'search' | 'history' | 'lists' | 'list-detail' | 'admin' | 'bulk'
import trouveLogo from '@/assets/trouve-logo.png'
import { KeyIcon } from '@/components/ui/KeyIcon'
import { DEPARTMENTS, TYPE_LABELS, EMPLOYEE_RANGES, LEGAL_FORMS } from '@/lib/searchApi'
import {
  searchProspects, exportProspectsCSV, formatPhone,
  unlockContactField, getCreditBalance, UnlockError,
  enrichContactPreview, type EnrichBeforeUnlockResult,
  type ProspectResult, type ProspectSearchParams, type CreditBalance,
} from '@/lib/prospectApi'
import { generateSearchDemoResults } from '@/lib/demoResults'
import { formatBirthContext } from '@/lib/privacy'
import { recordSearch, saveFavorite, createDemoRequest, type Account, type DemoRequest } from '@/lib/accountStore'
import { getSupabaseClient } from '@/lib/supabase'
import HistoryPage from './HistoryPage'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { LogoutDialog } from '@/components/ui/logout-dialog'
import { ListColorPicker, ListColorDot, isListColor } from '@/components/ui/list-color-picker'
import { NotificationPopover, type Notification as AdminNotification } from '@/components/ui/notification-popover'
import keyBlueImg   from '@/assets/key-blue.png'
import lockBlueImg      from '@/assets/lock-blue.png'
import lockGreenImg     from '@/assets/lock-green.png'
import lockOpenGreenImg from '@/assets/lock-open-green.png'
import lockOpenBlueImg  from '@/assets/lock-open-blue.png'
import { AnimateNumber } from '@/components/ui/animated-blur-number'
import { BuyKeysModal } from '@/components/ui/buy-keys-modal'
import BulkSearchView from '@/pages/BulkSearchView'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'

// ─── Props ────────────────────────────────────────────────────────────────────
export type AccessLevel = 'full' | 'demo' | 'trial' | 'limited'

interface SearchPageProps {
  account:        Account
  onLogout:       () => void
  onOpenAccount:  (tab?: string) => void
  accessLevel?:   AccessLevel
  maxSearches?:   number
  onReturnAdmin?: () => void
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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1.5 text-xs font-medium text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300">
      {label}
      <button type="button" onClick={onRemove} className="flex h-4 w-4 items-center justify-center rounded-full text-blue-400 transition hover:bg-blue-200 hover:text-blue-700 dark:text-blue-500 dark:hover:bg-blue-900 dark:hover:text-blue-300">
        <X size={9} />
      </button>
    </span>
  )
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

// ─── Listes de prospects ─────────────────────────────────────────────────────
const LISTS_STORE_KEY = 'trouve_lists_v1'

interface ListContact {
  id:          string
  name:        string
  jobTitle:    string
  companyName: string
  city:        string
  phone:       string
  email:       string
  savedAt:     string
}

interface ProspectList {
  id:        string
  name:      string
  emoji:     string
  contacts:  ListContact[]
  createdAt: string
  updatedAt: string
}

function loadLists(): ProspectList[] {
  try { return JSON.parse(localStorage.getItem(LISTS_STORE_KEY) ?? '[]') } catch { return [] }
}
function saveLists(lists: ProspectList[]) {
  localStorage.setItem(LISTS_STORE_KEY, JSON.stringify(lists))
}
function createList(name: string, emoji: string): ProspectList {
  const list: ProspectList = { id: Date.now().toString(), name, emoji, contacts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  saveLists([...loadLists(), list])
  return list
}
function addToList(listId: string, p: ProspectResult) {
  const lists = loadLists()
  const idx = lists.findIndex(l => l.id === listId)
  if (idx === -1) return
  if (lists[idx].contacts.some(c => c.id === p.id)) return
  lists[idx].contacts.push({ id: p.id, name: p.fullName, jobTitle: p.jobTitle ?? '', companyName: p.companyName ?? '', city: p.city ?? '', phone: p.phone ?? p.phoneMobile ?? '', email: p.email ?? '', savedAt: new Date().toISOString() })
  lists[idx].updatedAt = new Date().toISOString()
  saveLists(lists)
}
function removeFromList(listId: string, contactId: string) {
  const lists = loadLists()
  const idx = lists.findIndex(l => l.id === listId)
  if (idx === -1) return
  lists[idx].contacts = lists[idx].contacts.filter(c => c.id !== contactId)
  lists[idx].updatedAt = new Date().toISOString()
  saveLists(lists)
}
function deleteList(listId: string) {
  saveLists(loadLists().filter(l => l.id !== listId))
}
function exportListCSV(list: ProspectList) {
  const rows = ['Nom;Poste;Entreprise;Ville;Téléphone;Email;Ajouté le',
    ...list.contacts.map(c => `"${c.name}";"${c.jobTitle}";"${c.companyName}";"${c.city}";"${c.phone}";"${c.email}";${new Date(c.savedAt).toLocaleDateString('fr-FR')}`)
  ].join('\n')
  const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `${list.name}.csv`; a.click(); URL.revokeObjectURL(url)
}

// Compat: ancienne clé favoris simple (non utilisée, gardée pour migration future)
const FAV_STORE_KEY = 'trouve_fav_data_v2'
interface FavStored { id: string; name: string; jobTitle: string; companyName: string; city: string; savedAt: string }
function loadStoredFavs(): FavStored[] { try { return JSON.parse(localStorage.getItem(FAV_STORE_KEY) ?? '[]') } catch { return [] } }
function saveStoredFav(_p: ProspectResult) { /* replaced by lists system */ }
function removeStoredFav(_id: string) { /* replaced by lists system */ }

// ─── Composant QuotaBar (inline, non utilisé seul mais gardé pour référence) ──
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
      <span className={`text-xs font-medium ${isEmpty ? 'text-red-500' : isLow ? 'text-amber-600' : 'text-slate-500'}`}>
        <AnimateNumber value={used} duration={350} className="text-xs font-medium" />
        &thinsp;/&thinsp;{total.toLocaleString('fr-FR')}
      </span>
    </div>
  )
}

// ─── BlurPill — contenu masqué (mode limité) ─────────────────────────────────
function BlurPill({ w = 'w-24', h = 'h-3' }: { w?: string; h?: string }) {
  return (
    <span className={`inline-block ${w} ${h} rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse`} />
  )
}

// ─── DemoBanner — bandeau d'accès restreint ───────────────────────────────────
function DemoBanner({
  accessLevel, used, max, onCta,
}: {
  accessLevel: AccessLevel; used: number; max: number; onCta: () => void
}) {
  const remaining = Math.max(0, max - used)
  if (accessLevel === 'demo') {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#124bd2] text-white text-xs">
          <Search size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#124bd2] dark:text-blue-300">Mode aperçu</p>
          <p className="text-xs text-blue-600/70 dark:text-blue-400/70">
            Téléphone et email masqués · {remaining > 0 ? `${remaining} recherche${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}` : 'Limite atteinte'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex h-1.5 w-20 overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
            <div className="h-full rounded-full bg-[#124bd2] transition-all" style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
          </div>
          <span className="text-xs font-bold tabular-nums text-[#124bd2] dark:text-blue-300">{used}/{max}</span>
          <button onClick={onCta}
            className="ml-1 flex items-center gap-1.5 rounded-xl bg-[#124bd2] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0b3fbc]">
            Accès complet <ArrowRight size={11} />
          </button>
        </div>
      </div>
    )
  }
  // trial = démo validée, vraies données
  if (accessLevel === 'trial') {
    return (
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs">
          <Zap size={13} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Démo validée — données réelles</p>
          <p className="text-xs text-emerald-600/80 dark:text-emerald-400/70">
            {remaining > 0 ? `${remaining} recherche${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}` : 'Limite atteinte — abonnez-vous pour continuer'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex h-1.5 w-20 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900">
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
          </div>
          <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{used}/{max}</span>
          <button onClick={onCta}
            className="ml-1 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700">
            S'abonner <ArrowRight size={11} />
          </button>
        </div>
      </div>
    )
  }
  // limited (fallback)
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white text-xs">
        <Lock size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Accès en attente de validation</p>
        <p className="text-xs text-amber-600/80 dark:text-amber-400/70">
          {remaining > 0 ? `${remaining} recherche${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}` : 'Limite atteinte'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="hidden sm:flex h-1.5 w-20 overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(100, (used / max) * 100)}%` }} />
        </div>
        <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300">{used}/{max}</span>
      </div>
    </div>
  )
}

// ─── DemoRequestModal — formulaire de demande de démo ────────────────────────
function DemoRequestModal({
  account, onClose,
}: {
  account: Account
  onClose: () => void
}) {
  const [message, setMessage]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await createDemoRequest(account, message.trim() || undefined)
      setDone(true)
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la soumission.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Demande envoyée !</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Notre équipe examine votre demande et vous répondra sous <strong className="text-slate-700 dark:text-slate-300">24–48h</strong> à <strong className="text-slate-700 dark:text-slate-300">{account.email}</strong>.
            </p>
            <button onClick={onClose}
              className="mt-6 w-full rounded-xl bg-[#124bd2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]">
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Demander une démo</h2>
                <p className="mt-1 text-sm text-slate-500">10 vraies recherches non floues</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="mb-5 rounded-2xl bg-blue-50 dark:bg-blue-950 p-4 text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold">Ce que vous obtenez :</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>✓ 10 recherches avec coordonnées <strong>complètes et réelles</strong></li>
                <li>✓ Téléphone, email, adresse en clair</li>
                <li>✓ Accès validé par notre équipe sous 24–48h</li>
              </ul>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Message (optionnel) — dites-nous votre cas d'usage
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Ex : Je suis agent immobilier et je cherche à contacter des propriétaires dans le 75..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 resize-none"
                />
              </div>
              {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#124bd2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b3fbc] disabled:opacity-60">
                {loading ? 'Envoi...' : <><Zap size={15} /> Envoyer ma demande</>}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ─── ConversionModal — appel à l'action après épuisement ─────────────────────
function ConversionModal({
  accessLevel, account, onClose, onLogout, onRequestDemo,
}: {
  accessLevel:    AccessLevel
  account:        Account
  onClose:        () => void
  onLogout:       () => void
  onRequestDemo?: () => void
}) {
  // demo = 5 floues épuisées → proposer démo ou pricing
  if (accessLevel === 'demo') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#124bd2]">
            <Zap size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vos 5 aperçus sont terminés</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Vous avez vu des résultats partiels. Pour accéder aux coordonnées complètes, choisissez une option :
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={onRequestDemo}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#124bd2] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]">
              <Zap size={15} /> Demander une démo gratuite <span className="ml-1 rounded-full bg-white/20 px-2 py-0.5 text-xs">10 vraies recherches</span>
            </button>
            <button
              onClick={() => window.location.replace('/?pricing=1')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#124bd2] px-4 py-3 text-sm font-semibold text-[#124bd2] transition hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400">
              <ArrowRight size={15} /> Voir les offres
            </button>
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-slate-600 py-1">
              Continuer à explorer (résultats floutés)
            </button>
          </div>
        </div>
      </div>
    )
  }

  // trial = 10 vraies recherches épuisées → pricing obligatoire
  if (accessLevel === 'trial') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
            <Lock size={28} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Vos 10 recherches de démo sont terminées</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Vous avez utilisé toutes vos recherches de démo. Passez à un abonnement pour continuer à accéder aux contacts professionnels.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => window.location.replace('/?pricing=1')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#124bd2] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]">
              <Zap size={15} /> Voir les offres et s'abonner
            </button>
            <LogoutDialog onConfirm={onLogout}>
              <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
                <LogOut size={14} /> Se déconnecter
              </button>
            </LogoutDialog>
          </div>
        </div>
      </div>
    )
  }

  // limited (fallback)
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl dark:border-slate-700 dark:bg-slate-900 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
          <Lock size={28} />
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Limite atteinte</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Votre accès d'essai est épuisé. Contactez-nous pour continuer.
        </p>
        <LogoutDialog onConfirm={onLogout}>
          <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
            <LogOut size={14} /> Se déconnecter
          </button>
        </LogoutDialog>
      </div>
    </div>
  )
}

// ─── Aide à la prospection — données ─────────────────────────────────────────
interface ProspectionRecipe { label: string; query: string; department?: string; activityCode?: string }
interface ProspectionSector { id: string; emoji: string; label: string; description: string; recipes: ProspectionRecipe[] }

const PROSPECTION_SECTORS: ProspectionSector[] = [
  {
    id: 'immobilier', emoji: '🏠', label: 'Immobilier', description: 'Agents, négociateurs, directeurs d\'agence',
    recipes: [
      { label: 'Agents immo – Paris', query: 'agent immobilier', department: '75' },
      { label: 'Directeurs d\'agence', query: 'directeur agence immobilière' },
      { label: 'Négociateurs immo', query: 'négociateur immobilier' },
      { label: 'Promoteurs immobiliers', query: 'promoteur immobilier', activityCode: '6810Z' },
    ],
  },
  {
    id: 'btp', emoji: '🏗', label: 'BTP / Construction', description: 'Conducteurs de travaux, chefs de chantier, architectes',
    recipes: [
      { label: 'Conducteurs de travaux', query: 'conducteur de travaux' },
      { label: 'Chefs de chantier', query: 'chef de chantier' },
      { label: 'Architectes', query: 'architecte', activityCode: '7111Z' },
      { label: 'Maîtres d\'œuvre', query: 'maître d\'oeuvre' },
    ],
  },
  {
    id: 'finance', emoji: '💼', label: 'Finance / Assurance', description: 'Conseillers, courtiers, directeurs financiers',
    recipes: [
      { label: 'Courtiers assurance', query: 'courtier assurance' },
      { label: 'Conseillers financiers', query: 'conseiller financier' },
      { label: 'Directeurs financiers', query: 'directeur financier' },
      { label: 'Gestionnaires de patrimoine', query: 'gestionnaire de patrimoine' },
    ],
  },
  {
    id: 'sante', emoji: '🏥', label: 'Santé / Médical', description: 'Directeurs de clinique, médecins, cadres de santé',
    recipes: [
      { label: 'Directeurs de clinique', query: 'directeur clinique' },
      { label: 'Médecins généralistes', query: 'médecin généraliste', activityCode: '8621Z' },
      { label: 'Directeurs EHPAD', query: 'directeur EHPAD' },
      { label: 'Cadres de santé', query: 'cadre de santé' },
    ],
  },
  {
    id: 'commerce', emoji: '🛒', label: 'Commerce / Vente', description: 'Directeurs commerciaux, responsables ventes, KAM',
    recipes: [
      { label: 'Directeurs commerciaux', query: 'directeur commercial' },
      { label: 'Responsables vente', query: 'responsable vente' },
      { label: 'Key Account Managers', query: 'key account manager' },
      { label: 'Responsables grands comptes', query: 'responsable grands comptes' },
    ],
  },
  {
    id: 'industrie', emoji: '🏭', label: 'Industrie / Manufacture', description: 'Directeurs d\'usine, responsables achats, ingénieurs',
    recipes: [
      { label: 'Directeurs d\'usine', query: 'directeur usine' },
      { label: 'Responsables achats', query: 'responsable achats' },
      { label: 'Ingénieurs de production', query: 'ingénieur production' },
      { label: 'Directeurs Supply Chain', query: 'directeur supply chain' },
    ],
  },
]

const PROSPECTION_TIPS = [
  {
    title: 'Trop de résultats ?',
    color: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20',
    dot: 'bg-amber-400',
    tips: [
      'Ajoutez un département dans les filtres avancés (ex : 75 pour Paris)',
      'Précisez la taille d\'entreprise : 10–50 salariés cible les PME',
      'Ajoutez un code NAF pour rester dans un secteur précis',
    ],
  },
  {
    title: 'Pas assez de résultats ?',
    color: 'border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20',
    dot: 'bg-[#124bd2]',
    tips: [
      'Essayez des synonymes : "agent" → "négociateur" → "conseiller"',
      'Retirez le filtre département pour couvrir toute la France',
      'Supprimez le code NAF pour voir tous les secteurs proches',
    ],
  },
  {
    title: 'Améliorer la qualité des leads',
    color: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20',
    dot: 'bg-emerald-500',
    tips: [
      'Combinez poste + code NAF + département pour des listes ultra-ciblées',
      'Le filtre "actifs uniquement" exclut les sociétés fermées',
      'Enregistrez vos meilleures recherches dans une liste pour y revenir',
    ],
  },
]

// ─── ProspectionPanel — slide-over aide à la prospection ─────────────────────
function ProspectionPanel({
  onClose, onApply,
}: {
  onClose: () => void
  onApply: (recipe: ProspectionRecipe) => void
}) {
  const [activeSector, setActiveSector] = useState<string | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const sector = PROSPECTION_SECTORS.find(s => s.id === activeSector)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl dark:bg-slate-900" style={{ animation: 'slideInRight 0.2s ease' }}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6 dark:border-slate-800">
          <div>
            <h2 className="font-bold text-slate-800 dark:text-slate-100">Aide à la prospection</h2>
            <p className="mt-0.5 text-xs text-slate-400">Critères suggérés · Conseils pour affiner vos résultats</p>
          </div>
          <button onClick={onClose}
            className="rounded-xl p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">

          {/* ── Secteurs ── */}
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Recherches par secteur</p>
            <div className="grid grid-cols-2 gap-2">
              {PROSPECTION_SECTORS.map(s => (
                <button key={s.id}
                  onClick={() => setActiveSector(activeSector === s.id ? null : s.id)}
                  className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition ${
                    activeSector === s.id
                      ? 'border-[#124bd2] bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="text-xl leading-none">{s.emoji}</span>
                  <span className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200">{s.label}</span>
                  <span className="text-[10px] leading-relaxed text-slate-400">{s.description}</span>
                </button>
              ))}
            </div>

            {/* Recettes du secteur sélectionné */}
            {sector && (
              <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400">
                  {sector.emoji} Recherches suggérées — {sector.label}
                </p>
                <div className="space-y-2">
                  {sector.recipes.map((recipe, i) => (
                    <div key={i}
                      className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm dark:bg-slate-800">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{recipe.label}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            <Search size={9} /> {recipe.query}
                          </span>
                          {recipe.department && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              <MapPin size={9} /> Dép. {recipe.department}
                            </span>
                          )}
                          {recipe.activityCode && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              <Hash size={9} /> {recipe.activityCode}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => onApply(recipe)}
                        className="flex shrink-0 items-center gap-1 rounded-xl bg-[#124bd2] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#0b3fbc]">
                        Lancer <ArrowRight size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* ── Conseils ── */}
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Conseils pour affiner vos résultats</p>
            <div className="space-y-3">
              {PROSPECTION_TIPS.map((group, i) => (
                <div key={i} className={`rounded-2xl border p-4 ${group.color}`}>
                  <p className="mb-2 text-xs font-bold text-slate-700 dark:text-slate-200">{group.title}</p>
                  <ul className="space-y-1.5">
                    {group.tips.map((tip, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${group.dot}`} />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Prospect Detail Slide-Over ────────────────────────────────────────────────
function ProspectSlideOver({ prospect, onClose, canUnlock = false, onUnlock, onAddressUpdate }: { prospect: ProspectResult; onClose: () => void; canUnlock?: boolean; onUnlock?: (p: ProspectResult, field: 'phone' | 'email') => Promise<void>; onAddressUpdate?: (ids: string[], adresse: string, codePostal: string, ville: string) => Promise<void> }) {
  const noopUnlock = async () => {}
  const birthContext = formatBirthContext(prospect.birthYear, prospect.birthCity)
  const [enrichData, setEnrichData]       = useState<EnrichBeforeUnlockResult | null>(null)
  const [enrichLoading, setEnrichLoading] = useState(true)
  const [fromCache, setFromCache]         = useState(false)
  const [mobileBusy, setMobileBusy] = useState(false)
  const [editingAddress, setEditingAddress] = useState(false)
  const [addressSaving, setAddressSaving]   = useState(false)
  const [addressError, setAddressError]     = useState<string | null>(null)

  const currentAddressStr = prospect.allAddresses?.[0]
    ? [prospect.allAddresses[0].rue, [prospect.allAddresses[0].cp, prospect.allAddresses[0].ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : [prospect.address, [prospect.zipCode, prospect.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  const handleAddressSelect = async (result: import('@/components/ui/address-autocomplete').AddressResult) => {
    if (!onAddressUpdate) return
    setAddressSaving(true)
    setAddressError(null)
    try {
      const ids = prospect.allIds ?? [prospect.id]
      await onAddressUpdate(ids, result.adresse, result.codePostal, result.ville)
      setEditingAddress(false)
    } catch {
      setAddressError('Erreur lors de la sauvegarde')
    } finally {
      setAddressSaving(false)
    }
  }
  const clickMobileUnlock = async () => {
    setMobileBusy(true)
    try { await (onUnlock ?? noopUnlock)(prospect, 'phone') } finally { setMobileBusy(false) }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const runEnrich = (force = false) => {
    setEnrichLoading(true)
    if (force) setEnrichData(null)
    enrichContactPreview(prospect.id, force)
      .then(d => { setEnrichData(d); setFromCache(!!(d as any).from_cache) })
      .catch(() => {})
      .finally(() => setEnrichLoading(false))
  }

  useEffect(() => {
    runEnrich(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospect.id])

  const hasAiData = enrichData && (
    enrichData.safe_enrichments.company || enrichData.safe_enrichments.job_title ||
    enrichData.safe_enrichments.industry || enrichData.safe_enrichments.professional_location ||
    enrichData.safe_enrichments.public_profile_url
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-md max-h-[92vh] flex-col overflow-hidden bg-white sm:rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">

        {/* Header gradient */}
        <div className="relative shrink-0 bg-gradient-to-br from-[#0f3fc7] via-[#1B54FF] to-[#3a7aff] px-6 pt-6 pb-5">
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white/80 transition hover:bg-white/25"
          >
            <X size={14} />
          </button>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-white/30 bg-white/20 text-base font-semibold text-white shadow-inner">
              {prospectInitials(prospect.fullName)}
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold text-white leading-snug tracking-tight truncate">{prospect.fullName}</h2>
              {prospect.jobTitle && <p className="mt-0.5 text-[13px] text-white/65 truncate">{prospect.jobTitle}</p>}
              {prospect.companyName && (
                <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-white/80 truncate">
                  <Building2 size={11} /> {prospect.companyName}
                </p>
              )}
              {!prospect.jobTitle && !prospect.companyName && prospect.city && (
                <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] text-white/80">
                  <MapPin size={10} /> {prospect.city}{prospect.zipCode ? ` (${prospect.zipCode})` : ''}
                </span>
              )}
            </div>
          </div>
          {prospect.mergedCount && prospect.mergedCount > 1 && (
            <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] text-white/70 w-fit">
              <Database size={10} /> {prospect.mergedCount} fiches fusionnées
            </div>
          )}
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0 divide-y divide-gray-100">

            {/* Coordonnées */}
            <section className="px-5 py-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Coordonnées</p>
              <div className="flex flex-col gap-2">
                <PremiumContactRow prospect={prospect} kind="phone" canUnlock={canUnlock} onUnlock={onUnlock ?? noopUnlock} />
                {prospect.phoneUnlocked
                  ? prospect.mobiles?.slice(1).map((m, i) => (
                      <PremiumContactRowStatic key={i} kind="phone" value={formatPhone(m) ?? m} unlocked />
                    ))
                  : prospect.mobilesLocked?.map((m, i) => (
                      <PremiumContactRowStatic key={i} kind="phone" value={m} unlocked={false} />
                    ))
                }
                <PremiumContactRow prospect={prospect} kind="email" canUnlock={canUnlock} onUnlock={onUnlock ?? noopUnlock} />
                {prospect.emailUnlocked
                  ? prospect.allEmails?.slice(1).filter(e => e.includes('@')).map((e, i) => (
                      <PremiumContactRowStatic key={i} kind="email" value={e} unlocked />
                    ))
                  : prospect.emailsLocked?.map((e, i) => (
                      <PremiumContactRowStatic key={i} kind="email" value={e} unlocked={false} />
                    ))
                }
                {!prospect.hasPhone && !prospect.hasEmail && (
                  <p className="py-2 text-xs text-gray-300">Aucune coordonnée disponible</p>
                )}
              </div>
            </section>

            {/* Localisation */}
            {(prospect.address || prospect.city || prospect.country || birthContext || (prospect.allAddresses && prospect.allAddresses.length > 0)) && (
              <section className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Localisation</p>
                  {onAddressUpdate && !editingAddress && (
                    <button onClick={() => { setEditingAddress(true); setAddressError(null) }}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:bg-gray-50 hover:text-[#124bd2] transition-colors">
                      <Pencil size={10} /> Modifier
                    </button>
                  )}
                  {editingAddress && (
                    <button onClick={() => setEditingAddress(false)}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors">
                      <X size={10} /> Annuler
                    </button>
                  )}
                </div>
                {editingAddress && (
                  <div className="mb-3">
                    <AddressAutocomplete
                      value={currentAddressStr}
                      onSelect={handleAddressSelect}
                      placeholder="34 Boulevard Victor Hugo, Neuilly-sur-Seine"
                    />
                    {addressSaving && <p className="mt-1 text-[10px] text-gray-400">Sauvegarde…</p>}
                    {addressError && <p className="mt-1 text-[10px] text-red-500">{addressError}</p>}
                  </div>
                )}
                <div className="flex flex-col gap-2.5">
                  {prospect.allAddresses && prospect.allAddresses.length > 0
                    ? prospect.allAddresses.map((addr, i) => (
                        <Fragment key={i}>
                          {addr.rue && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2.5 shrink-0">
                                <MapPin size={14} className="text-gray-300 shrink-0" />
                                <span className="text-xs text-gray-400">{i === 0 ? 'Adresse' : 'Autre'}</span>
                              </div>
                              <span className="text-xs text-gray-700 font-medium text-right">{addr.rue}</span>
                            </div>
                          )}
                          {(addr.cp || addr.ville) && (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2.5 shrink-0">
                                <MapPin size={14} className="text-gray-300 shrink-0" />
                                <span className="text-xs text-gray-400">Commune</span>
                              </div>
                              <span className="text-xs text-gray-700 font-medium text-right">
                                {addr.ville}{addr.cp ? ` (${addr.cp})` : ''}
                              </span>
                            </div>
                          )}
                        </Fragment>
                      ))
                    : <>
                        {prospect.address && (
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2.5 shrink-0">
                              <MapPin size={14} className="text-gray-300 shrink-0" />
                              <span className="text-xs text-gray-400">Adresse</span>
                            </div>
                            <span className="text-xs text-gray-700 font-medium text-right">{prospect.address}</span>
                          </div>
                        )}
                        {prospect.city && (
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2.5 shrink-0">
                              <MapPin size={14} className="text-gray-300 shrink-0" />
                              <span className="text-xs text-gray-400">Commune</span>
                            </div>
                            <span className="text-xs text-gray-700 font-medium text-right">{prospect.city}{prospect.zipCode ? ` (${prospect.zipCode})` : ''}</span>
                          </div>
                        )}
                      </>
                  }
                  {prospect.country && (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <MapPin size={14} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">Pays</span>
                      </div>
                      <span className="text-xs text-gray-700 font-medium">{prospect.country}</span>
                    </div>
                  )}
                  {birthContext && (
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5 shrink-0">
                        <UserCircle2 size={14} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">Homonymie</span>
                      </div>
                      <span className="text-xs text-gray-700 font-medium">{birthContext}</span>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Analyse IA */}
            <section className="px-5 py-4 pb-6">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Analyse IA</p>
                <span className="flex items-center gap-1 rounded-full bg-[#1B54FF]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1B54FF]">
                  <Zap size={9} /> Groq
                </span>
                {fromCache && !enrichLoading && (
                  <span className="text-[10px] text-gray-300">(cache)</span>
                )}
                <button
                  onClick={() => runEnrich(true)}
                  disabled={enrichLoading}
                  title="Relancer une analyse fraîche"
                  className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-gray-400 transition hover:text-[#1B54FF] hover:bg-[#1B54FF]/5 disabled:opacity-40"
                >
                  <RefreshCw size={11} className={enrichLoading ? 'animate-spin' : ''} />
                  {!enrichLoading && 'Rafraîchir'}
                </button>
              </div>

              {enrichLoading ? (
                <div className="flex items-center gap-3 rounded-xl border border-[#1B54FF]/15 bg-[#1B54FF]/5 px-4 py-3.5">
                  <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#1B54FF]/20">
                    <span className="absolute h-5 w-5 animate-spin rounded-full border-2 border-[#1B54FF]/20 border-t-[#1B54FF]" />
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-[#1B54FF]">Recherche en cours…</p>
                    <p className="mt-0.5 text-[11px] text-[#1B54FF]/50">LinkedIn, Pages Jaunes Pro, Kompass…</p>
                  </div>
                </div>
              ) : hasAiData ? (
                <div className="rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
                  {enrichData!.safe_enrichments.company && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <Building2 size={13} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">Entreprise</span>
                      </div>
                      <span className="text-xs text-gray-700 font-medium text-right">{enrichData!.safe_enrichments.company}</span>
                    </div>
                  )}
                  {enrichData!.safe_enrichments.job_title && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <Briefcase size={13} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">Poste</span>
                      </div>
                      <span className="text-xs text-gray-700 font-medium text-right">{enrichData!.safe_enrichments.job_title}</span>
                    </div>
                  )}
                  {enrichData!.safe_enrichments.industry && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <Hash size={13} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">Secteur</span>
                      </div>
                      <span className="text-xs text-gray-700 font-medium text-right">{enrichData!.safe_enrichments.industry}</span>
                    </div>
                  )}
                  {enrichData!.safe_enrichments.professional_location && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <MapPin size={13} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">Zone pro</span>
                      </div>
                      <span className="text-xs text-gray-700 font-medium text-right">{enrichData!.safe_enrichments.professional_location}</span>
                    </div>
                  )}
                  {enrichData!.safe_enrichments.public_profile_url && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <Link2 size={13} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400">LinkedIn</span>
                      </div>
                      <a href={enrichData!.safe_enrichments.public_profile_url} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-[#1B54FF] font-medium truncate max-w-[160px] hover:underline">
                        Voir le profil
                      </a>
                    </div>
                  )}
                  {enrichData!.user_facing_message && (
                    <p className="px-4 py-2.5 text-[11px] leading-relaxed text-gray-400 italic border-t border-gray-100">
                      {enrichData!.user_facing_message}
                    </p>
                  )}
                </div>
              ) : enrichData ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3.5">
                  <Search size={14} className="text-gray-300 shrink-0" />
                  <p className="text-xs text-gray-400">Aucune donnée professionnelle trouvée.</p>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3.5">
                  <Zap size={14} className="text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-600">Analyse IA indisponible.</p>
                </div>
              )}
            </section>
          </div>
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

// Pill statique (même style que ContactUnlock) — sans bouton Débloquer
// Utilisé pour les coordonnées supplémentaires des fiches fusionnées
function ContactPill({ value, unlocked, kind }: { value: string; unlocked: boolean; kind: 'phone' | 'email' }) {
  const isPhone = kind === 'phone'
  const Icon = isPhone ? Phone : Mail
  const ringClass = isPhone ? 'bg-[#124bd2]/10 ring-[#124bd2]/20' : 'bg-emerald-500/10 ring-emerald-500/20'
  const textClass = isPhone ? 'text-[#124bd2]' : 'text-emerald-700'
  const iconClass = isPhone ? 'text-[#124bd2]' : 'text-emerald-600'

  if (unlocked) {
    const href = isPhone ? `tel:${value.replace(/\s/g, '')}` : `mailto:${value}`
    return (
      <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs ring-1 ${ringClass}`}>
        <Icon size={14} className={iconClass} />
        <a href={href} onClick={e => e.stopPropagation()}
          className={`font-semibold tabular-nums animate-value-reveal truncate ${textClass}`}>
          {value}
        </a>
        <span className="ml-1 inline-flex items-center rounded-lg px-2.5 py-1">
          <img src={isPhone ? lockOpenBlueImg : lockOpenGreenImg}
            style={{ height: '34px', width: '26px', objectFit: 'contain', mixBlendMode: 'multiply' }} alt="" />
        </span>
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs ring-1 ${ringClass}`}>
      <Icon size={14} className={iconClass} />
      <span className={`font-semibold tabular-nums ${textClass}`}>{value}</span>
      <span className="ml-1 inline-flex items-center rounded-lg px-2.5 py-1">
        <img src={isPhone ? lockBlueImg : lockGreenImg}
          style={{ height: '34px', width: '26px', objectFit: 'contain', mixBlendMode: 'multiply' }} alt="" />
      </span>
    </span>
  )
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

function ContactChip({
  icon,
  value,
  href,
  locked = false,
  muted = false,
  onClick,
}: {
  icon: React.ReactNode
  value: string
  href?: string
  locked?: boolean
  muted?: boolean
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}) {
  const className = `inline-flex max-w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ring-1 transition ${
    muted
      ? 'bg-slate-50 text-slate-400 ring-slate-100 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700'
      : 'bg-blue-50 text-[#124bd2] ring-blue-100/80 hover:bg-blue-100 dark:bg-blue-950/35 dark:text-blue-300 dark:ring-blue-900/60'
  }`
  const content = (
    <>
      <span className={muted ? 'text-slate-300 dark:text-slate-600' : 'text-[#124bd2] dark:text-blue-300'}>
        {icon}
      </span>
      <span className="truncate">{value}</span>
      {locked && <Lock size={10} className="shrink-0 text-slate-300 dark:text-slate-600" />}
    </>
  )

  if (href && !locked) {
    return (
      <a href={href} onClick={onClick} className={className}>
        {content}
      </a>
    )
  }

  return <span className={className}>{content}</span>
}

// ─── Composant ProspectCard ────────────────────────────────────────────────────
// ─── Champ de contact : masqué + bouton Débloquer, ou valeur complète ───────
function ContactUnlock({ prospect, kind, canUnlock, onUnlock }: {
  prospect:  ProspectResult
  kind:      'phone' | 'email'
  canUnlock: boolean
  onUnlock:  (p: ProspectResult, field: 'phone' | 'email') => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const isPhone  = kind === 'phone'
  const has      = isPhone ? prospect.hasPhone : prospect.hasEmail
  const unlocked = isPhone ? prospect.phoneUnlocked : prospect.emailUnlocked
  const value    = isPhone ? prospect.phone : prospect.email
  const Icon     = isPhone ? Phone : Mail
  if (!has) return null

  if (unlocked && value) {
    const href = isPhone ? `tel:${value.replace(/\s/g, '')}` : `mailto:${value}`
    return (
      <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs ring-1 ${isPhone ? 'bg-[#124bd2]/10 ring-[#124bd2]/20' : 'bg-emerald-500/10 ring-emerald-500/20'}`}>
        <Icon size={14} className={isPhone ? 'text-[#124bd2]' : 'text-emerald-600'} />
        <a href={href} onClick={e => e.stopPropagation()}
          className={`font-semibold tabular-nums animate-value-reveal truncate ${isPhone ? 'text-[#124bd2]' : 'text-emerald-700'}`}>
          {value}
        </a>
        <span className="ml-1 inline-flex items-center rounded-lg px-2.5 py-1">
          <img
            src={isPhone ? lockOpenBlueImg : lockOpenGreenImg}
            style={{ height: '34px', width: '26px', objectFit: 'contain', mixBlendMode: 'multiply' }}
            alt=""
          />
        </span>
      </span>
    )
  }

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onUnlock(prospect, kind) } finally { setBusy(false) }
  }

  return (
    <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs ring-1 ${isPhone ? 'bg-[#124bd2]/10 ring-[#124bd2]/20' : 'bg-emerald-500/10 ring-emerald-500/20'}`}>
      <Icon size={14} className={isPhone ? 'text-[#124bd2]' : 'text-emerald-600'} />
      <span className={`font-semibold tabular-nums ${isPhone ? 'text-[#124bd2]' : 'text-emerald-700'}`}>{value}</span>
      <button type="button" onClick={click} disabled={busy}
        className={`ml-1 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${isPhone ? 'bg-[#124bd2]/20 hover:bg-[#124bd2]/30 text-[#124bd2]' : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700'}`}>
        {busy
          ? <span className={`h-3 w-3 animate-spin rounded-full border-2 border-t-transparent ${isPhone ? 'border-[#124bd2]' : 'border-emerald-600'}`} />
          : <img src={isPhone ? lockBlueImg : lockGreenImg} style={{ height: '34px', width: '26px', objectFit: 'contain', mixBlendMode: 'multiply' }} alt="" />}
        {canUnlock ? 'Débloquer' : 'Voir les offres'}
      </button>
    </span>
  )
}

// ─── Lignes de contact premium (fiche slide-over) ────────────────────────────
function PremiumContactRowStatic({ kind, value, unlocked }: {
  kind: 'phone' | 'email'; value: string; unlocked: boolean
}) {
  const isPhone = kind === 'phone'
  const Icon = isPhone ? Phone : Mail
  const iconBg   = isPhone ? 'bg-[#1B54FF]/10' : 'bg-emerald-500/10'
  const iconColor = isPhone ? 'text-[#1B54FF]' : 'text-emerald-600'
  const textColor = isPhone ? 'text-[#1B54FF]' : 'text-emerald-700'

  if (unlocked) {
    const href = isPhone ? `tel:${value.replace(/\s/g, '')}` : `mailto:${value}`
    return (
      <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isPhone ? 'bg-[#1B54FF]/5' : 'bg-emerald-500/5'}`}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={14} className={iconColor} />
        </div>
        <a href={href} onClick={e => e.stopPropagation()}
          className={`flex-1 min-w-0 text-[13px] font-medium truncate animate-value-reveal ${textColor}`}>
          {value}
        </a>
        <CheckCircle2 size={14} className={iconColor} />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={14} className={iconColor} />
      </div>
      <span className="flex-1 min-w-0 text-[13px] font-medium text-gray-500 tabular-nums tracking-wide truncate">{value}</span>
    </div>
  )
}

function PremiumContactRow({ prospect, kind, canUnlock, onUnlock }: {
  prospect: ProspectResult; kind: 'phone' | 'email'
  canUnlock: boolean; onUnlock: (p: ProspectResult, field: 'phone' | 'email') => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const isPhone  = kind === 'phone'
  const has      = isPhone ? prospect.hasPhone : prospect.hasEmail
  const unlocked = isPhone ? prospect.phoneUnlocked : prospect.emailUnlocked
  const value    = isPhone ? prospect.phone : prospect.email
  const Icon     = isPhone ? Phone : Mail
  const iconBg   = isPhone ? 'bg-[#1B54FF]/10' : 'bg-emerald-500/10'
  const iconColor = isPhone ? 'text-[#1B54FF]' : 'text-emerald-600'
  const textColor = isPhone ? 'text-[#1B54FF]' : 'text-emerald-700'

  if (!has || !value) return null

  if (unlocked) {
    const href = isPhone ? `tel:${value.replace(/\s/g, '')}` : `mailto:${value}`
    return (
      <div className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${isPhone ? 'bg-[#1B54FF]/5' : 'bg-emerald-500/5'}`}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={14} className={iconColor} />
        </div>
        <a href={href} onClick={e => e.stopPropagation()}
          className={`flex-1 min-w-0 text-[13px] font-medium truncate animate-value-reveal ${textColor}`}>
          {value}
        </a>
        <CheckCircle2 size={14} className={iconColor} />
      </div>
    )
  }

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onUnlock(prospect, kind) } finally { setBusy(false) }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={14} className={iconColor} />
      </div>
      <span className="flex-1 min-w-0 text-[13px] font-medium text-gray-500 tabular-nums tracking-wide truncate">{value}</span>
      <button
        type="button" onClick={click} disabled={busy}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition active:scale-95 disabled:opacity-60
          ${isPhone
            ? 'bg-[#1B54FF] text-white hover:bg-[#0f3fc7]'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
      >
        {busy
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          : <Lock size={10} />}
        {canUnlock ? 'Débloquer' : 'Voir les offres'}
      </button>
    </div>
  )
}

// ─── Cadenas SVG "t!" — masque global référencé par id ───────────────────────
// Le masque est déclaré une seule fois dans le DOM (voir GlobalSvgDefs),
// tous les cadenas de la page l'utilisent via url(#trouve-t-mask).
const PADLOCK_MASK_ID = 'trouve-t-mask'

function GlobalSvgDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden="true">
      <defs>
        <mask id={PADLOCK_MASK_ID}>
          <rect width="24" height="24" fill="white" />
          <text
            x="12.5" y="18.8" fill="black" textAnchor="middle"
            style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 900, fontSize: '9px', letterSpacing: '-0.5px' }}
          >t!</text>
        </mask>
      </defs>
    </svg>
  )
}

function PadlockUnlockButton({
  kind, onClick, busy, canUnlock,
}: {
  kind:       'phone' | 'email'
  onClick:    (e: React.MouseEvent) => void
  busy?:      boolean
  canUnlock?: boolean
}) {
  const isPhone   = kind === 'phone'
  const hoverText = isPhone ? 'group-hover:text-[#124bd2]' : 'group-hover:text-emerald-500'
  const hoverBg   = isPhone ? 'hover:bg-blue-50'           : 'hover:bg-emerald-50'

  if (!canUnlock) {
    return (
      <button type="button" onClick={onClick} disabled={busy}
        className="text-[11px] font-medium text-gray-400 hover:text-[#124bd2] transition-colors disabled:opacity-50 px-1">
        Voir les offres
      </button>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={busy}
      className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-all duration-200 ${hoverBg} active:scale-95 disabled:opacity-50`}>
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
          className={`w-4 h-4 text-gray-300 transition-colors duration-200 ${hoverText}`}
          fill="none">
          {/* Anse */}
          <path d="M7 10V7A5 5 0 0117 7V10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          {/* Corps avec "t!" découpé */}
          <rect x="3" y="10" width="18" height="12" rx="3"
            fill="currentColor" mask={`url(#${PADLOCK_MASK_ID})`} />
        </svg>
      )}
      <span className={`text-[11px] font-medium text-gray-400 transition-colors duration-200 ${hoverText}`}>
        Débloquer
      </span>
    </button>
  )
}

// ─── Ligne de contact Apple-style (grille + modale) ──────────────────────────
function ContactRowStatic({
  kind, value, unlocked, onUnlock, busy, canUnlock, coloredIcon,
}: {
  kind:         'phone' | 'email'
  value:        string
  unlocked:     boolean
  onUnlock?:    (e: React.MouseEvent) => void
  busy?:        boolean
  canUnlock?:   boolean
  coloredIcon?: boolean
}) {
  const isPhone   = kind === 'phone'
  const Icon      = isPhone ? Phone : Mail
  const iconBg    = isPhone ? 'bg-[#1B54FF]/10' : 'bg-emerald-500/10'
  const iconColor = isPhone ? 'text-[#1B54FF]'  : 'text-emerald-600'
  const tintBg    = isPhone ? 'bg-[#1B54FF]/5'  : 'bg-emerald-500/5'
  const textColor = isPhone ? 'text-[#1B54FF]'  : 'text-emerald-700'
  const btnColor  = isPhone
    ? 'bg-[#1B54FF] hover:bg-[#0f3fc7] text-white'
    : 'bg-emerald-500 hover:bg-emerald-600 text-white'

  if (unlocked) {
    const href = isPhone ? `tel:${value.replace(/\s/g, '')}` : `mailto:${value}`
    return (
      <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 mb-1.5 last:mb-0 ${tintBg}`}>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={12} className={iconColor} />
        </div>
        <a href={href} onClick={e => e.stopPropagation()}
          className={`flex-1 min-w-0 text-[11px] font-medium truncate animate-value-reveal ${textColor}`}>
          {value}
        </a>
        <CheckCircle2 size={12} className={iconColor} />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-gray-50/80 px-3 py-2.5 mb-1.5 last:mb-0">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon size={12} className={iconColor} />
      </div>
      <span className="flex-1 min-w-0 text-[11px] font-medium text-gray-400 tabular-nums tracking-wide truncate">{value}</span>
      {onUnlock && (
        <button
          type="button" onClick={onUnlock} disabled={busy}
          className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all disabled:opacity-60 ${btnColor}`}
        >
          {busy
            ? <span className="h-2.5 w-2.5 animate-spin rounded-full border border-t-transparent border-white" />
            : <Lock size={8} />
          }
          {canUnlock ? 'Débloquer' : 'Voir offres'}
        </button>
      )}
    </div>
  )
}

// Ligne unlock pour la modale — gère le busy state, icône colorée
function ModalContactRowUnlock({ prospect, kind, canUnlock, onUnlock }: {
  prospect:  ProspectResult
  kind:      'phone' | 'email'
  canUnlock: boolean
  onUnlock:  (p: ProspectResult, field: 'phone' | 'email') => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const isPhone = kind === 'phone'
  const has     = isPhone ? prospect.hasPhone : prospect.hasEmail
  const unlocked = isPhone ? prospect.phoneUnlocked : prospect.emailUnlocked
  const value   = isPhone ? prospect.phone : prospect.email
  if (!has || !value) return null

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onUnlock(prospect, kind) } finally { setBusy(false) }
  }

  return (
    <ContactRowStatic
      kind={kind}
      value={kind === 'phone' ? value : value}
      unlocked={!!unlocked}
      onUnlock={unlocked ? undefined : click}
      busy={busy}
      canUnlock={canUnlock}
      coloredIcon
    />
  )
}

function ProspectCard({
  prospect, isFavorite, onToggleFavorite, viewMode, onDetail, accessLevel = 'full', canUnlock = false, onUnlock,
}: {
  prospect:          ProspectResult
  isFavorite:        boolean
  onToggleFavorite:  (p: ProspectResult) => void
  viewMode:          'grid' | 'list'
  onDetail:          (p: ProspectResult) => void
  accessLevel?:      AccessLevel
  canUnlock?:        boolean
  onUnlock?:         (p: ProspectResult, field: 'phone' | 'email') => Promise<void>
}) {
  const noop = async () => {}
  const initials = prospectInitials(prospect.fullName)
  const accent   = prospectAccent(prospect.jobTitle)
  const [phoneBusy, setPhoneBusy] = useState(false)
  const [emailBusy, setEmailBusy] = useState(false)

  if (viewMode === 'list') {
    const isLimited = accessLevel === 'limited'

    const unlockPhoneList = async (e: React.MouseEvent) => {
      e.stopPropagation(); if (phoneBusy) return
      setPhoneBusy(true); try { await (onUnlock ?? noop)(prospect, 'phone') } finally { setPhoneBusy(false) }
    }
    const unlockEmailList = async (e: React.MouseEvent) => {
      e.stopPropagation(); if (emailBusy) return
      setEmailBusy(true); try { await (onUnlock ?? noop)(prospect, 'email') } finally { setEmailBusy(false) }
    }

    // Compile toutes les lignes téléphone (principale + fusionnées) — filtre les nulls DB
    const phoneRows: { value: string; unlocked: boolean }[] = []
    if (prospect.hasPhone && prospect.phone) {
      phoneRows.push({ value: prospect.phone, unlocked: !!prospect.phoneUnlocked })
    }
    if (prospect.phoneUnlocked) {
      prospect.mobiles?.forEach(m => {
        if (!m) return
        const fmt = formatPhone(m) ?? m
        if (fmt && fmt !== prospect.phone) phoneRows.push({ value: fmt, unlocked: true })
      })
    }
    prospect.mobilesLocked?.forEach(m => { if (m) phoneRows.push({ value: m, unlocked: false }) })

    // Compile toutes les lignes email (principale + fusionnées) — filtre les nulls DB
    const emailRows: { value: string; unlocked: boolean }[] = []
    if (prospect.hasEmail && prospect.email) {
      emailRows.push({ value: prospect.email, unlocked: !!prospect.emailUnlocked })
    }
    if (prospect.emailUnlocked) {
      prospect.allEmails?.forEach(em => { if (em && em !== prospect.email) emailRows.push({ value: em, unlocked: true }) })
    } else {
      prospect.emailsLocked?.forEach(em => { if (em) emailRows.push({ value: em, unlocked: false }) })
    }

    return (
      <div
        className={`group flex items-start gap-4 bg-white border border-gray-100 rounded-xl px-5 py-4 transition-all duration-200 ${isLimited ? 'cursor-default' : 'cursor-pointer hover:shadow-md hover:border-gray-200'}`}
        onClick={() => !isLimited && onDetail(prospect)}
      >
        {/* Avatar — aligné en haut */}
        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${isLimited ? 'bg-gray-50 border-gray-200 text-gray-300' : 'bg-[#124bd2]/10 border-[#124bd2]/20 text-[#124bd2]'}`}>
          {isLimited ? <Lock size={13} className="text-gray-300" /> : initials}
        </div>

        {/* Identité */}
        <div className="min-w-0 w-52 shrink-0 pt-0.5">
          {isLimited ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><BlurPill w="w-32" /><BlurPill w="w-20" /></div>
              <BlurPill w="w-40" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900 truncate">{prospect.fullName}</span>
                {prospect.mergedCount && prospect.mergedCount > 1 && (
                  <span className="shrink-0 flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] text-gray-400 border border-gray-100">
                    <Database size={8} />×{prospect.mergedCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {[prospect.jobTitle, prospect.companyName, prospect.city].filter(Boolean).join(' · ')}
              </p>
            </>
          )}
        </div>

        {/* Coordonnées multi-lignes */}
        {!isLimited && (
          <div className="hidden md:flex items-start gap-8 flex-1 min-w-0 pt-0.5">

            {/* Colonne Téléphones */}
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              {phoneRows.map((p, i) => (
                <div key={i} className="flex items-center gap-2 min-w-0">
                  {p.unlocked ? (
                    <a href={`tel:${(p.value ?? '').replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}
                      className="font-mono text-sm text-[#124bd2] hover:underline truncate flex-1">
                      {p.value}
                    </a>
                  ) : (
                    <>
                      <span className="font-mono text-sm text-gray-300 tracking-wide truncate flex-1">{p.value}</span>
                      <PadlockUnlockButton kind="phone" onClick={unlockPhoneList} busy={phoneBusy} canUnlock={canUnlock} />
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Colonne Emails */}
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              {emailRows.map((e, i) => (
                <div key={i} className="flex items-center gap-2 min-w-0">
                  {e.unlocked ? (
                    <a href={`mailto:${e.value}`} onClick={ev => ev.stopPropagation()}
                      className="font-mono text-sm text-emerald-600 hover:underline truncate flex-1">
                      {e.value}
                    </a>
                  ) : (
                    <>
                      <span className="font-mono text-sm text-gray-300 tracking-wide truncate flex-1">{e.value}</span>
                      <PadlockUnlockButton kind="email" onClick={unlockEmailList} busy={emailBusy} canUnlock={canUnlock} />
                    </>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}
        {isLimited && (
          <div className="hidden md:flex items-center gap-4 flex-1 pt-0.5">
            <BlurPill w="w-32" /><BlurPill w="w-40" />
          </div>
        )}

        {/* Actions droite */}
        <div className={`flex shrink-0 items-center gap-1.5 pt-0.5 transition-opacity duration-200 ${isLimited ? 'invisible' : 'opacity-0 group-hover:opacity-100'}`}>
          <button onClick={e => { e.stopPropagation(); onToggleFavorite(prospect) }}
            aria-label={isFavorite ? 'Retirer' : 'Ajouter aux favoris'}
            className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'}`}>
            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <span className="text-xs text-gray-400 flex items-center gap-0.5 pr-1">
            Fiche <ChevronRight size={13} />
          </span>
        </div>
      </div>
    )
  }

  // Vue grille — Apple-style
  const isLimited = accessLevel === 'limited'

  const unlockPhone = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (phoneBusy) return
    setPhoneBusy(true)
    try { await (onUnlock ?? noop)(prospect, 'phone') } finally { setPhoneBusy(false) }
  }

  const unlockEmail = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (emailBusy) return
    setEmailBusy(true)
    try { await (onUnlock ?? noop)(prospect, 'email') } finally { setEmailBusy(false) }
  }

  const primaryAddress = prospect.allAddresses?.[0]
  const addressSubtitle = primaryAddress
    ? [primaryAddress.rue, [primaryAddress.cp, primaryAddress.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : prospect.city
      ? [prospect.zipCode, prospect.city].filter(Boolean).join(' ')
      : null

  return (
    <div
      className={`group relative flex flex-col rounded-2xl bg-white border border-gray-100 shadow-sm transition-all duration-200 overflow-hidden ${isLimited ? 'cursor-default' : 'cursor-pointer hover:shadow-[0_4px_24px_-4px_rgba(27,84,255,0.12)] hover:border-[#1B54FF]/20'}`}
      onClick={() => !isLimited && onDetail(prospect)}
    >
      {/* Accent top border */}
      {!isLimited && <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#1B54FF] via-[#3a7aff] to-[#1B54FF]/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200" />}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-sm ${isLimited ? 'bg-gray-100 text-gray-300' : 'bg-gradient-to-br from-[#1B54FF] to-[#0f3fc7] text-white'}`}>
            {isLimited ? <Lock size={13} className="text-gray-300" /> : initials}
          </div>
          <div className="min-w-0 flex-1">
            {isLimited ? (
              <div className="space-y-1.5 pt-0.5">
                <BlurPill w="w-32" h="h-3.5" />
                <BlurPill w="w-20" />
              </div>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-gray-900 tracking-tight leading-snug truncate">{prospect.fullName}</p>
                {addressSubtitle && (
                  <p className="text-[11px] text-gray-400 mt-0.5 truncate">{addressSubtitle}</p>
                )}
              </>
            )}
          </div>
        </div>
        {!isLimited && (
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(prospect) }}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`shrink-0 mt-0.5 transition-all ${isFavorite ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}
          >
            <Star size={14} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-gray-50" />

      {/* Section Coordonnées */}
      {isLimited ? (
        <div className="flex-1 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2"><Phone size={11} className="text-gray-200" /><BlurPill w="w-28" /></div>
          <div className="flex items-center gap-2"><Mail size={11} className="text-gray-200" /><BlurPill w="w-32" /></div>
          <div className="flex items-center gap-2"><MapPin size={11} className="text-gray-200" /><BlurPill w="w-20" /></div>
        </div>
      ) : (
        <div className="flex-1 px-4 py-3">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Coordonnées</p>
          <div className="space-y-0">
            {prospect.hasPhone && (
              <ContactRowStatic
                kind="phone"
                value={prospect.phone ?? ''}
                unlocked={!!prospect.phoneUnlocked}
                onUnlock={prospect.phoneUnlocked ? undefined : unlockPhone}
                busy={phoneBusy}
                canUnlock={canUnlock}
              />
            )}
            {prospect.phoneUnlocked
              ? prospect.mobiles?.map((m, i) => (
                  <ContactRowStatic key={i} kind="phone" value={formatPhone(m) ?? m} unlocked />
                ))
              : prospect.mobilesLocked?.map((m, i) => (
                  <ContactRowStatic key={i} kind="phone" value={m} unlocked={false}
                    onUnlock={unlockPhone} busy={phoneBusy} canUnlock={canUnlock} />
                ))
            }
            {prospect.hasEmail && (
              <ContactRowStatic
                kind="email"
                value={prospect.email ?? ''}
                unlocked={!!prospect.emailUnlocked}
                onUnlock={prospect.emailUnlocked ? undefined : unlockEmail}
                busy={emailBusy}
                canUnlock={canUnlock}
              />
            )}
            {prospect.emailUnlocked
              ? prospect.allEmails?.filter(e => e.includes('@')).map((e, i) => (
                  <ContactRowStatic key={i} kind="email" value={e} unlocked />
                ))
              : prospect.emailsLocked?.map((e, i) => (
                  <ContactRowStatic key={i} kind="email" value={e} unlocked={false}
                    onUnlock={unlockEmail} busy={emailBusy} canUnlock={canUnlock} />
                ))
            }
            {!prospect.hasPhone && !prospect.hasEmail && (
              <p className="py-2 text-[11px] text-gray-300">Aucune coordonnée</p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-50">
        {prospect.mergedCount && prospect.mergedCount > 1 && !isLimited ? (
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Database size={8} className="text-gray-300" />
            {prospect.mergedCount} fusionnées
          </span>
        ) : <span />}
        {isLimited ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-300">
            <Lock size={9} /> Accès restreint
          </span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onDetail(prospect) }}
            className="flex items-center gap-1.5 rounded-lg bg-gray-50 hover:bg-[#1B54FF]/8 px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-[#1B54FF] transition-all duration-150"
          >
            Voir la fiche <ArrowRight size={11} />
          </button>
        )}
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
              className="card-lift group flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[10px] font-bold text-[#124bd2]">
                {prospectInitials(f.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{f.name}</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{f.jobTitle}</p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{f.companyName}</p>
                <p className="mt-0.5 text-xs text-slate-300 dark:text-slate-600">{f.city}</p>
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

// ─── ListsView ────────────────────────────────────────────────────────────────
function ListsView({ lists, onOpenList, onExport, onDelete, onGoSearch, onNewList }: {
  lists: ProspectList[]; onOpenList: (id: string) => void; onExport: (l: ProspectList) => void
  onDelete: (id: string) => void; onGoSearch: () => void; onNewList: () => void
}) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-xs text-slate-400">
        <button onClick={onGoSearch} className="hover:text-[#124bd2] transition font-medium">Recherche</button>
        <ChevronRight size={12} className="text-slate-300" />
        <span className="text-slate-600 dark:text-slate-300 font-medium">Mes listes</span>
      </nav>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Mes listes de prospects</h2>
          <p className="mt-0.5 text-xs text-slate-400">{lists.length} liste{lists.length !== 1 ? 's' : ''} · {lists.reduce((n, l) => n + l.contacts.length, 0)} contacts au total</p>
        </div>
        <button onClick={onNewList} className="flex items-center gap-1.5 rounded-xl bg-[#124bd2] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0b3fbc]">
          <Plus size={13} /> Nouvelle liste
        </button>
      </div>

      {lists.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-blue-50 dark:bg-blue-950/30">
            <Star size={26} className="text-blue-300" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Aucune liste</h2>
          <p className="mt-2 text-sm text-slate-400">Cliquez sur ★ sur une fiche pour ajouter un prospect à une liste.</p>
          <button onClick={onGoSearch} className="mt-6 flex items-center gap-2 rounded-xl bg-[#124bd2] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0b3fbc]">
            <Search size={14} /> Lancer une recherche
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lists.map((list, idx) => (
          <motion.div
            key={list.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, delay: idx * 0.06 }}
            onClick={() => onOpenList(list.id)}
            className="group relative flex w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex flex-1 flex-col p-5">
              {/* Header : indicateur + nom + count */}
              <div className="mb-4 flex items-start gap-3">
                <div className="mt-[3px] shrink-0">
                  {isListColor(list.emoji)
                    ? <ListColorDot color={list.emoji} size="sm" />
                    : <span className="text-lg leading-none">{list.emoji}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{list.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {list.contacts.length} contact{list.contacts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              {/* Avatars + date */}
              <div className="mb-5 flex w-full items-center justify-between">
                {list.contacts.length > 0 ? (
                  <div className="flex -space-x-1.5">
                    {list.contacts.slice(0, 4).map(c => (
                      <div key={c.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#1B54FF]/10 text-[9px] font-bold text-[#1B54FF] dark:border-slate-900">
                        {prospectInitials(c.name)}
                      </div>
                    ))}
                    {list.contacts.length > 4 && (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-bold text-slate-500 dark:border-slate-900">
                        +{list.contacts.length - 4}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs italic text-slate-300 dark:text-slate-600">Liste vide</span>
                )}
                <span className="text-xs text-slate-400">
                  {new Date(list.updatedAt).toLocaleDateString('fr-FR')}
                </span>
              </div>

              {/* Actions */}
              <div className="mt-auto flex gap-2">
                <button
                  onClick={e => { e.stopPropagation(); onExport(list) }}
                  className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#1B54FF] text-xs font-semibold text-white transition hover:bg-[#0b3fbc]"
                >
                  <Download size={12} /> Exporter CSV
                </button>
                <button
                  onClick={e => { e.stopPropagation(); if (confirm(`Supprimer "${list.name}" ?`)) onDelete(list.id) }}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-slate-700"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

// ─── SingleListView ───────────────────────────────────────────────────────────
function SingleListView({ list, onBack, onExport, onRemove, onGoSearch }: {
  list: ProspectList; onBack: () => void; onExport: () => void; onRemove: (id: string) => void; onGoSearch?: () => void
}) {
  return (
    <div className="mx-auto max-w-3xl px-5 py-6 animate-fade-in">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-1.5 text-xs text-slate-400">
        {onGoSearch && (
          <>
            <button onClick={onGoSearch} className="hover:text-[#124bd2] transition font-medium">Recherche</button>
            <ChevronRight size={12} className="text-slate-300" />
          </>
        )}
        <button onClick={onBack} className="hover:text-[#124bd2] transition font-medium">Mes listes</button>
        <ChevronRight size={12} className="text-slate-300" />
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium truncate max-w-[180px]">
          {isListColor(list.emoji) ? <ListColorDot color={list.emoji} size="sm" /> : list.emoji}
          {list.name}
        </span>
      </nav>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#124bd2] transition font-medium">
          <ChevronLeft size={13} /> Mes listes
        </button>
        <span className="text-slate-300">|</span>
        {isListColor(list.emoji)
          ? <ListColorDot color={list.emoji} size="lg" />
          : <span className="text-xl">{list.emoji}</span>}
        <div className="flex-1">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{list.name}</h2>
          <p className="text-xs text-slate-400">{list.contacts.length} contact{list.contacts.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onExport} className="flex items-center gap-1.5 rounded-xl bg-[#124bd2] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#0b3fbc]">
          <Download size={13} /> Exporter CSV
        </button>
      </div>

      {list.contacts.length === 0 && (
        <p className="py-12 text-center text-sm text-slate-400">Cette liste est vide.</p>
      )}

      <div className="flex flex-col gap-2">
        {list.contacts.map(c => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 flex-wrap">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
              {prospectInitials(c.name)}
            </div>
            <div className="flex-1 min-w-[140px]">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{c.name}</p>
              <p className="text-xs text-slate-400">{c.jobTitle} · {c.companyName}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.phone && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{c.phone}</span>}
              {c.email && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{c.email}</span>}
              {c.city && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">{c.city}</span>}
            </div>
            <button onClick={() => onRemove(c.id)} className="ml-auto rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── AddToListPopup ───────────────────────────────────────────────────────────
function AddToListPopup({ prospect, lists, onConfirm, onClose }: {
  prospect: ProspectResult | null; lists: ProspectList[]
  onConfirm: (listId: string, newName?: string, newEmoji?: string) => void; onClose: () => void
}) {
  const [newName, setNewName] = useState('')
  const [newEmoji, setNewEmoji] = useState('blue')
  const [selected, setSelected] = useState<string>('')
  const isNewList = prospect?.id === '__new_list__'

  if (!prospect) return null

  const handleConfirm = () => {
    if (newName.trim()) { onConfirm('', newName.trim(), newEmoji); return }
    if (selected) { onConfirm(selected); return }
    if (isNewList) return
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {isNewList ? 'Créer une liste' : 'Ajouter à une liste'}
        </p>
        {!isNewList && <p className="mb-4 text-base font-bold text-slate-800 dark:text-slate-100">{prospect.fullName}</p>}

        {!isNewList && lists.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Choisir une liste existante</p>
            {lists.map(l => (
              <label key={l.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition ${selected === l.id ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
                <input type="radio" name="list-pick" value={l.id} checked={selected === l.id} onChange={() => setSelected(l.id)} className="accent-[#124bd2]" />
                {isListColor(l.emoji)
                  ? <ListColorDot color={l.emoji} size="md" />
                  : <span className="text-base">{l.emoji}</span>}
                <span className="flex-1 text-sm font-semibold">{l.name}</span>
                <span className="text-xs text-slate-400">{l.contacts.length}</span>
              </label>
            ))}
          </div>
        )}

        <div className={`${lists.length > 0 && !isNewList ? 'border-t border-slate-100 pt-4 dark:border-slate-800' : ''}`}>
          <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
            {isNewList ? 'Nom de la liste' : 'Ou créer une nouvelle liste'}
          </p>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex : BTP Lyon, Médecins Paris…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-800" />
          <div className="mt-3">
            <p className="mb-2 text-xs text-slate-400">Couleur</p>
            <ListColorPicker value={newEmoji} onChange={setNewEmoji} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700">Annuler</button>
          <button onClick={handleConfirm} disabled={!newName.trim() && !selected}
            className="flex-[2] rounded-xl bg-[#124bd2] py-2.5 text-sm font-bold text-white transition hover:bg-[#0b3fbc] disabled:opacity-40">
            {newName.trim() ? 'Créer et ajouter →' : selected ? 'Ajouter →' : 'Ajouter →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── User Menu dropdown ────────────────────────────────────────────────────────
function UserMenu({ account, onLogout, onOpenAccount, onOpenProspection, placement = 'below' }: { account: Account; onLogout: () => void; onOpenAccount: (tab?: string) => void; onOpenProspection: () => void; placement?: 'below' | 'above' }) {
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
    { icon: UserCircle2,     label: 'Mon profil',             action: () => { setOpen(false); onOpenAccount('profil') } },
    ...(account.role !== 'agent' ? [{ icon: CreditCard, label: 'Mon abonnement', action: () => { setOpen(false); onOpenAccount('abonnement') } }] : []),
    ...(account.role !== 'agent' ? [{ icon: LayoutDashboard, label: 'Dashboard', action: () => { setOpen(false); onOpenAccount('dashboard') } }] : []),
    { icon: UserPlus,        label: 'Parrainage',             action: () => { setOpen(false); onOpenAccount('parrainage') } },
    { icon: MessageSquare,   label: 'Aide à la prospection',  action: () => { setOpen(false); onOpenProspection() } },
    { icon: MessageSquare,   label: 'Support',                action: () => setOpen(false) },
  ]

  return (
    <div ref={ref} className="relative">
      {/* Trigger — initiale + nom complet + chevron */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-1.5 pr-3 py-1.5 transition hover:border-blue-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 ${placement === 'above' ? 'w-full' : ''}`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1B54FF] text-white text-xs font-bold shrink-0">
          {initial}
        </span>
        <span className="max-w-[140px] truncate text-sm font-medium text-slate-700 dark:text-slate-200">{displayName}</span>
        {open
          ? <ChevronUp size={13} className="text-slate-400" />
          : <ChevronDown size={13} className="text-slate-400" />
        }
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`animate-scale-in absolute z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${placement === 'above' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2'}`}>
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
            <LogoutDialog onConfirm={() => { setOpen(false); onLogout() }}>
              <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-500 transition hover:bg-red-50 dark:hover:bg-red-950/30">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-950/40">
                  <LogOut size={15} className="text-red-500" />
                </span>
                <span className="font-medium">Déconnexion</span>
              </button>
            </LogoutDialog>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Recherche avancée (6 sections) ──────────────────────────────────────────
interface AdvancedFiltersProps {
  // Identité professionnelle
  firstName:  string; setFirstName:  (v: string) => void
  lastName:   string; setLastName:   (v: string) => void
  jobTitle:   string; setJobTitle:   (v: string) => void
  birthYear:  string; setBirthYear:  (v: string) => void
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
  onSearch:        () => void
  onAddressSelect: (result: import('@/components/ui/address-autocomplete').AddressResult) => void
  onReset:         () => void
}

function AdvSection({
  id, icon, title, color, open, onToggle, children,
}: {
  id: string; icon: React.ReactNode; title: string; color: string
  open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-slate-700 hover:bg-slate-50/80 transition dark:text-slate-200 dark:hover:bg-slate-800/50"
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
        className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white placeholder:text-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
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
        className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        {children}
      </select>
    </div>
  )
}

function AdvancedFilters(props: AdvancedFiltersProps) {
  const {
    firstName, setFirstName, lastName, setLastName, jobTitle, setJobTitle,
    birthYear, setBirthYear,
    city, setCity, address, setAddress, zipCode, setZipCode, department, setDepartment,
    phone, setPhone, email, setEmail,
    companyName, setCompanyName, activityCode, setActivityCode, employeeRange, setEmployeeRange, legalForm, setLegalForm,
    linkedin, setLinkedin,
    onSearch, onAddressSelect, onReset,
  } = props

  const [open, setOpen] = useState<string[]>([])
  const tog = (k: string) => setOpen(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

      {/* 1 — Identité professionnelle */}
      <AdvSection id="civil" icon={<UserCircle2 size={15} />} title="Identité professionnelle"
        color="bg-blue-50 text-[#124bd2]" open={open.includes('civil')} onToggle={() => tog('civil')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <AdvInput label="Prénom" value={firstName} onChange={setFirstName} onEnter={onSearch} placeholder="Jean" />
          <AdvInput label="Nom" value={lastName} onChange={setLastName} onEnter={onSearch} placeholder="Dupont" />
          <AdvInput label="Poste / Titre" value={jobTitle} onChange={setJobTitle} onEnter={onSearch} placeholder="Directeur commercial" />
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Année de naissance
            </label>
            <div className="relative">
              <input
                type="text"
                value={birthYear}
                onChange={e => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={e => { if (e.key === 'Enter' && firstName && lastName) onSearch() }}
                placeholder={firstName && lastName ? '1985' : 'Nom + Prénom requis'}
                disabled={!firstName || !lastName}
                maxLength={4}
                className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700 outline-none transition focus:border-blue-300 focus:bg-white placeholder:text-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
            {(!firstName || !lastName) && (
              <p className="mt-1 text-[10px] text-slate-400">Renseignez Nom et Prénom pour activer</p>
            )}
          </div>
        </div>
      </AdvSection>

      {/* 2 — Coordonnées */}
      <AdvSection id="contact" icon={<Mail size={15} />} title="Coordonnées"
        color="bg-purple-50 text-purple-600" open={open.includes('contact')} onToggle={() => tog('contact')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="Téléphone" value={phone} onChange={setPhone} onEnter={onSearch} placeholder="06 12 34 56 78" type="tel" />
          <AdvInput label="Email" value={email} onChange={setEmail} onEnter={onSearch} placeholder="jean.dupont@agence.fr" type="email" />
        </div>
      </AdvSection>

      {/* 4 — Adresse */}
      <AdvSection id="address" icon={<MapPin size={15} />} title="Adresse"
        color="bg-emerald-50 text-emerald-600" open={open.includes('address')} onToggle={() => tog('address')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AddressAutocomplete
              label="Rue / Adresse"
              value={address}
              placeholder="122 Boulevard Murat"
              onSelect={result => {
                setAddress(result.adresse)
                setCity(result.ville)
                setZipCode(result.codePostal)
                onAddressSelect(result)
              }}
            />
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

      {/* 4b — Matching LinkedIn */}
      <AdvSection id="networks" icon={<Link2 size={15} />} title="Matching LinkedIn"
        color="bg-indigo-50 text-indigo-600" open={open.includes('networks')} onToggle={() => tog('networks')}>
        <div className="grid grid-cols-1 gap-3">
          <AdvInput label="URL ou nom de profil LinkedIn" value={linkedin} onChange={setLinkedin} onEnter={onSearch} placeholder="linkedin.com/in/jean-dupont" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Collez une URL LinkedIn — l'IA croise les données publiques du profil avec notre base pour identifier le contact.
          </p>
        </div>
      </AdvSection>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-800/50">
        <button type="button" onClick={onReset}
          className="flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300">
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
export default function SearchPage({ account, onLogout, onOpenAccount, accessLevel = 'full', maxSearches, onReturnAdmin }: SearchPageProps) {
  // Feature flags — interrupteurs d'urgence admin
  const { isEnabled } = useFeatureFlags()
  const [maintenanceFlag, setMaintenanceFlag] = useState<string | null>(null)

  // État de recherche
  const [query, setQuery]               = useState('')
  const [inputValue, setInputValue]     = useState('')
  const [identityInput, setIdentityInput] = useState('')   // omnibar : "Jean Dupont"
  const [searchMode, setSearchMode]     = useState<'exact' | 'starts_with' | 'ends_with' | 'contains'>('exact')
  const [searchTel, setSearchTel]       = useState('')
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
  const [advBirthYear, setAdvBirthYear]     = useState('')
  const [advCity, setAdvCity]               = useState('')
  const [advAddress, setAdvAddress]         = useState('')
  const [advPhone, setAdvPhone]             = useState('')
  const [advEmail, setAdvEmail]             = useState('')
  const [advCompanyName, setAdvCompanyName] = useState('')
  const [advLinkedin, setAdvLinkedin]       = useState('')
  const [page, setPage]                 = useState(1)
  const [perPage, setPerPage]           = useState(20)
  const [viewMode, setViewMode]         = useState<'grid' | 'list'>('grid')
  const bounceKey = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    el.classList.remove('key-animate')
    void el.offsetWidth
    el.classList.add('key-animate')
  }

  const [showFilters, setShowFilters]                   = useState(false)
  const [showProspectionPanel, setShowProspectionPanel] = useState(false)
  const [searchTransition, setSearchTransition]         = useState<'hidden' | 'visible' | 'leaving'>('hidden')
  const [transitionQuery, setTransitionQuery]           = useState('')
  const transitionStartRef                              = useRef(0)

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
  const isDemoAccount = account.id.startsWith('demo-')
  const [lists, setLists]                     = useState<ProspectList[]>(() => isDemoAccount ? [] : loadLists())
  const [activeListId, setActiveListId]       = useState<string | null>(null)
  const [addPopupProspect, setAddPopupProspect] = useState<ProspectResult | null>(null)
  const [appView, setAppView]                 = useState<AppView>('search')
  const [usedQuota]                           = useState(account.monthlyUsage)
  const [darkMode, setDarkMode]               = useState(() => document.documentElement.classList.contains('dark'))
  const [showMobileMenu, setShowMobileMenu]   = useState(false)
  const [showBuyKeys, setShowBuyKeys]         = useState(false)

  // Compteur de recherches pour modes demo / limited
  const DEMO_COUNT_KEY = `trouve_demo_count_${account.id}`
  const [demoSearchCount, setDemoSearchCount] = useState<number>(() => {
    if (accessLevel === 'full') return 0
    return parseInt(localStorage.getItem(`trouve_demo_count_${account.id}`) ?? '0', 10)
  })
  const [showConversionModal, setShowConversionModal]     = useState(false)
  const [showDemoRequestModal, setShowDemoRequestModal]   = useState(false)
  const [creditBalance, setCreditBalance]                 = useState<CreditBalance | null>(null)

  // ── Crédits démo (trial) ────────────────────────────────────────────────────
  const isTrialAccount = account.status === 'trial'
  const [demoCredits, setDemoCredits] = useState<DemoCredits>(() =>
    isTrialAccount ? getDemoCredits() : { phone: 5, email: 2 }
  )
  const [showDemoToast, setShowDemoToast] = useState(false)
  const demoLocked = isTrialAccount && demoCredits.phone === 0
  const accountIdRef = useRef(account.id)
  useEffect(() => { accountIdRef.current = account.id }, [account.id])

  // Solde de crédits (abonnés).
  const PLATFORM_ADMINS = ['contact@trouve.fr', 'yassine.irh@gmail.com']
  useEffect(() => {
    if (PLATFORM_ADMINS.includes(account.email)) {
      setCreditBalance({ phoneCredits: 999999, emailCredits: 999999, unlimited: true })
      return
    }
    if ((accessLevel === 'full' || accessLevel === 'trial') && !account.id.startsWith('demo-') && !account.id.startsWith('preview-')) {
      getCreditBalance().then(b => { if (b !== null) setCreditBalance(b) }).catch(() => {})
    }
  }, [accessLevel, account.id, account.email])

  // Crédits clés simulés en mode démo
  useEffect(() => {
    if (account.id.startsWith('demo-') || account.id.startsWith('preview-')) {
      const total = account.role === 'agent' ? 50 : 100
      const used  = account.role === 'agent' ? 23 : 4
      setCreditBalance({
        phoneCredits:      total - used,
        emailCredits:      total - used,
        unlimited:         false,
        totalPhoneCredits: total,
        totalEmailCredits: total,
      })
    }
  }, [account.id, account.role])

  // ── Notifications admin ──────────────────────────────────────────────────────
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [adminBannerDismissed, setAdminBannerDismissed] = useState(false)
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([])

  useEffect(() => {
    if (account.role !== 'admin' || isDemoAccount) return
    const load = async () => {
      const { data: { session } } = await getSupabaseClient().auth.getSession()
      const token = session?.access_token
      if (!token) return
      const r = await fetch('/api/admin/users?status=pending&limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!r?.ok) return
      const d = await r.json()
      const count = d.total ?? 0
      setPendingCount(count)
      if (count > 0) {
        setAdminNotifications([{
          id: 'pending-accounts',
          title: `${count} demande${count > 1 ? 's' : ''} d'accès en attente`,
          description: `${count} compte${count > 1 ? 's' : ''} nécessite${count > 1 ? 'nt' : ''} une validation dans le dashboard admin.`,
          timestamp: new Date(),
          read: false,
          action: () => setAppView('admin'),
        }])
      }
    }
    load()
  }, [account.role, isDemoAccount])

  // Déblocage d'un champ (consomme 1 crédit). Démo / sans crédit → page offres.
  const handleUnlock = useCallback(async (prospect: ProspectResult, field: 'phone' | 'email') => {
    // Guard feature flag — affiche modal maintenance si le module est coupé
    const flagKey = field === 'phone' ? 'phone_unlock' : 'email_unlock'
    if (!isEnabled(flagKey)) { setMaintenanceFlag(flagKey); return }

    const isDemoAccount = accountIdRef.current.startsWith('demo-') || accountIdRef.current.startsWith('preview-')
    // ── Mode démo : simule le déblocage avec données partielles ─────────────
    if (isDemoAccount) {
      await new Promise(res => setTimeout(res, 500 + Math.random() * 300))
      if (field === 'phone') {
        const r = () => String(Math.floor(Math.random() * 90) + 10)
        const fakePhone = `06 ${r()} ${r()} ${r()} ${r()}`
        const patch = { phone: fakePhone, phoneUnlocked: true }
        setResults(prev => prev.map(p => p.id === prospect.id ? { ...p, ...patch } : p))
        setSelectedCompany(prev => prev?.id === prospect.id ? { ...prev, ...patch } : prev)
      } else {
        const names   = ['jean.dupont', 'marie.martin', 'pierre.durand', 'sophie.leblanc']
        const domains = ['gmail.com', 'yahoo.fr', 'outlook.fr', 'hotmail.com']
        const fakeEmail = `${names[Math.floor(Math.random() * names.length)]}@${domains[Math.floor(Math.random() * domains.length)]}`
        const patch = { email: fakeEmail, emailUnlocked: true }
        setResults(prev => prev.map(p => p.id === prospect.id ? { ...p, ...patch } : p))
        setSelectedCompany(prev => prev?.id === prospect.id ? { ...prev, ...patch } : prev)
      }
      return
    }
    // ── Mode trial : crédits locaux ──────────────────────────────────────────
    if (isTrialAccount) {
      if (field === 'phone') {
        if (demoCredits.phone === 0) return
        const next = consumePhoneCredit()
        setDemoCredits(next)
        if (next.phone === 3) setShowDemoToast(true)
        // Masquage partiel : affiche seulement 6 chiffres
        const raw = prospect.phone ?? '06 XX XX •• ••'
        const digits = raw.replace(/\D/g, '')
        const partial = digits.slice(0, 4).replace(/(\d{2})(\d{2})/, '$1 $2') + ' •• ••'
        const patch = { phone: partial, phoneUnlocked: true, phoneDemoMasked: true }
        setResults(prev => prev.map(p => p.id === prospect.id ? { ...p, ...patch } : p))
        setSelectedCompany(prev => prev?.id === prospect.id ? { ...prev, ...patch } : prev)
      } else {
        if (demoCredits.email === 0) return
        const next = consumeEmailCredit()
        setDemoCredits(next)
        const patch = { email: prospect.email ?? '', emailUnlocked: true }
        setResults(prev => prev.map(p => p.id === prospect.id ? { ...p, ...patch } : p))
        setSelectedCompany(prev => prev?.id === prospect.id ? { ...prev, ...patch } : prev)
      }
      return
    }
    if (accessLevel !== 'full') { window.location.assign('/?pricing=1'); return }
    try {
      const primaryValue = await unlockContactField(prospect.id, field)

      // Déblocage en lot : uniquement les fiches qui ont réellement ce champ
      const revealed: string[] = [primaryValue]
      const fieldIds   = field === 'phone' ? (prospect.phoneIds ?? []) : (prospect.emailIds ?? [])
      const secondaryIds = fieldIds.filter(id => id !== prospect.id)

      await Promise.allSettled(
        secondaryIds.map(async (secId) => {
          try {
            const v = await unlockContactField(secId, field)
            if (v && !revealed.includes(v)) revealed.push(v)
          } catch { /* ignore si crédit insuffisant */ }
        })
      )

      // Si la fiche a un mobile brut stocké, l'ajouter aux numéros révélés
      if (field === 'phone' && prospect.mobileRaw) {
        const mFmt = formatPhone(prospect.mobileRaw) ?? prospect.mobileRaw
        if (mFmt && !revealed.includes(mFmt)) revealed.push(mFmt)
      }
      const patch: Partial<ProspectResult> = field === 'phone'
        ? { phone: primaryValue, phoneUnlocked: true, mobiles: revealed.filter(v => v !== primaryValue), mobilesLocked: [], mobileRaw: null }
        : { email: primaryValue, emailUnlocked: true, allEmails: revealed.filter(v => v !== primaryValue), emailsLocked: [] }

      setResults(prev => prev.map(p => (p.id === prospect.id ? { ...p, ...patch } : p)))
      setSelectedCompany(prev => (prev && prev.id === prospect.id ? { ...prev, ...patch } : prev))
      getCreditBalance().then(setCreditBalance).catch(() => {})
    } catch (e) {
      if (e instanceof UnlockError) {
        if (e.code === 'no_subscription') {
          setError('Aucun abonnement actif. Contactez-nous à contact@trouve.fr.')
        } else if (e.code === 'no_phone_credits' || e.code === 'no_credits') {
          setError('Plus de crédits téléphone. Rechargez depuis le menu en bas à gauche.')
        } else if (e.code === 'no_email_credits') {
          setError('Plus de crédits email. Rechargez depuis le menu en bas à gauche.')
        } else {
          setError('Déblocage impossible pour le moment. Réessayez.')
        }
        return
      }
      setError('Déblocage impossible pour le moment. Réessayez.')
    }
  }, [accessLevel, isTrialAccount])

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
    [identityInput, inputValue, advFirstName, advLastName, advJobTitle, advCity, advAddress, advPhone, advEmail, advCompanyName, advLinkedin]
      .map(s => s.trim()).filter(Boolean).join(' ')

  // ─── Lancer une recherche ───────────────────────────────────────────────────
  const doSearch = useCallback(async (params: ProspectSearchParams, pg = 1) => {
    setLoading(true); setError(null)

    const isEmpty = !params.query?.trim() && !params.department && !params.activityCode &&
                    !params.zipCode && !params.employeeRange && !params.legalForm


    // Mode démo : résultats fictifs sans appel API
    if (account.id.startsWith('demo-')) {
      await new Promise(res => setTimeout(res, 500 + Math.random() * 400))
      const res = generateSearchDemoResults({ ...params, page: pg }, perPage)
      setResults(res.results)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(pg)
      setHasSearched(true)
      if (!isEmpty) {
        setDemoSearchCount(prev => {
          const next = prev + 1
          localStorage.setItem(DEMO_COUNT_KEY, String(next))
          if (maxSearches !== undefined && next >= maxSearches) setTimeout(() => setShowConversionModal(true), 400)
          return next
        })
      }
      setLoading(false)
      return
    }

    try {
      const res = await searchProspects({ ...params, page: pg, perPage: params.perPage ?? perPage })
      setResults(res.results)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(pg)
      setHasSearched(true)

      if (!isEmpty) {
        if ((accessLevel === 'demo' || accessLevel === 'limited') && maxSearches !== undefined) {
          // Démo : compteur de recherches → CTA pricing après la limite.
          setDemoSearchCount(prev => {
            const next = prev + 1
            localStorage.setItem(DEMO_COUNT_KEY, String(next))
            if (next >= maxSearches) setTimeout(() => setShowConversionModal(true), 400)
            return next
          })
        } else {
          // Abonné : recherche illimitée, simple journalisation.
          if (params.query?.trim()) {
            saveRecentSearch(params.query.trim())
            setRecentSearches(readRecentSearches())
          }
          const label = params.query?.trim() || `filtres:${[params.department, params.activityCode, params.zipCode].filter(Boolean).join('+')}`
          recordSearch(label, { department: params.department, activityCode: params.activityCode }, res.total).catch(() => {})
        }
      }
    } catch (err: any) {
      setError(err.message ?? 'Erreur lors de la recherche')
    } finally {
      setLoading(false)
    }
  }, [accessLevel, maxSearches, perPage, DEMO_COUNT_KEY]) // eslint-disable-line

  const handleResetFilters = useCallback(() => {
    setIdentityInput(''); setAdvFirstName(''); setAdvLastName('')
    setAdvBirthYear(''); setAdvJobTitle('')
    setAdvCity(''); setAdvAddress(''); setAdvPhone(''); setAdvEmail('')
    setAdvCompanyName(''); setAdvLinkedin('')
    setDepartment(''); setActivityCode(''); setActiveOnly(true)
    setZipCode(''); setEmployeeRange(''); setLegalForm('')
    setPage(1)
    doSearch({ query: inputValue, department: '', activityCode: '', activeOnly: true, zipCode: '', employeeRange: '', legalForm: '' })
  }, [doSearch, inputValue])

  const clearFilter = useCallback((patch: Record<string, string>) => {
    const get = (key: string, cur: string) => key in patch ? '' : cur
    if ('advFirstName'   in patch) setAdvFirstName('')
    if ('advLastName'    in patch) setAdvLastName('')
    if ('advBirthYear'   in patch) setAdvBirthYear('')
    if ('advJobTitle'    in patch) setAdvJobTitle('')
    if ('advCity'        in patch) setAdvCity('')
    if ('advAddress'     in patch) setAdvAddress('')
    if ('advPhone'       in patch) setAdvPhone('')
    if ('advEmail'       in patch) setAdvEmail('')
    if ('advCompanyName' in patch) setAdvCompanyName('')
    if ('advLinkedin'    in patch) setAdvLinkedin('')
    if ('department'     in patch) setDepartment('')
    if ('zipCode'        in patch) setZipCode('')
    if ('activityCode'   in patch) setActivityCode('')
    if ('employeeRange'  in patch) setEmployeeRange('')
    if ('legalForm'      in patch) setLegalForm('')
    setPage(1)
    doSearch({
      query:         get('identityInput', identityInput),
      department:    get('department',    department),
      activityCode:  get('activityCode',  activityCode),
      activeOnly,
      zipCode:       get('zipCode',       zipCode),
      employeeRange: get('employeeRange', employeeRange),
      legalForm:     get('legalForm',     legalForm),
      nom:           get('advLastName',   advLastName) || undefined,
      prenom:        get('advFirstName',  advFirstName) || undefined,
      city:          get('advCity',       advCity) || undefined,
      address:       get('advAddress',    advAddress) || undefined,
      tel:           get('advPhone',      advPhone) || undefined,
      birthYear:     get('advBirthYear',  advBirthYear) || undefined,
    })
  }, [doSearch, identityInput, department, activityCode, activeOnly, zipCode, employeeRange, legalForm,
      advLastName, advFirstName, advCity, advAddress, advPhone, advBirthYear])

  // Debounce search-as-you-type (barre principale uniquement)
  // Ferme l'overlay de transition quand la recherche se termine (minimum 650ms d'affichage)
  useEffect(() => {
    if (!isLoading && searchTransition === 'visible') {
      const elapsed = Date.now() - transitionStartRef.current
      const delay   = Math.max(0, 650 - elapsed)
      setTimeout(() => {
        setSearchTransition('leaving')
        setTimeout(() => setSearchTransition('hidden'), 450)
      }, delay)
    }
  }, [isLoading]) // eslint-disable-line


  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!isEnabled('search')) { setMaintenanceFlag('search'); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const ident = identityInput.trim()
    const label = ident || [advLastName, advFirstName].filter(Boolean).join(' ')
    setQuery(label)
    setShowRecent(false)
    if (label) {
      setTransitionQuery(label)
      setSearchTransition('visible')
      transitionStartRef.current = Date.now()
    }
    doSearch({
      query: label,
      identity: ident || undefined,
      nom:    !ident ? advLastName  : undefined,
      prenom: !ident ? advFirstName : undefined,
      city: advCity, address: advAddress, tel: searchTel || advPhone, searchMode,
      department, activityCode, activeOnly, zipCode, employeeRange, legalForm,
      birthYear: advBirthYear,
    })
  }

  const handleRecentSearch = (q: string) => {
    setInputValue(q); setQuery(q); setShowRecent(false)
    doSearch({ query: q, searchMode, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
  }


  const handlePageChange = (pg: number) => {
    const ident = identityInput.trim()
    doSearch({
      query: buildQuery(),
      identity: ident || undefined,
      nom:    !ident ? advLastName  : undefined,
      prenom: !ident ? advFirstName : undefined,
      city: advCity, address: advAddress, tel: searchTel || advPhone, searchMode,
      department, activityCode, activeOnly, zipCode, employeeRange, legalForm,
      birthYear: advBirthYear,
    }, pg)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleFavorite = (prospect: ProspectResult) => {
    setAddPopupProspect(prospect)
  }

  const handleAddToListConfirm = (listId: string, newListName?: string, newListEmoji?: string) => {
    const isRealProspect = addPopupProspect?.id !== '__new_list__' && !!addPopupProspect?.fullName

    if (isDemoAccount) {
      let target = listId
      let next = [...lists]
      if (newListName) {
        const newList: ProspectList = { id: Date.now().toString(), name: newListName, emoji: newListEmoji ?? 'blue', contacts: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        next = [...next, newList]
        target = newList.id
      }
      const idx = next.findIndex(l => l.id === target)
      if (isRealProspect && idx !== -1 && !next[idx].contacts.some(c => c.id === addPopupProspect!.id)) {
        next = next.map((l, i) => i !== idx ? l : { ...l, contacts: [...l.contacts, { id: addPopupProspect!.id, name: addPopupProspect!.fullName, jobTitle: addPopupProspect!.jobTitle ?? '', companyName: addPopupProspect!.companyName ?? '', city: addPopupProspect!.city ?? '', phone: addPopupProspect!.phone ?? '', email: addPopupProspect!.email ?? '', savedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() })
      }
      const allIds = new Set<string>()
      next.forEach(l => l.contacts.forEach(c => allIds.add(c.id)))
      setLists(next)
      setFavorites(allIds)
      setAddPopupProspect(null)
      return
    }
    let targetId = listId
    if (newListName) {
      const created = createList(newListName, newListEmoji ?? 'blue')
      targetId = created.id
    }
    if (isRealProspect && addPopupProspect) {
      addToList(targetId, addPopupProspect)
      const updated = loadLists()
      setLists(updated)
      const allIds = new Set<string>()
      updated.forEach(l => l.contacts.forEach(c => allIds.add(c.id)))
      setFavorites(allIds)
      saveFavorite(account, { targetName: addPopupProspect.fullName, targetCity: addPopupProspect.city ?? undefined }).catch(() => {})
    } else if (!isRealProspect && newListName) {
      setLists(loadLists())
    }
    setAddPopupProspect(null)
  }

  const handleRemoveFromList = (listId: string, contactId: string) => {
    if (isDemoAccount) {
      const next = lists.map(l => l.id !== listId ? l : { ...l, contacts: l.contacts.filter(c => c.id !== contactId), updatedAt: new Date().toISOString() })
      const allIds = new Set<string>()
      next.forEach(l => l.contacts.forEach(c => allIds.add(c.id)))
      setLists(next)
      setFavorites(allIds)
      return
    }
    removeFromList(listId, contactId)
    const updated = loadLists()
    setLists(updated)
    const allIds = new Set<string>()
    updated.forEach(l => l.contacts.forEach(c => allIds.add(c.id)))
    setFavorites(allIds)
  }

  const handleDeleteList = (listId: string) => {
    if (isDemoAccount) {
      setLists(prev => prev.filter(l => l.id !== listId))
      if (activeListId === listId) { setActiveListId(null); setAppView('lists') }
      return
    }
    deleteList(listId)
    const updated = loadLists()
    setLists(updated)
    if (activeListId === listId) { setActiveListId(null); setAppView('lists') }
  }

  const handleToggleFavFromDrawer = (siren: string) => {
    const newFavs = new Set(favorites)
    newFavs.delete(siren)
    setFavorites(newFavs)
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  // Détecte une session d'impersonation admin (?_imp=1 dans l'URL)
  const isImpersonated = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('_imp')

  return (
    <>
    <GlobalSvgDefs />
    <div className="flex min-h-screen bg-[#F5F5F7] dark:bg-[#0d1424]">

      {/* ── Bannière impersonation admin ──────────────────────────────────── */}
      {isImpersonated && (
        <div className="fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-lg">
          <span className="animate-pulse">⚠</span>
          Mode support — vous voyez le compte de{' '}
          <span className="underline underline-offset-2">{account.email}</span>.
          Toute action est réelle.
          <button
            onClick={() => {
              // Supprime le flag et recharge en session normale
              const url = new URL(window.location.href)
              url.searchParams.delete('_imp')
              window.location.replace(url.toString())
            }}
            className="ml-2 rounded-md bg-white/20 px-2 py-0.5 text-xs hover:bg-white/30"
          >
            Quitter
          </button>
        </div>
      )}

      {/* ── Modal maintenance feature flag ───────────────────────────────── */}
      {maintenanceFlag && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setMaintenanceFlag(null)}>
          <div className="mx-6 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-7 text-center" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-center h-14 w-14 rounded-full bg-amber-100 mx-auto mb-4">
              <span className="text-2xl">🔧</span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 mb-2">Maintenance en cours</h3>
            <p className="text-sm text-slate-500 mb-1">
              {maintenanceFlag === 'search' && 'Le moteur de recherche est temporairement indisponible.'}
              {maintenanceFlag === 'phone_unlock' && 'Le déblocage de numéros de téléphone est temporairement suspendu.'}
              {maintenanceFlag === 'email_unlock' && 'Le déblocage d\'adresses email est temporairement suspendu.'}
            </p>
            <p className="text-xs text-slate-400 mb-6">Aucun crédit ne sera consommé. Réessayez dans quelques instants.</p>
            <button onClick={() => setMaintenanceFlag(null)}
              className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-700">
              Compris
            </button>
          </div>
        </div>
      )}

      {/* Hard-lock démo : modal non-fermable quand crédits phone = 0 */}
      {demoLocked && (
        <DemoLockModal onCta={() => window.location.assign('/?pricing=1')} />
      )}

      {/* Toast upsell : déclenché quand phone passe à 3 */}
      {showDemoToast && (
        <DemoToast
          remaining={demoCredits.phone}
          onCta={() => { setShowDemoToast(false); window.location.assign('/?pricing=1') }}
          onClose={() => setShowDemoToast(false)}
        />
      )}

      {/* ── Header mobile (visible < lg) ─────────────────────────────────── */}
      <header className="lg:hidden fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 h-14 bg-white border-b border-gray-200 dark:bg-gray-950 dark:border-gray-800">
        <button onClick={() => setShowMobileMenu(true)} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
          <Menu size={20} />
        </button>
        <button onClick={() => setAppView('search')} className="flex items-center">
          <img src={trouveLogo} alt="trouvé!" className="h-6 w-auto" />
        </button>
        <button onClick={() => setDarkMode(d => !d)} className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800">
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      {/* ── Overlay mobile menu ───────────────────────────────────────────── */}
      {showMobileMenu && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setShowMobileMenu(false)} />
          <aside className="fixed inset-y-0 left-0 z-[60] flex w-72 flex-col bg-white border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800 lg:hidden">
            <div className="flex h-14 items-center justify-between border-b border-gray-100 dark:border-gray-800 px-5">
              <button onClick={() => { setAppView('search'); setShowMobileMenu(false) }} className="flex items-center">
                <img src={trouveLogo} alt="trouvé!" className="h-6 w-auto" />
              </button>
              <button onClick={() => setShowMobileMenu(false)} className="text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"><X size={18} /></button>
            </div>
            <nav className="flex-1 overflow-y-auto space-y-0.5 px-3 pt-3">
              {([{ key: 'search', label: 'Recherche', icon: Search }, { key: 'history', label: 'Historique', icon: History }] as const).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => { setAppView(key); setShowMobileMenu(false) }}
                  className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    appView === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}>
                  {appView === key && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-600" />}
                  <Icon size={15} className={appView === key ? 'text-blue-600' : ''} />{label}
                </button>
              ))}
              <p className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Mes listes</p>
              <button onClick={() => { setAppView('lists'); setShowMobileMenu(false) }}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  appView === 'lists' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}>
                {appView === 'lists' && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-600" />}
                <List size={15} className={appView === 'lists' ? 'text-blue-600' : ''} />
                <span className="flex-1 text-left">Toutes les listes</span>
                {lists.length > 0 && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">{lists.length}</span>}
              </button>
              <button onClick={() => { setShowMobileMenu(false); setAddPopupProspect({ id: '__new_list__' } as ProspectResult) }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800">
                <Plus size={14} /> Nouvelle liste
              </button>
              {account.role === 'admin' && (
                <>
                  <p className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Admin</p>
                  <button onClick={() => { setAppView('admin'); setShowMobileMenu(false) }}
                    className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      appView === 'admin' ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}>
                    {appView === 'admin' && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-purple-600" />}
                    <LayoutDashboard size={15} className={appView === 'admin' ? 'text-purple-600' : ''} />
                    <span className="flex-1 text-left">Dashboard</span>
                    {pendingCount > 0 && (
                      <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>
                    )}
                  </button>
                </>
              )}
            </nav>
          </aside>
        </>
      )}

      {/* ── Sidebar gauche — blanc / gris clair ──────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex w-60 flex-col bg-white border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800">

        {/* Logo + badge démo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800">
          <button onClick={() => setAppView('search')} className="flex items-center transition">
            <img src={trouveLogo} alt="trouvé!" className="h-7 w-auto" />
          </button>
          {isTrialAccount && (
            <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              DÉMO
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pt-4 space-y-0.5">
          {([
            { key: 'search',  label: 'Recherche',  icon: Search },
            { key: 'history', label: 'Historique', icon: History },
            { key: 'bulk',    label: 'Bulk',        icon: Users },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setAppView(key)}
              className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                appView === key
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100'
              }`}>
              {appView === key && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-600" />
              )}
              <Icon size={15} className={appView === key ? 'text-blue-600' : ''} />
              {label}
            </button>
          ))}

          {/* Section Mes listes */}
          <p className="mt-5 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Mes listes</p>
          <button onClick={() => setAppView('lists')}
            className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              appView === 'lists' || appView === 'list-detail'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}>
            {(appView === 'lists' || appView === 'list-detail') && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-blue-600" />
            )}
            <List size={15} className={appView === 'lists' || appView === 'list-detail' ? 'text-blue-600' : ''} />
            <span className="flex-1 text-left">Toutes les listes</span>
            {lists.length > 0 && (
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {lists.length}
              </span>
            )}
          </button>
          {lists.map(list => (
            <button key={list.id} onClick={() => { setActiveListId(list.id); setAppView('list-detail') }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                appView === 'list-detail' && activeListId === list.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}>
              {isListColor(list.emoji)
                ? <ListColorDot color={list.emoji} size="sm" />
                : <span className="text-sm leading-none">{list.emoji}</span>}
              <span className="flex-1 truncate text-left text-xs">{list.name}</span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800">{list.contacts.length}</span>
            </button>
          ))}
          <button onClick={() => setAddPopupProspect({ id: '__new_list__' } as ProspectResult)}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800">
            <Plus size={14} /> Nouvelle liste
          </button>

          {/* Admin (role=admin uniquement) */}
          {account.role === 'admin' && (
            <>
              <p className="mt-5 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Admin</p>
              <button onClick={() => setAppView('admin')}
                className={`relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                  appView === 'admin'
                    ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}>
                {appView === 'admin' && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-purple-600" />
                )}
                <LayoutDashboard size={15} className={appView === 'admin' ? 'text-purple-600' : ''} />
                <span className="flex-1 text-left">Dashboard</span>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingCount}</span>
                )}
              </button>
            </>
          )}
        </nav>

        {/* ── Bas de sidebar : crédits + profil ────────────────────────────── */}
        <div className="mt-auto flex flex-col gap-0">

          {/* Jauge crédits démo */}
          {isTrialAccount && (
            <div className="px-4 pt-4">
              <DemoCreditsBar phone={demoCredits.phone} email={demoCredits.email} />
            </div>
          )}

          {/* Compteurs de clés */}
          {(creditBalance || ((accessLevel === 'demo' || accessLevel === 'limited') && maxSearches !== undefined)) && (
            <div className="px-4 pt-5 pb-4 border-t border-gray-100 dark:border-gray-800">
              {creditBalance && (
                <div className="flex flex-col gap-3">

                  {/* Compteur clé bleue */}
                  <div className="flex items-center justify-center gap-5">
                    <div className="flex items-center gap-2">
                      <img src={keyBlueImg} alt="clé"
                        style={{ height: '44px', width: 'auto' }} onMouseEnter={bounceKey} />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                        {creditBalance.unlimited ? '∞' : creditBalance.phoneCredits}
                      </span>
                    </div>
                  </div>

                  {/* Bouton Retour Admin — visible seulement pour les admins */}
                  {onReturnAdmin && (
                    <button onClick={onReturnAdmin}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-white bg-[#124bd2] border border-[#124bd2] rounded-lg shadow-sm hover:bg-[#0b3fbc] active:scale-95 transition-all duration-200">
                      ← Retour Admin
                    </button>
                  )}

                  {/* Bouton Recharger — outline ghost */}
                  <button onClick={() => setShowBuyKeys(true)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-[#124bd2] hover:text-[#124bd2] hover:bg-blue-50 active:scale-95 transition-all duration-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-blue-500 dark:hover:text-blue-400">
                    <Plus size={14} />
                    Recharger
                  </button>

                </div>
              )}

              {(accessLevel === 'demo' || accessLevel === 'limited') && maxSearches !== undefined && (
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-400">Recherches démo</span>
                  <span className="text-xs font-bold tabular-nums text-gray-700">{Math.max(0, maxSearches - demoSearchCount)} / {maxSearches}</span>
                </div>
              )}
            </div>
          )}

          {/* Profil utilisateur */}
          <div className="border-t border-gray-100 dark:border-gray-800 px-3 py-3">
            <UserMenu
              account={account}
              onLogout={onLogout}
              onOpenAccount={onOpenAccount}
              onOpenProspection={() => setShowProspectionPanel(true)}
              placement="above"
            />
          </div>

        </div>

      </aside>

      {/* ── Zone principale ──────────────────────────────────────────────── */}
      <div className="lg:ml-60 flex flex-1 flex-col pt-14 lg:pt-0 pb-16 lg:pb-0">

        {/* Bandeau notification admin — demandes en attente */}
        {account.role === 'admin' && !adminBannerDismissed && pendingCount > 0 && (
          <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-5 py-3 dark:bg-amber-950/30 dark:border-amber-800">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
              <Bell size={14} className="text-amber-600 dark:text-amber-400" />
            </div>
            <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
              <span className="font-semibold">{pendingCount} demande{pendingCount > 1 ? 's' : ''} d'accès</span> en attente de validation.
            </p>
            <button
              onClick={() => setAppView('admin')}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
            >
              Voir le dashboard
            </button>
            <button
              onClick={() => setAdminBannerDismissed(true)}
              className="shrink-0 rounded-lg p-1.5 text-amber-500 transition hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Vue Historique */}
        {appView === 'history' && (
          <HistoryPage
            account={account}
            embedded
            onGoSearch={() => setAppView('search')}
            onReplay={(q, dept, code) => {
              setAppView('search')
              setInputValue(q); setQuery(q); setDepartment(dept); setActivityCode(code)
              doSearch({ query: q, department: dept, activityCode: code, activeOnly })
            }}
          />
        )}

        {/* Vue Mes listes */}
        {appView === 'lists' && (
          <ListsView lists={lists} onOpenList={(id) => { setActiveListId(id); setAppView('list-detail') }}
            onExport={exportListCSV} onDelete={handleDeleteList} onGoSearch={() => setAppView('search')}
            onNewList={() => setAddPopupProspect({ id: '__new_list__' } as ProspectResult)} />
        )}

        {/* Vue détail d'une liste */}
        {appView === 'list-detail' && activeListId && (() => {
          const list = lists.find(l => l.id === activeListId)
          if (!list) return null
          return <SingleListView list={list} onBack={() => setAppView('lists')}
            onGoSearch={() => setAppView('search')}
            onExport={() => exportListCSV(list)} onRemove={(cid) => handleRemoveFromList(activeListId, cid)} />
        })()}

        {/* Vue Admin — inaccessible : les admins sont redirigés vers CRM au login */}

        {/* Vue Bulk */}
        {appView === 'bulk' && (
          <BulkSearchView
            account={account}
            creditBalance={creditBalance}
            onCreditRefresh={() => {
              if (!account.id.startsWith('demo-') && !account.id.startsWith('preview-')) {
                getCreditBalance().then(b => { if (b !== null) setCreditBalance(b) }).catch(() => {})
              }
            }}
            onOpenBuyKeys={() => setShowBuyKeys(true)}
          />
        )}

        {/* Vue Recherche */}
        {appView === 'search' && (
          <div className="flex flex-1 flex-col overflow-x-hidden">

            {/* En-tête 3 colonnes */}
            <div className="mb-7 flex flex-wrap items-center justify-between gap-2 px-6 pt-8 lg:px-10">
              {/* Gauche — titre */}
              <div>
                <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-[#124bd2] dark:text-blue-400">
                  Recherche professionnelle
                </p>
                <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-[#07113d] dark:text-slate-100">
                  {hasSearched && query ? `"${query}"` : 'Recherche par indices'}
                </h1>
              </div>

              {/* Droite — contrôles */}
              <div className="flex items-center gap-2">
                <ThemeToggle size="sm" />
              </div>
            </div>

            <div className="flex flex-1 flex-col px-6 py-8 lg:px-10">

            {/* Bandeau accès restreint */}
            {accessLevel !== 'full' && maxSearches !== undefined && (
              <div className="mb-6">
                <DemoBanner
                  accessLevel={accessLevel}
                  used={demoSearchCount}
                  max={maxSearches}
                  onCta={() => setShowConversionModal(true)}
                />
              </div>
            )}

            {/* ── Carte de recherche ── */}
            <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <form onSubmit={handleSearch} className="p-6">
                {/* Champs + bouton */}
                <div className="flex gap-3 flex-wrap sm:flex-nowrap">
                  <div className="relative flex-[2] min-w-[200px]">
                    <UserCircle2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={identityInput}
                      onChange={e => { setIdentityInput(e.target.value); setPage(1) }}
                      placeholder="Jean Dupont ou Dupont Jean…"
                      autoComplete="off"
                      className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
                    />
                  </div>
                  <div className="relative flex-1 min-w-[140px]">
                    <Phone size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="tel"
                      value={searchTel}
                      onChange={e => { setSearchTel(e.target.value); setPage(1) }}
                      placeholder="Téléphone / Mobile"
                      autoComplete="off"
                      className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
                    />
                  </div>
                  <button type="submit"
                    disabled={isLoading || (maxSearches !== undefined && demoSearchCount >= maxSearches)}
                    className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">
                    {isLoading ? <RefreshCw size={14} className="animate-spin" /> : <><Search size={14} /> Rechercher</>}
                  </button>
                </div>

                {/* Ligne adresse */}
                <div className="mt-3">
                  <AddressAutocomplete
                    value={advAddress}
                    placeholder="Rechercher par adresse… ex: 10 Rue de la Paix Paris"
                    onSelect={result => {
                      setAdvAddress(result.adresse)
                      setAdvCity(result.ville)
                      setZipCode(result.codePostal)
                      const ident = identityInput.trim()
                      doSearch({
                        query: ident,
                        identity: ident || undefined,
                        address: result.adresse,
                        city: result.ville,
                        zipCode: result.codePostal,
                        tel: searchTel,
                        searchMode, department, activityCode, activeOnly,
                        employeeRange, legalForm, birthYear: advBirthYear,
                      })
                    }}
                  />
                </div>

                {/* Recherche avancée — toggle + effacer */}
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowFilters(v => !v)}
                      className="flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-blue-600"
                    >
                      <SlidersHorizontal size={13} />
                      <span>Recherche avancée</span>
                      {activeFiltersCount > 0 && (
                        <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                          {activeFiltersCount}
                        </span>
                      )}
                      {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {activeFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-100 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40"
                      >
                        <X size={11} /> Effacer les filtres
                      </button>
                    )}
                  </div>
                  {results.length > 0 && (
                    <button onClick={() => exportProspectsCSV(results, query)}
                      className="flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200">
                      <Download size={13} /> Exporter CSV
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Chips filtres actifs */}
            {activeFiltersCount > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {advFirstName   && <FilterChip label={`Prénom : ${advFirstName}`}       onRemove={() => clearFilter({ advFirstName: '' })} />}
                {advLastName    && <FilterChip label={`Nom : ${advLastName}`}            onRemove={() => clearFilter({ advLastName: '' })} />}
                {advBirthYear   && <FilterChip label={`Né(e) en ${advBirthYear}`}        onRemove={() => clearFilter({ advBirthYear: '' })} />}
                {advJobTitle    && <FilterChip label={`Poste : ${advJobTitle}`}          onRemove={() => clearFilter({ advJobTitle: '' })} />}
                {advCity        && <FilterChip label={`Ville : ${advCity}`}              onRemove={() => clearFilter({ advCity: '' })} />}
                {advAddress     && <FilterChip label={`Adresse : ${advAddress}`}         onRemove={() => clearFilter({ advAddress: '' })} />}
                {zipCode        && <FilterChip label={`CP : ${zipCode}`}                 onRemove={() => clearFilter({ zipCode: '' })} />}
                {department     && <FilterChip label={departmentLabel(department)}        onRemove={() => clearFilter({ department: '' })} />}
                {advPhone       && <FilterChip label={`Tél : ${advPhone}`}               onRemove={() => clearFilter({ advPhone: '' })} />}
                {advEmail       && <FilterChip label={`Email : ${advEmail}`}             onRemove={() => clearFilter({ advEmail: '' })} />}
                {advCompanyName && <FilterChip label={`Société : ${advCompanyName}`}     onRemove={() => clearFilter({ advCompanyName: '' })} />}
                {activityCode   && <FilterChip label={`NAF : ${activityCode}`}           onRemove={() => clearFilter({ activityCode: '' })} />}
                {employeeRange  && <FilterChip label={`Effectif : ${employeeRange}`}     onRemove={() => clearFilter({ employeeRange: '' })} />}
                {legalForm      && <FilterChip label={`Forme : ${legalForm}`}            onRemove={() => clearFilter({ legalForm: '' })} />}
                {advLinkedin    && <FilterChip label={`LinkedIn : ${advLinkedin}`}       onRemove={() => clearFilter({ advLinkedin: '' })} />}
              </div>
            )}

            {/* Panneau de recherche avancée (conservé) */}
            {showFilters && (
              <AdvancedFilters
                // Identité professionnelle
                firstName={advFirstName}       setFirstName={v => { setAdvFirstName(v); setPage(1) }}
                lastName={advLastName}         setLastName={v => { setAdvLastName(v); setPage(1) }}
                jobTitle={advJobTitle}         setJobTitle={v => { setAdvJobTitle(v); setPage(1) }}
                birthYear={advBirthYear}       setBirthYear={v => { setAdvBirthYear(v); setPage(1) }}
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
                  const ident = identityInput.trim()
                  const q = [ident || [advFirstName, advLastName].filter(Boolean).join(' '),
                              advJobTitle, advCity, advAddress, advPhone, advEmail, advCompanyName, advLinkedin]
                    .map(s => s.trim()).filter(Boolean).join(' ')
                  setQuery(ident || inputValue)
                  doSearch({
                    query: q,
                    identity: ident || undefined,
                    nom:    !ident ? advLastName  : undefined,
                    prenom: !ident ? advFirstName : undefined,
                    city: advCity, address: advAddress, tel: searchTel || advPhone, searchMode,
                    department, activityCode, activeOnly, zipCode, employeeRange, legalForm,
                    birthYear: advBirthYear,
                  })
                }}
                onAddressSelect={result => {
                  setAdvAddress(result.adresse)
                  setAdvCity(result.ville)
                  setZipCode(result.codePostal)
                  const ident = identityInput.trim()
                  doSearch({
                    query: ident,
                    identity: ident || undefined,
                    address: result.adresse,
                    city: result.ville,
                    zipCode: result.codePostal,
                    tel: searchTel || advPhone,
                    searchMode, department, activityCode, activeOnly,
                    employeeRange, legalForm, birthYear: advBirthYear,
                  })
                }}
                onReset={handleResetFilters}
              />
            )}

            {/* Toolbar résultats */}
            <div className="mt-5 mb-3 flex items-center justify-between min-h-[28px]">
              <div>
                {hasSearched && !isLoading && (
                  <p className="flex items-baseline gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <AnimateNumber
                      value={total}
                      duration={400}
                      className="font-semibold text-slate-800 dark:text-slate-100"
                    />
                    <span>résultat{total > 1 ? 's' : ''}</span>
                    {query && <span> pour <em className="text-slate-700 dark:text-slate-200">"{query}"</em></span>}
                    {department && <span> · {departmentLabel(department)}</span>}
                  </p>
                )}
              </div>
              {hasSearched && !isLoading && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500">Consultation journalisée</span>
                  <select value={perPage} onChange={e => { const pp = Number(e.target.value); setPerPage(pp); doSearch({ query: buildQuery(), department, activityCode, activeOnly, zipCode, employeeRange, legalForm, perPage: pp }, 1) }}
                    className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                    {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / page</option>)}
                  </select>
                  <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
                    <button onClick={() => setViewMode('grid')} className={`rounded-md p-1.5 transition ${viewMode === 'grid' ? 'bg-[#124bd2] text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}><LayoutGrid size={13} /></button>
                    <button onClick={() => setViewMode('list')} className={`rounded-md p-1.5 transition ${viewMode === 'list' ? 'bg-[#124bd2] text-white' : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'}`}><List size={13} /></button>
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

            {/* Empty state — recherche non lancée */}
            {!isLoading && !hasSearched && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#124bd2] dark:bg-blue-950/30">
                  <Search size={28} />
                </div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Commencez votre prospection</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  Recherchez par nom, poste, entreprise, téléphone ou ville.
                </p>
              </div>
            )}

            {/* Aucun résultat / base non encore importée */}
            {!isLoading && hasSearched && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-500">
                  <Database size={28} />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Aucun prospect trouvé</h3>
                <p className="mt-2 max-w-sm text-sm text-slate-400">
                  La base de données est en cours d'importation.<br />
                  Elle sera disponible très prochainement.
                </p>
                <button
                  onClick={() => {
                    setInputValue(''); setIdentityInput(''); setQuery('')
                    setAdvFirstName(''); setAdvLastName(''); setAdvJobTitle(''); setAdvBirthYear('')
                    setAdvCity(''); setAdvAddress(''); setAdvPhone(''); setAdvEmail('')
                    setAdvCompanyName(''); setAdvLinkedin('')
                    setDepartment(''); setActivityCode(''); setActiveOnly(true)
                    setZipCode(''); setEmployeeRange(''); setLegalForm('')
                    doSearch({ query: '', department: '', activityCode: '', activeOnly: true, zipCode: '', employeeRange: '', legalForm: '' })
                  }}
                  className="mt-6 rounded-xl border border-slate-200 px-5 py-2 text-sm font-medium text-slate-500 transition hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-700 dark:text-slate-400"
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
                        viewMode="grid" onDetail={setSelectedCompany} accessLevel={accessLevel}
                        canUnlock={accessLevel === 'full'} onUnlock={handleUnlock} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {results.map(p => (
                      <ProspectCard key={p.id} prospect={p}
                        isFavorite={favorites.has(p.id)} onToggleFavorite={toggleFavorite}
                        viewMode="list" onDetail={setSelectedCompany} accessLevel={accessLevel}
                        canUnlock={accessLevel === 'full'} onUnlock={handleUnlock} />
                    ))}
                  </div>
                )}

                {/* Export bas de page */}
                <div className="mt-4 flex justify-end">
                  <button onClick={() => exportProspectsCSV(results, query)}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <Download size={13} />
                    Exporter ces {results.length} prospects en CSV
                  </button>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-2">
                    <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-[#124bd2] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                      const pg = i + Math.max(1, Math.min(page - 3, totalPages - 6))
                      return (
                        <button key={pg} onClick={() => handlePageChange(pg)}
                          className={`flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-medium transition ${pg === page ? 'border-[#124bd2] bg-[#124bd2] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {pg}
                        </button>
                      )
                    })}
                    <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-blue-300 hover:text-[#124bd2] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
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
          </div>
        )}
      </div>

      {/* Slide-over détail prospect */}
      {selectedCompany && accessLevel !== 'limited' && (
        <ProspectSlideOver
          prospect={selectedCompany}
          onClose={() => setSelectedCompany(null)}
          canUnlock={accessLevel === 'full'}
          onUnlock={handleUnlock}
          onAddressUpdate={async (ids, adresse, codePostal, ville) => {
            const supabase = getSupabaseClient()
            const { error } = await supabase
              .from('contacts')
              .update({ adresse, code_postal: codePostal, ville })
              .in('id', ids.map(Number))
            if (error) throw new Error(error.message)
            setSelectedCompany(prev => prev ? { ...prev, address: adresse, zipCode: codePostal, city: ville } : null)
          }}
        />
      )}

      {/* Modal de conversion (fin de quota démo/limité) */}
      {showConversionModal && (
        <ConversionModal
          accessLevel={accessLevel}
          account={account}
          onClose={() => setShowConversionModal(false)}
          onLogout={onLogout}
          onRequestDemo={() => { setShowConversionModal(false); setShowDemoRequestModal(true) }}
        />
      )}

      {showDemoRequestModal && (
        <DemoRequestModal
          account={account}
          onClose={() => setShowDemoRequestModal(false)}
        />
      )}

      {/* Popup ajout à une liste */}
      {addPopupProspect && (
        <AddToListPopup
          prospect={addPopupProspect}
          lists={lists}
          onConfirm={handleAddToListConfirm}
          onClose={() => setAddPopupProspect(null)}
        />
      )}

      {/* Overlay transition recherche */}
      {searchTransition !== 'hidden' && (
        <div
          className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-8"
          style={{
            background: '#07113d',
            opacity: searchTransition === 'leaving' ? 0 : 1,
            transition: `opacity ${searchTransition === 'leaving' ? '450ms' : '300ms'} cubic-bezier(0.4,0,0.2,1)`,
          }}
        >
          <div className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(27,84,255,0.18) 0%, transparent 70%)' }} />

          <div className="relative flex h-40 w-40 items-center justify-center">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
              <defs>
                <linearGradient id="srGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#3b8eff" />
                  <stop offset="100%" stopColor="#1B54FF" />
                </linearGradient>
              </defs>
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
              <circle cx="80" cy="80" r="70" fill="none" stroke="url(#srGrad)" strokeWidth="2.5" strokeLinecap="round"
                style={{ strokeDasharray: 440, animation: 'demoRingFill 1.1s 0.22s cubic-bezier(0.4,0,0.2,1) forwards' }} />
            </svg>
            <svg width="72" height="72" viewBox="0 0 100 100" className="relative z-10"
              style={{ filter: 'drop-shadow(0 0 28px rgba(27,84,255,0.6))', animation: 'demoLogoIn 0.45s 0.08s cubic-bezier(0.34,1.56,0.64,1) forwards', opacity: 0 }}>
              <rect x="21" y="12" width="19" height="76" rx="9.5" fill="white" />
              <rect x="8"  y="33" width="45" height="18" rx="9"   fill="white" />
              <rect x="66" y="12" width="17" height="50" rx="8.5" fill="white" />
              <circle cx="74.5" cy="84" r="8.5" fill="white" />
            </svg>
          </div>

          {transitionQuery && (
            <div className="text-center" style={{ animation: 'demoTextIn 0.4s 0.3s ease both' }}>
              <p className="mb-1 text-base font-bold text-white">"{transitionQuery}"</p>
              <p className="flex items-center justify-center gap-1 text-xs font-semibold tracking-wider text-white/60">
                Analyse en cours
                <span style={{ animation: 'demoDotBounce 1.2s 0.5s infinite' }}>.</span>
                <span style={{ animation: 'demoDotBounce 1.2s 0.7s infinite' }}>.</span>
                <span style={{ animation: 'demoDotBounce 1.2s 0.9s infinite' }}>.</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Aide à la prospection */}
      {showProspectionPanel && (
        <ProspectionPanel
          onClose={() => setShowProspectionPanel(false)}
          onApply={(recipe) => {
            setInputValue(recipe.query)
            setQuery(recipe.query)
            if (recipe.department) setDepartment(recipe.department)
            if (recipe.activityCode) setActivityCode(recipe.activityCode)
            setShowProspectionPanel(false)
            setAppView('search')
            doSearch({
              query: recipe.query,
              department: recipe.department ?? department,
              activityCode: recipe.activityCode ?? activityCode,
              activeOnly,
              zipCode,
              employeeRange,
              legalForm,
            })
          }}
        />
      )}

      {/* ── Bottom nav mobile ────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-white/[0.06] bg-[#07113d] py-1 pb-[env(safe-area-inset-bottom,0px)]">
        {([
          { key: 'search',  label: 'Recherche', icon: Search },
          { key: 'history', label: 'Historique', icon: History },
          { key: 'lists',   label: 'Listes',     icon: Plus },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setAppView(key)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${appView === key ? 'text-white' : 'text-white/40'}`}>
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <BuyKeysModal open={showBuyKeys} onClose={() => setShowBuyKeys(false)} />
    </div>
    </>
  )
}
