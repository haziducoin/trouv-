import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Search, SlidersHorizontal, Star, ChevronLeft, ChevronRight,
  Building2, MapPin, Hash, Users, LogOut, X,
  Zap, RefreshCw, ExternalLink, LayoutGrid, List,
  ShieldCheck, AlertCircle, Download, Clock,
  ArrowRight, Globe, FileText, Info,
  Moon, Sun, History, ChevronUp, ChevronDown,
  UserCircle2, LayoutDashboard, UserPlus, FolderSearch, MessageSquare, CreditCard,
  Phone, Mail, Database, Calendar, Briefcase, Plus, Lock, Menu, Key,
} from 'lucide-react'
type AppView = 'search' | 'history' | 'lists' | 'list-detail'
import trouveLogo from '@/assets/trouve-logo.png'
import { KeyIcon } from '@/components/ui/KeyIcon'
import { DEPARTMENTS, TYPE_LABELS, EMPLOYEE_RANGES, LEGAL_FORMS } from '@/lib/searchApi'
import {
  searchProspects, exportProspectsCSV,
  unlockContactField, getCreditBalance, UnlockError,
  type ProspectResult, type ProspectSearchParams, type CreditBalance,
} from '@/lib/prospectApi'
import { formatBirthContext } from '@/lib/privacy'
import { recordSearch, saveFavorite, createDemoRequest, type Account, type DemoRequest } from '@/lib/accountStore'
import HistoryPage from './HistoryPage'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { AnimateNumber } from '@/components/ui/animated-blur-number'

// ─── Props ────────────────────────────────────────────────────────────────────
export type AccessLevel = 'full' | 'demo' | 'trial' | 'limited'

interface SearchPageProps {
  account:       Account
  onLogout:      () => void
  onOpenAccount: (tab?: string) => void
  accessLevel?:  AccessLevel
  maxSearches?:  number
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
            <button
              onClick={onLogout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
              <LogOut size={14} /> Se déconnecter
            </button>
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
        <button onClick={onLogout}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
          <LogOut size={14} /> Se déconnecter
        </button>
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
function ProspectSlideOver({ prospect, onClose, canUnlock = false, onUnlock }: { prospect: ProspectResult; onClose: () => void; canUnlock?: boolean; onUnlock?: (p: ProspectResult, field: 'phone' | 'email') => Promise<void> }) {
  const noopUnlock = async () => {}
  const birthContext = formatBirthContext(prospect.birthYear, prospect.birthCity)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl animate-in slide-in-from-right duration-200 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-6 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-bold ${prospectAccent(prospect.jobTitle)}`}>
              {prospectInitials(prospect.fullName)}
            </div>
            <div>
              <h2 className="font-bold leading-snug text-slate-800 dark:text-slate-100">{prospect.fullName}</h2>
              {prospect.jobTitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{prospect.jobTitle}</p>}
              {prospect.companyName && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[#124bd2]">
                  <Building2 size={11} /> {prospect.companyName}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="mt-0.5 rounded-xl p-1.5 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div className="flex-1 space-y-5 p-6">

          {/* Coordonnées */}
          <section>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Coordonnées</p>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/50">
              <ContactUnlock prospect={prospect} kind="phone" canUnlock={canUnlock} onUnlock={onUnlock ?? noopUnlock} />
              <ContactUnlock prospect={prospect} kind="email" canUnlock={canUnlock} onUnlock={onUnlock ?? noopUnlock} />
              {!prospect.hasPhone && !prospect.hasEmail && (
                <p className="text-xs text-slate-400">Aucune coordonnée disponible</p>
              )}
            </div>
          </section>

          {/* Entreprise */}
          {prospect.companyName && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Entreprise</p>
              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/50">
                <Row icon={<Building2 size={13} className="text-slate-300" />} label="Employeur" value={prospect.companyName} />
              </div>
            </section>
          )}

          {/* Localisation */}
          {(prospect.address || prospect.city || prospect.country || birthContext) && (
            <section>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Localisation</p>
              <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-800/50">
                {prospect.address && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Adresse" value={prospect.address} />}
                {prospect.city && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Commune" value={`${prospect.city}${prospect.zipCode ? ` (${prospect.zipCode})` : ''}`} />}
                {prospect.country && <Row icon={<MapPin size={13} className="text-slate-300" />} label="Pays" value={prospect.country} />}
                {birthContext && <Row icon={<UserCircle2 size={13} className="text-slate-300" />} label="Homonymie" value={birthContext} />}
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
  const has      = kind === 'phone' ? prospect.hasPhone : prospect.hasEmail
  const unlocked = kind === 'phone' ? prospect.phoneUnlocked : prospect.emailUnlocked
  const value    = kind === 'phone' ? prospect.phone : prospect.email
  const Icon     = kind === 'phone' ? Phone : Mail
  if (!has) return null

  if (unlocked && value) {
    const href = kind === 'phone' ? `tel:${value.replace(/\s/g, '')}` : `mailto:${value}`
    return (
      <a href={href} onClick={e => e.stopPropagation()}
        className="inline-flex max-w-full items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-[#124bd2] ring-1 ring-blue-100/80 transition hover:bg-blue-100 dark:bg-blue-950/35 dark:text-blue-300 dark:ring-blue-900/60">
        <Icon size={14} /> <span className="truncate">{value}</span>
      </a>
    )
  }

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onUnlock(prospect, kind) } finally { setBusy(false) }
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-slate-100 dark:bg-slate-800 dark:ring-slate-700">
      <Icon size={14} className="text-slate-300 dark:text-slate-600" />
      <span className="font-semibold tabular-nums text-slate-400">{value}</span>
      <button type="button" onClick={click} disabled={busy}
        className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60">
        {busy
          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
          : <KeyIcon kind={kind} size={22} className="text-white" />}
        {canUnlock ? (kind === 'phone' ? 'Débloquer' : 'Débloquer') : 'Voir les offres'}
      </button>
    </span>
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

  if (viewMode === 'list') {
    const isLimited = accessLevel === 'limited'
    return (
      <div className={`group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 transition dark:border-slate-800 dark:bg-slate-900 ${isLimited ? 'cursor-default' : 'hover:border-blue-200 hover:shadow-sm dark:hover:border-blue-900'}`}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${isLimited ? 'bg-slate-100 dark:bg-slate-800' : accent}`}>
          {isLimited ? '' : initials}
        </div>
        <div className="min-w-0 flex-1">
          {isLimited ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><BlurPill w="w-32" /><BlurPill w="w-20" /></div>
              <BlurPill w="w-40" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => onDetail(prospect)}
                  className="font-semibold text-slate-800 hover:text-[#124bd2] hover:underline text-left dark:text-slate-100">
                  {prospect.fullName}
                </button>
                {prospect.jobTitle && <span className="text-xs text-slate-400">{prospect.jobTitle}</span>}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">
                {prospect.companyName}{prospect.companyName && prospect.city ? ' · ' : ''}{prospect.city}
                {prospect.zipCode ? ` (${prospect.zipCode})` : ''}
              </p>
            </>
          )}
        </div>
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {isLimited ? (
            <><BlurPill w="w-24" /><BlurPill w="w-28" /></>
          ) : (
            <>
              <ContactUnlock prospect={prospect} kind="phone" canUnlock={canUnlock} onUnlock={onUnlock ?? noop} />
              <ContactUnlock prospect={prospect} kind="email" canUnlock={canUnlock} onUnlock={onUnlock ?? noop} />
            </>
          )}
        </div>
        {!isLimited && (
          <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={() => onToggleFavorite(prospect)}
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
            >
              <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button onClick={() => onDetail(prospect)}
              className="rounded-lg p-1.5 text-slate-300 transition hover:text-[#124bd2]">
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    )
  }

  // Vue grille
  const isLimited = accessLevel === 'limited'
  return (
    <div
      className={`card-lift group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 transition dark:border-slate-800 dark:bg-slate-900 ${isLimited ? 'cursor-default' : 'cursor-pointer hover:border-blue-200 hover:shadow-sm dark:hover:border-blue-900'}`}
      onClick={() => !isLimited && onDetail(prospect)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isLimited ? 'bg-slate-100 dark:bg-slate-800' : accent}`}>
          {isLimited ? <Lock size={14} className="text-slate-300 dark:text-slate-600" /> : initials}
        </div>
        {!isLimited && (
          <button
            onClick={e => { e.stopPropagation(); onToggleFavorite(prospect) }}
            aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`rounded-lg p-1.5 transition ${isFavorite ? 'text-amber-500' : 'text-slate-200 group-hover:text-slate-300 hover:!text-amber-400'}`}
          >
            <Star size={15} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>

      {/* Identité */}
      <div className="mt-3">
        {isLimited ? (
          <div className="space-y-1.5">
            <BlurPill w="w-36" h="h-4" />
            <BlurPill w="w-24" />
            <BlurPill w="w-28" />
          </div>
        ) : (
          <>
            <p className="font-semibold leading-snug text-slate-800 group-hover:text-[#124bd2] transition dark:text-slate-100">{prospect.fullName}</p>
            {prospect.jobTitle && <p className="mt-0.5 text-xs text-slate-400">{prospect.jobTitle}</p>}
            {prospect.companyName && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[#124bd2]">
                <Building2 size={10} className="shrink-0" /> {prospect.companyName}
              </p>
            )}
          </>
        )}
      </div>

      <div className="my-3 h-px bg-slate-100 dark:bg-slate-800" />

      {/* Coordonnées */}
      {isLimited ? (
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2"><Phone size={11} className="shrink-0 text-slate-200 dark:text-slate-700" /><BlurPill w="w-28" /></div>
          <div className="flex items-center gap-2"><Mail size={11} className="shrink-0 text-slate-200 dark:text-slate-700" /><BlurPill w="w-32" /></div>
          <div className="flex items-center gap-2"><MapPin size={11} className="shrink-0 text-slate-200 dark:text-slate-700" /><BlurPill w="w-20" /></div>
        </div>
      ) : (
        <div className="flex-1 space-y-2 text-xs text-slate-500 dark:text-slate-400">
          {/* Téléphone */}
          {prospect.hasPhone
            ? <div><ContactUnlock prospect={prospect} kind="phone" canUnlock={canUnlock} onUnlock={onUnlock ?? noop} /></div>
            : <ContactChip icon={<Phone size={14} />} value="—" muted />}

          {/* Email */}
          {prospect.hasEmail
            ? <div><ContactUnlock prospect={prospect} kind="email" canUnlock={canUnlock} onUnlock={onUnlock ?? noop} /></div>
            : <ContactChip icon={<Mail size={14} />} value="—" muted />}

          {/* City */}
          {prospect.city && (
            <p className="flex items-center gap-2">
              <MapPin size={11} className="shrink-0 text-slate-300" />
              <span>{prospect.city}{prospect.zipCode ? ` (${prospect.zipCode})` : ''}</span>
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4">
        {isLimited ? (
          <div className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-100 py-2 text-xs font-medium text-slate-300 dark:border-slate-800 dark:text-slate-600">
            <Lock size={11} /> Accès restreint
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onDetail(prospect) }}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-200 hover:text-[#124bd2] hover:bg-blue-50 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
          >
            Voir la fiche <ArrowRight size={12} />
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
        {lists.map(list => (
          <div key={list.id} onClick={() => onOpenList(list.id)}
            className="card-lift flex cursor-pointer flex-col rounded-2xl border border-slate-200/80 bg-white p-5 transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-2xl">{list.emoji}</span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">{list.contacts.length} contact{list.contacts.length !== 1 ? 's' : ''}</span>
            </div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{list.name}</p>
            <p className="mt-0.5 text-xs text-slate-400">Modifiée {new Date(list.updatedAt).toLocaleDateString('fr-FR')}</p>
            <div className="mt-3 flex -space-x-1.5">
              {list.contacts.slice(0, 4).map(c => (
                <div key={c.id} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-blue-100 text-[9px] font-bold text-blue-700 dark:border-slate-900">
                  {prospectInitials(c.name)}
                </div>
              ))}
              {list.contacts.length > 4 && <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-bold text-slate-500">+{list.contacts.length - 4}</div>}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={e => { e.stopPropagation(); onExport(list) }}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Download size={11} /> CSV
              </button>
              <button onClick={e => { e.stopPropagation(); if (confirm(`Supprimer "${list.name}" ?`)) onDelete(list.id) }}
                className="flex items-center justify-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-500 transition hover:bg-red-100">
                <X size={11} />
              </button>
            </div>
          </div>
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
        <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[180px]">{list.emoji} {list.name}</span>
      </nav>
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#124bd2] transition font-medium">
          <ChevronLeft size={13} /> Mes listes
        </button>
        <span className="text-slate-300">|</span>
        <span className="text-xl">{list.emoji}</span>
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
  const [newEmoji, setNewEmoji] = useState('📋')
  const [selected, setSelected] = useState<string>('')
  const isNewList = prospect?.id === '__new_list__'
  const EMOJIS = ['📋','🏗','🏠','🏥','💼','🎯','🌍','⭐','🔑','📊']

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
                <span className="text-base">{l.emoji}</span>
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
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => setNewEmoji(e)}
                className={`rounded-lg p-1.5 text-base transition ${newEmoji === e ? 'bg-blue-100 ring-1 ring-blue-400' : 'hover:bg-slate-100'}`}>{e}</button>
            ))}
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
function UserMenu({ account, onLogout, onOpenAccount, onOpenProspection }: { account: Account; onLogout: () => void; onOpenAccount: (tab?: string) => void; onOpenProspection: () => void }) {
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
        className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white pl-1.5 pr-3 py-1.5 transition hover:border-blue-200 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800"
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
  // Identité professionnelle
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
    city, setCity, address, setAddress, zipCode, setZipCode, department, setDepartment,
    phone, setPhone, email, setEmail,
    companyName, setCompanyName, activityCode, setActivityCode, employeeRange, setEmployeeRange, legalForm, setLegalForm,
    linkedin, setLinkedin,
    onSearch, onReset,
  } = props

  const [open, setOpen] = useState<string[]>(['civil', 'origin', 'contact', 'address', 'networks', 'other'])
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
        </div>
      </AdvSection>

      {/* 2 — Entreprise */}
      <AdvSection id="origin" icon={<Calendar size={15} />} title="Entreprise"
        color="bg-violet-50 text-violet-600" open={open.includes('origin')} onToggle={() => tog('origin')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="Nom de la société" value={companyName} onChange={setCompanyName} onEnter={onSearch} placeholder="Acme Immobilier" />
          <AdvSelect label="Secteur d'activité (NAF)" value={activityCode} onChange={v => { setActivityCode(v); onSearch() }}>
            <option value="">Tous les secteurs</option>
            {Object.entries(TYPE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </AdvSelect>
          <AdvSelect label="Taille de l'entreprise" value={employeeRange} onChange={v => { setEmployeeRange(v); onSearch() }}>
            <option value="">Toutes tailles</option>
            {EMPLOYEE_RANGES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
          </AdvSelect>
          <AdvSelect label="Forme juridique" value={legalForm} onChange={v => { setLegalForm(v); onSearch() }}>
            <option value="">Toutes formes</option>
            {LEGAL_FORMS.map(f => <option key={f.code} value={f.code}>{f.label}</option>)}
          </AdvSelect>
        </div>
      </AdvSection>

      {/* 3 — Coordonnées */}
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

      {/* 5 — Réseaux publics */}
      <AdvSection id="networks" icon={<Briefcase size={15} />} title="Réseaux publics"
        color="bg-indigo-50 text-indigo-600" open={open.includes('networks')} onToggle={() => tog('networks')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AdvInput label="LinkedIn (URL ou nom)" value={linkedin} onChange={setLinkedin} onEnter={onSearch} placeholder="linkedin.com/in/jean-dupont" />
        </div>
      </AdvSection>

      {/* 6 — Critères métier */}
      <AdvSection id="other" icon={<Plus size={15} />} title="Critères métier"
        color="bg-slate-100 text-slate-500" open={open.includes('other')} onToggle={() => tog('other')}>
        <p className="text-xs text-slate-400">Les critères restent limités aux informations professionnelles utiles à la prospection.</p>
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
export default function SearchPage({ account, onLogout, onOpenAccount, accessLevel = 'full', maxSearches }: SearchPageProps) {
  // État de recherche
  const [query, setQuery]               = useState('')
  const [inputValue, setInputValue]     = useState('')
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
  const [advCity, setAdvCity]               = useState('')
  const [advAddress, setAdvAddress]         = useState('')
  const [advPhone, setAdvPhone]             = useState('')
  const [advEmail, setAdvEmail]             = useState('')
  const [advCompanyName, setAdvCompanyName] = useState('')
  const [advLinkedin, setAdvLinkedin]       = useState('')
  const [page, setPage]                 = useState(1)
  const [perPage, setPerPage]           = useState(20)
  const [viewMode, setViewMode]         = useState<'grid' | 'list'>('grid')
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
  const [lists, setLists]                     = useState<ProspectList[]>(loadLists)
  const [activeListId, setActiveListId]       = useState<string | null>(null)
  const [addPopupProspect, setAddPopupProspect] = useState<ProspectResult | null>(null)
  const [appView, setAppView]                 = useState<AppView>('search')
  const [usedQuota]                           = useState(account.monthlyUsage)
  const [darkMode, setDarkMode]               = useState(() => document.documentElement.classList.contains('dark'))
  const [showMobileMenu, setShowMobileMenu]   = useState(false)

  // Compteur de recherches pour modes demo / limited
  const DEMO_COUNT_KEY = `trouve_demo_count_${account.id}`
  const [demoSearchCount, setDemoSearchCount] = useState<number>(() => {
    if (accessLevel === 'full') return 0
    return parseInt(localStorage.getItem(`trouve_demo_count_${account.id}`) ?? '0', 10)
  })
  const [showConversionModal, setShowConversionModal]     = useState(false)
  const [showDemoRequestModal, setShowDemoRequestModal]   = useState(false)
  const [creditBalance, setCreditBalance]                 = useState<CreditBalance | null>(null)

  // Solde de crédits (abonnés).
  useEffect(() => {
    if (accessLevel === 'full' || accessLevel === 'trial') {
      getCreditBalance().then(setCreditBalance).catch(() => {})
    }
  }, [accessLevel])

  // Déblocage d'un champ (consomme 1 crédit). Démo / sans crédit → page offres.
  const handleUnlock = useCallback(async (prospect: ProspectResult, field: 'phone' | 'email') => {
    if (accessLevel !== 'full') { window.location.assign('/?pricing=1'); return }
    try {
      const value = await unlockContactField(prospect.id, field)
      const patch = field === 'phone'
        ? { phone: value, phoneUnlocked: true }
        : { email: value, emailUnlocked: true }
      setResults(prev => prev.map(p => (p.id === prospect.id ? { ...p, ...patch } : p)))
      setSelectedCompany(prev => (prev && prev.id === prospect.id ? { ...prev, ...patch } : prev))
      getCreditBalance().then(setCreditBalance).catch(() => {})
    } catch (e) {
      if (e instanceof UnlockError &&
          ['no_subscription', 'no_credits', 'no_phone_credits', 'no_email_credits'].includes(e.code)) {
        window.location.assign('/?pricing=1')
        return
      }
      setError('Déblocage impossible pour le moment. Réessayez.')
    }
  }, [accessLevel])

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
    setLoading(true); setError(null)

    // Recherche unifiée : données réelles masquées côté serveur pour tous les
    // niveaux. La recherche ne consomme jamais de crédit (seul l'unlock le fait).
    const isEmpty = !params.query?.trim() && !params.department && !params.activityCode &&
                    !params.zipCode && !params.employeeRange && !params.legalForm
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
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQuery(advLastName || advFirstName)
    setShowRecent(false)
    const label = [advLastName, advFirstName].filter(Boolean).join(' ')
    if (label.trim()) {
      setTransitionQuery(label.trim())
      setSearchTransition('visible')
      transitionStartRef.current = Date.now()
    }
    doSearch({ query: label, nom: advLastName, prenom: advFirstName, city: advCity, tel: searchTel || advPhone, searchMode, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
  }

  const handleRecentSearch = (q: string) => {
    setInputValue(q); setQuery(q); setShowRecent(false)
    doSearch({ query: q, searchMode, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
  }


  const handlePageChange = (pg: number) => {
    doSearch({ query: buildQuery(), nom: advLastName, prenom: advFirstName, city: advCity, tel: searchTel || advPhone, searchMode, department, activityCode, activeOnly, zipCode, employeeRange, legalForm }, pg)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleFavorite = (prospect: ProspectResult) => {
    setAddPopupProspect(prospect)
  }

  const handleAddToListConfirm = (listId: string, newListName?: string, newListEmoji?: string) => {
    let targetId = listId
    if (newListName) {
      const created = createList(newListName, newListEmoji ?? '📋')
      targetId = created.id
    }
    if (addPopupProspect) {
      addToList(targetId, addPopupProspect)
      const updated = loadLists()
      setLists(updated)
      const allIds = new Set<string>()
      updated.forEach(l => l.contacts.forEach(c => allIds.add(c.id)))
      setFavorites(allIds)
      saveFavorite(account, { targetName: addPopupProspect.fullName, targetCity: addPopupProspect.city ?? undefined }).catch(() => {})
    }
    setAddPopupProspect(null)
  }

  const handleRemoveFromList = (listId: string, contactId: string) => {
    removeFromList(listId, contactId)
    const updated = loadLists()
    setLists(updated)
    const allIds = new Set<string>()
    updated.forEach(l => l.contacts.forEach(c => allIds.add(c.id)))
    setFavorites(allIds)
  }

  const handleDeleteList = (listId: string) => {
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
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#0d1424]">

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
            </nav>
          </aside>
        </>
      )}

      {/* ── Sidebar gauche — blanc / gris clair ──────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex w-60 flex-col bg-white border-r border-gray-200 dark:bg-gray-950 dark:border-gray-800">

        {/* Logo */}
        <div className="flex h-16 items-center px-6 border-b border-gray-100 dark:border-gray-800">
          <button onClick={() => setAppView('search')} className="flex items-center transition">
            <img src={trouveLogo} alt="trouvé!" className="h-7 w-auto" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pt-4 space-y-0.5">
          {([
            { key: 'search',  label: 'Recherche',  icon: Search },
            { key: 'history', label: 'Historique', icon: History },
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
              <span className="text-sm leading-none">{list.emoji}</span>
              <span className="flex-1 truncate text-left text-xs">{list.name}</span>
              <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800">{list.contacts.length}</span>
            </button>
          ))}
          <button onClick={() => setAddPopupProspect({ id: '__new_list__' } as ProspectResult)}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800">
            <Plus size={14} /> Nouvelle liste
          </button>
        </nav>

        {/* Quota — bas de sidebar */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-4 space-y-3">
          {creditBalance && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <KeyIcon kind="phone" size={28} className="text-blue-600 opacity-80" />
                  Tél.
                </span>
                <span className="text-sm font-bold tabular-nums text-gray-800 dark:text-gray-200">
                  {creditBalance.unlimited ? '∞' : creditBalance.phoneCredits}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs text-gray-500">
                  <KeyIcon kind="email" size={28} className="text-blue-600 opacity-80" />
                  Email
                </span>
                <span className="text-sm font-bold tabular-nums text-gray-800 dark:text-gray-200">
                  {creditBalance.unlimited ? '∞' : creditBalance.emailCredits}
                </span>
              </div>
            </div>
          )}
          {account.quota > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Recherches restantes</span>
                <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                  {(account.quota - usedQuota).toLocaleString('fr-FR')} / {account.quota.toLocaleString('fr-FR')}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(100, Math.round(((account.quota - usedQuota) / account.quota) * 100))}%` }} />
              </div>
            </div>
          )}
          {(accessLevel === 'demo' || accessLevel === 'limited') && maxSearches !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Recherches démo</span>
                <span className="text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                  {Math.max(0, maxSearches - demoSearchCount)} / {maxSearches}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${Math.min(100, Math.round(((maxSearches - demoSearchCount) / maxSearches) * 100))}%` }} />
              </div>
            </div>
          )}
        </div>

      </aside>

      {/* ── Zone principale ──────────────────────────────────────────────── */}
      <div className="lg:ml-60 flex flex-1 flex-col pt-14 lg:pt-0 pb-16 lg:pb-0">

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

        {/* Vue Recherche */}
        {appView === 'search' && (
          <div className="flex flex-1 flex-col">

            {/* ── Topbar ── */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-gray-100 bg-white px-8 dark:border-gray-800 dark:bg-gray-950">
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                {hasSearched && query ? `Résultats pour "${query}"` : 'Recherche de contacts'}
              </h1>
              <div className="flex items-center gap-3">
                <ThemeToggle size="sm" />
                <UserMenu account={account} onLogout={onLogout} onOpenAccount={onOpenAccount} onOpenProspection={() => setShowProspectionPanel(true)} />
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
                  <div className="relative flex-1 min-w-[120px]">
                    <UserCircle2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={advLastName}
                      onChange={e => { setAdvLastName(e.target.value); setPage(1) }}
                      placeholder="Nom"
                      autoComplete="off"
                      className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
                    />
                  </div>
                  <div className="relative flex-1 min-w-[120px]">
                    <UserCircle2 size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={advFirstName}
                      onChange={e => { setAdvFirstName(e.target.value); setPage(1) }}
                      placeholder="Prénom"
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

                {/* Recherche avancée — ghost button */}
                <div className="mt-4 flex items-center justify-between">
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

                  {results.length > 0 && (
                    <button onClick={() => exportProspectsCSV(results, query)}
                      className="flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200">
                      <Download size={13} /> Exporter CSV
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Panneau de recherche avancée (conservé) */}
            {showFilters && (
              <AdvancedFilters
                // Identité professionnelle
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
                  doSearch({ query: q, nom: advLastName, prenom: advFirstName, city: advCity, tel: searchTel || advPhone, searchMode, department, activityCode, activeOnly, zipCode, employeeRange, legalForm })
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
                    setInputValue(''); setQuery('')
                    setAdvFirstName(''); setAdvLastName(''); setAdvJobTitle('')
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
        <ProspectSlideOver prospect={selectedCompany} onClose={() => setSelectedCompany(null)} canUnlock={accessLevel === 'full'} onUnlock={handleUnlock} />
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
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-white/[0.06] bg-[#07113d] py-1">
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
    </div>
  )
}
