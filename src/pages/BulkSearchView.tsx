import { useState } from 'react'
import {
  Plus, Trash2, Search, ChevronRight, X,
  CheckCircle2, Loader2,
  Users, AlertCircle, Building2, MapPin, Home,
  Upload, Info, FileText, Download, Phone, Mail,
} from 'lucide-react'
import { CsvUploadModal } from '@/components/ui/csv-upload-modal'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'
import { searchProspects, unlockContactField, UnlockError, type ProspectResult, type CreditBalance } from '@/lib/prospectApi'
import { generateBulkDemoResults } from '@/lib/demoResults'
import { type Account } from '@/lib/accountStore'
import keyBlueImg  from '@/assets/key-blue.png'
import keyGreenImg from '@/assets/key-green.png'
import lockBlueImg  from '@/assets/lock-blue.png'
import lockGreenImg from '@/assets/lock-green.png'

// ─── Bulk list localStorage ───────────────────────────────────────────────────
const BULK_KEY = 'trouve_bulk_list_v1'
interface BulkContact {
  id: string; firstName: string; lastName: string; name: string
  phone: string; email: string
  jobTitle: string; companyName: string; city: string; savedAt: string
}
function loadBulk(): BulkContact[] {
  try { return JSON.parse(localStorage.getItem(BULK_KEY) ?? '[]') } catch { return [] }
}
function saveToBulk(p: ProspectResult) {
  const list = loadBulk()
  const entry: BulkContact = {
    id: p.id,
    firstName: p.firstName ?? '',
    lastName: p.lastName ?? '',
    name: p.fullName,
    phone: p.phone ?? '',
    email: p.email ?? '',
    jobTitle: p.jobTitle ?? '',
    companyName: p.companyName ?? '',
    city: p.city ?? '',
    savedAt: new Date().toISOString(),
  }
  const idx = list.findIndex(c => c.id === p.id)
  if (idx >= 0) { list[idx] = { ...list[idx], ...entry } } else { list.push(entry) }
  localStorage.setItem(BULK_KEY, JSON.stringify(list))
}
function downloadBulkCSV() {
  const list = loadBulk()
  if (!list.length) return
  const cols = ['Prénom', 'Nom', 'Poste', 'Entreprise', 'Ville', 'Téléphone', 'Email']
  const escape = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
  const rows = list.map(c => [
    c.firstName || c.name.split(' ')[0],
    c.lastName  || c.name.split(' ').slice(1).join(' '),
    c.jobTitle, c.companyName, c.city, c.phone, c.email,
  ].map(escape))
  const csv = '﻿' + [cols, ...rows].map(r => r.join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `bulk_${new Date().toISOString().slice(0, 10)}.csv` })
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface BulkRow { id: string; identite: string; tel: string; adresse: string }
interface BulkResult { rowId: string; label: string; results: ProspectResult[]; loading: boolean; error: string | null }

export interface BulkSearchViewProps {
  account: Account
  creditBalance: CreditBalance | null
  onCreditRefresh: () => void
  onOpenBuyKeys: () => void
}

function newRow(): BulkRow {
  return { id: crypto.randomUUID(), identite: '', tel: '', adresse: '' }
}

// ─── Données fictives démo ────────────────────────────────────────────────────
const DEMO_ROWS: BulkRow[] = [
  { id: 'demo-r1', identite: 'Jean Martin',   tel: '',           adresse: ''                   },
  { id: 'demo-r2', identite: 'Sophie Dupont', tel: '',           adresse: '15 rue Victor Hugo'  },
  { id: 'demo-r3', identite: 'Bernard',       tel: '0612345678', adresse: ''                   },
]


// ─── Parsing CSV ──────────────────────────────────────────────────────────────
const NOM_ALIASES    = new Set(['nom', 'name', 'last_name', 'lastname', 'nom de famille', 'surname'])
const PRENOM_ALIASES = new Set(['prenom', 'prénom', 'first_name', 'firstname', 'first name'])
const IDENTITE_ALIASES = new Set(['identite', 'identité', 'nom prenom', 'nom prénom', 'full name', 'fullname'])
const TEL_ALIASES    = new Set(['telephone', 'téléphone', 'tel', 'phone', 'mobile', 'portable', 'numéro'])
const ADR_ALIASES    = new Set(['adresse', 'address', 'adresse postale', 'rue', 'street'])

type CsvTarget = 'identite_nom' | 'identite_prenom' | 'identite' | 'tel' | 'adresse' | null

function parseCSV(text: string): BulkRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/[^a-zéàèêëîïôùûüç _]/gi, ''))
  const fieldMap: CsvTarget[] = headers.map(h => {
    if (NOM_ALIASES.has(h))      return 'identite_nom'
    if (PRENOM_ALIASES.has(h))   return 'identite_prenom'
    if (IDENTITE_ALIASES.has(h)) return 'identite'
    if (TEL_ALIASES.has(h))      return 'tel'
    if (ADR_ALIASES.has(h))      return 'adresse'
    return null
  })

  return lines.slice(1).map(line => {
    const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
    const row = newRow()
    let nom = '', prenom = ''
    fieldMap.forEach((target, i) => {
      const val = cells[i] ?? ''
      if (!val) return
      if (target === 'identite_nom')    nom    = val
      if (target === 'identite_prenom') prenom = val
      if (target === 'identite')        row.identite = val
      if (target === 'tel')             row.tel      = val
      if (target === 'adresse')         row.adresse  = val
    })
    if (nom || prenom) row.identite = [prenom, nom].filter(Boolean).join(' ')
    return row
  }).filter(r => r.identite || r.tel || r.adresse)
}

// ─── Composant principal ──────────────────────────────────────────────────────
export default function BulkSearchView({ account, creditBalance, onCreditRefresh, onOpenBuyKeys }: BulkSearchViewProps) {
  const isDemo = account.id.startsWith('demo-')

  const [rows, setRows]               = useState<BulkRow[]>(isDemo ? DEMO_ROWS : [newRow(), newRow()])
  const [results, setResults]         = useState<BulkResult[]>([])
  const [running, setRunning]         = useState(false)
  const [detail, setDetail]           = useState<ProspectResult | null>(null)
  const [unlocking, setUnlocking]     = useState<Record<string, boolean>>({})
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [addedIds, setAddedIds]       = useState<Set<string>>(new Set(loadBulk().map(c => c.id)))
  const [csvError, setCsvError]         = useState<string | null>(null)
  const [showCsvInfo, setShowCsvInfo]   = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)

  // ── Gestion des lignes ──
  const updateRow = (id: string, field: keyof BulkRow, val: string) =>
    setRows(r => r.map(row => row.id === id ? { ...row, [field]: val } : row))

  const removeRow = (id: string) =>
    setRows(r => r.length > 1 ? r.filter(row => row.id !== id) : r)

  // ── Import CSV depuis le modal ──
  const handleCsvImport = (text: string) => {
    setCsvError(null)
    const parsed = parseCSV(text)
    if (!parsed.length) { setCsvError('Aucune ligne valide trouvée. Vérifiez les noms de colonnes.'); return }
    setRows(parsed)
    setResults([])
  }

  // ── Lancement de la recherche ──
  const handleSearch = async () => {
    const validRows = rows.filter(r => r.identite.trim() || r.tel.trim() || r.adresse.trim())
    if (!validRows.length) return

    setRunning(true)
    // Réinitialise la liste Bulk pour la nouvelle recherche
    localStorage.removeItem(BULK_KEY)
    setAddedIds(new Set())
    // Garde les résultats existants visibles pendant le rechargement
    setResults(prev => {
      const existing = new Map(prev.map(r => [r.rowId, r]))
      return validRows.map(r => ({
        rowId: r.id,
        label: r.identite.trim() || r.tel || r.adresse || 'Requête',
        results: existing.get(r.id)?.results ?? [],
        loading: true,
        error: null,
      }))
    })

    for (const row of validRows) {
      // Mode démo : résultats fictifs avec délai simulé
      if (isDemo) {
        await new Promise(res => setTimeout(res, 600 + Math.random() * 400))
        setResults(prev => prev.map(r => {
          if (r.rowId !== row.id) return r
          // Fusionne les états débloqués existants avec les nouveaux résultats
          const unlockedById = new Map(
            r.results.filter(p => p.phoneUnlocked || p.emailUnlocked).map(p => [p.id, p])
          )
          const parts = row.identite.trim().split(/\s+/)
          const demoRow = { prenom: parts[0] ?? '', nom: (parts.slice(1).join(' ') || parts[0]) ?? '' }
          const merged = generateBulkDemoResults(demoRow).map(p => {
            const was = unlockedById.get(p.id)
            if (!was) return p
            return { ...p, phone: was.phone, phoneUnlocked: was.phoneUnlocked, email: was.email, emailUnlocked: was.emailUnlocked }
          })
          return { ...r, results: merged, loading: false }
        }))
        continue
      }

      try {
        const res = await searchProspects({
          query:   row.identite.trim() || row.tel.trim(),
          tel:     row.tel.trim()     || undefined,
          address: row.adresse.trim() || undefined,
          perPage: 5,
        })
        // Pour le mode réel : les résultats API contiennent déjà les états unlocked
        setResults(prev => prev.map(r =>
          r.rowId === row.id ? { ...r, results: res.results, loading: false } : r
        ))
      } catch (err: any) {
        setResults(prev => prev.map(r =>
          r.rowId === row.id ? { ...r, loading: false, error: err?.message ?? 'Erreur' } : r
        ))
      }
    }
    setRunning(false)
  }

  // ── Déblocage (démo : simule le déverrouillage) ──
  const handleUnlock = async (prospect: ProspectResult, field: 'phone' | 'email') => {
    const key = `${prospect.id}-${field}`
    setUnlocking(u => ({ ...u, [key]: true }))
    setUnlockError(null)

    try {
      let value: string
      if (isDemo) {
        await new Promise(res => setTimeout(res, 800))
        value = field === 'phone' ? '+33 6 12 34 56 78' : `${prospect.firstName?.toLowerCase()}.${prospect.lastName?.toLowerCase()}@exemple.fr`
      } else {
        value = await unlockContactField(prospect.id, field)
        onCreditRefresh()
      }

      setDetail(prev => {
        if (!prev || prev.id !== prospect.id) return prev
        return field === 'phone' ? { ...prev, phone: value, phoneUnlocked: true } : { ...prev, email: value, emailUnlocked: true }
      })
      setResults(prev => prev.map(r => ({
        ...r,
        results: r.results.map(p => p.id !== prospect.id ? p
          : field === 'phone' ? { ...p, phone: value, phoneUnlocked: true } : { ...p, email: value, emailUnlocked: true }
        ),
      })))

      const updated = { ...prospect, ...(field === 'phone' ? { phone: value, phoneUnlocked: true } : { email: value, emailUnlocked: true }) }
      saveToBulk(updated)
      setAddedIds(prev => new Set([...prev, prospect.id]))
    } catch (err: any) {
      if (err instanceof UnlockError && ['no_phone_credits', 'no_email_credits', 'no_credits'].includes(err.code)) {
        setUnlockError('Plus assez de clés.')
        onOpenBuyKeys()
      } else {
        setUnlockError(err?.message ?? 'Erreur lors du déblocage')
      }
    } finally {
      setUnlocking(u => ({ ...u, [key]: false }))
    }
  }

  const handleAddToBulk = (p: ProspectResult) => {
    saveToBulk(p)
    setAddedIds(prev => new Set([...prev, p.id]))
  }

  const validCount = rows.filter(r => r.identite.trim() || r.tel.trim() || r.adresse.trim()).length


  return (
    <div className="flex flex-1 flex-col min-h-0">

      {/* ── Header ── */}
      <div className="px-6 pt-8 pb-6 lg:px-10 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[13px] font-semibold uppercase tracking-[0.22em] text-[#124bd2] dark:text-blue-400">
              Recherche Bulk
            </p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-[#07113d] dark:text-slate-100">
              Prospection en masse
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Renseignez plusieurs prospects ou importez un CSV, puis déverrouillez leurs contacts avec vos clés.
            </p>
          </div>
          {addedIds.size > 0 && (
            <button
              onClick={downloadBulkCSV}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2.5 text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition"
            >
              <Download size={15} />
              Télécharger le Bulk
              <span className="ml-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 px-1.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
                {addedIds.size}
              </span>
            </button>
          )}
        </div>
        {isDemo && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            <Info size={13} /> Mode démo — données fictives, résultats simulés
          </div>
        )}
      </div>

      {/* ── Contenu ── */}
      <div className="flex flex-1 min-h-0 overflow-y-auto px-6 py-6 lg:px-10 flex-col gap-6">

        {/* Tableau de saisie */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap rounded-t-xl overflow-hidden">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <Users size={15} className="text-[#124bd2]" />
              Prospects à rechercher
              <span className="text-xs font-normal text-gray-400">{rows.length} ligne{rows.length > 1 ? 's' : ''}</span>
            </p>
            {/* Bouton import CSV */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCsvInfo(v => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <Info size={13} /> Format CSV
              </button>
              <button
                onClick={() => setShowCsvModal(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[#124bd2]/30 bg-[#124bd2]/5 px-3 py-1.5 text-xs font-semibold text-[#124bd2] hover:bg-[#124bd2]/10 transition"
              >
                <Upload size={13} /> Importer CSV
              </button>
            </div>
          </div>

          {/* Info format CSV */}
          {showCsvInfo && (
            <div className="px-5 py-4 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300 space-y-2">
              <p className="font-semibold flex items-center gap-1.5"><FileText size={13} /> Noms de colonnes acceptés (séparateur : <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">,</code> ou <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">;</code>)</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <div><span className="font-medium text-blue-600">Identité :</span> <code>identite</code>, <code>full name</code> — ou séparés : <code>nom</code> + <code>prenom</code></div>
                <div><span className="font-medium text-blue-600">Téléphone :</span> <code>telephone</code>, <code>tel</code>, <code>phone</code>, <code>mobile</code></div>
                <div><span className="font-medium text-blue-600">Adresse :</span> <code>adresse</code>, <code>address</code>, <code>rue</code>, <code>street</code></div>
              </div>
              <p className="text-blue-500">Exemple : <code>nom;prenom;telephone;adresse</code> — les colonnes nom+prénom sont fusionnées automatiquement</p>
            </div>
          )}

          {/* Erreur CSV */}
          {csvError && (
            <div className="px-5 py-3 bg-red-50 dark:bg-red-950/20 border-b border-red-100 dark:border-red-900 flex items-center gap-2 text-xs text-red-600">
              <AlertCircle size={13} /> {csvError}
            </div>
          )}

          {/* Entêtes colonnes */}
          <div className="grid grid-cols-[2fr_1fr_2fr_36px] gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
            {(['Nom / Prénom', 'Téléphone', 'Adresse (rue, ville ou CP)'] as const).map(label => (
              <span key={label} className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
            ))}
            <span />
          </div>

          {/* Lignes */}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[2fr_1fr_2fr_36px] gap-2 px-4 py-2 items-center group">
                <input
                  value={row.identite}
                  onChange={e => updateRow(row.id, 'identite', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && i === rows.length - 1 && setRows(r => [...r, newRow()])}
                  placeholder="Jean Dupont ou Dupont Jean…"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:border-[#124bd2] focus:outline-none focus:ring-1 focus:ring-[#124bd2]/30 transition"
                />
                <input
                  value={row.tel}
                  onChange={e => updateRow(row.id, 'tel', e.target.value)}
                  placeholder="06…"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1.5 text-sm text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:border-[#124bd2] focus:outline-none focus:ring-1 focus:ring-[#124bd2]/30 transition"
                />
                <AddressAutocomplete
                  value={row.adresse}
                  placeholder="ex: 10 Rue de la Paix Paris"
                  onSelect={result => updateRow(row.id, 'adresse', result.label)}
                />
                <button onClick={() => removeRow(row.id)} className="flex items-center justify-center rounded-lg p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <button onClick={() => setRows(r => [...r, newRow()])} className="flex items-center gap-1.5 text-xs font-medium text-[#124bd2] hover:text-[#0b3fbc] transition">
              <Plus size={14} /> Ajouter une ligne
            </button>
          </div>
        </div>

        {/* Bouton lancer */}
        <button
          onClick={handleSearch}
          disabled={running || validCount === 0}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#124bd2] hover:bg-[#124bd2]/80 px-6 py-3 text-sm font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden before:absolute before:inset-0 before:rounded-[inherit] before:bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.7)_50%,transparent_75%,transparent_100%)] before:bg-[length:250%_250%,100%_100%] before:bg-[position:200%_0,0_0] before:bg-no-repeat before:transition-[background-position_0s_ease] before:duration-1000 hover:before:bg-[position:-100%_0,0_0]"
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          {running ? 'Recherche en cours…' : `Lancer la recherche bulk (${validCount} requête${validCount > 1 ? 's' : ''})`}
        </button>

        {/* Résultats */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Résultats</h2>
            {results.map(r => (
              <div key={r.rowId} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    <span className="text-[#124bd2]">"{r.label}"</span>
                    {!r.loading && !r.error && (
                      <span className="ml-2 text-xs font-normal text-gray-400">— {r.results.length} correspondance{r.results.length !== 1 ? 's' : ''}</span>
                    )}
                  </p>
                  {r.loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
                </div>
                {r.error ? (
                  <div className="px-5 py-4 flex items-center gap-2 text-sm text-red-500"><AlertCircle size={14} />{r.error}</div>
                ) : r.loading ? (
                  <div className="px-5 py-4 text-sm text-gray-400">Recherche…</div>
                ) : r.results.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400">Aucun résultat trouvé.</div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {r.results.map(p => (
                      <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#124bd2]/10 text-[#124bd2] text-sm font-bold">
                          {p.firstName?.[0] ?? p.lastName?.[0] ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{p.fullName}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {p.jobTitle && <span className="text-[11px] text-gray-400 truncate max-w-[120px]">{p.jobTitle}</span>}
                            {p.companyName && <span className="flex items-center gap-1 text-[11px] text-gray-400"><Building2 size={10} />{p.companyName}</span>}
                            {p.address && <span className="flex items-center gap-1 text-[11px] text-gray-400 truncate max-w-[160px]"><Home size={10} className="shrink-0" />{p.address}</span>}
                            {!p.address && p.city && <span className="flex items-center gap-1 text-[11px] text-gray-400"><MapPin size={10} />{p.city}</span>}
                          </div>
                        </div>
                        {addedIds.has(p.id) && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full shrink-0">
                            <CheckCircle2 size={11} /> Bulk
                          </span>
                        )}
                        <button
                          onClick={() => { setDetail(p); setUnlockError(null) }}
                          className="flex items-center gap-1 rounded-lg border border-[#124bd2]/30 bg-[#124bd2]/5 px-3 py-1.5 text-xs font-semibold text-[#124bd2] hover:bg-[#124bd2]/10 transition shrink-0"
                        >
                          Voir plus <ChevronRight size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Panneau détail ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setDetail(null)} />
          <div className="w-full max-w-sm bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{detail.fullName}</h2>
                {detail.jobTitle && <p className="text-xs text-gray-400 mt-0.5">{detail.jobTitle}</p>}
              </div>
              <button onClick={() => setDetail(null)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 px-6 py-5 space-y-4">
              {detail.companyName && <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><Building2 size={14} className="text-gray-400 shrink-0" />{detail.companyName}</div>}
              {detail.address && (
                <div className="space-y-1">
                  <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <Home size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <p>{detail.address}</p>
                      {(detail.zipCode || detail.city) && (
                        <p className="text-xs text-gray-400 mt-0.5">{[detail.zipCode, detail.city].filter(Boolean).join(' ')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!detail.address && detail.city && <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"><MapPin size={14} className="text-gray-400 shrink-0" />{[detail.zipCode, detail.city].filter(Boolean).join(' ')}</div>}

              {detail.hasPhone && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Téléphone direct</p>
                  <span className="inline-flex items-center gap-2 rounded-xl bg-[#124bd2]/10 ring-1 ring-[#124bd2]/20 px-3 py-1.5 text-xs">
                    <Phone size={14} className="text-[#124bd2] shrink-0" />
                    <span className="font-semibold tabular-nums text-[#124bd2]">{detail.phone}</span>
                    {!detail.phoneUnlocked && (
                      <button onClick={() => handleUnlock(detail, 'phone')} disabled={!!unlocking[`${detail.id}-phone`]}
                        className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-[#124bd2]/20 hover:bg-[#124bd2]/30 px-2.5 py-1 text-[11px] font-semibold text-[#124bd2] transition disabled:opacity-60">
                        {unlocking[`${detail.id}-phone`]
                          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent border-[#124bd2]" />
                          : <img src={lockBlueImg} style={{ height: '28px', width: 'auto' }} alt="" />}
                        Débloquer
                      </button>
                    )}
                  </span>
                </div>
              )}

              {detail.hasEmail && (
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Email direct</p>
                  <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 px-3 py-1.5 text-xs">
                    <Mail size={14} className="text-emerald-600 shrink-0" />
                    <span className="font-semibold tabular-nums text-emerald-700">{detail.email}</span>
                    {!detail.emailUnlocked && (
                      <button onClick={() => handleUnlock(detail, 'email')} disabled={!!unlocking[`${detail.id}-email`]}
                        className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition disabled:opacity-60">
                        {unlocking[`${detail.id}-email`]
                          ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent border-emerald-600" />
                          : <img src={lockGreenImg} style={{ height: '28px', width: 'auto' }} alt="" />}
                        Débloquer
                      </button>
                    )}
                  </span>
                </div>
              )}

              {unlockError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-3 text-xs text-red-600 dark:text-red-400">
                  <AlertCircle size={13} />{unlockError}
                </div>
              )}

              {creditBalance && !creditBalance.unlimited && (
                <div className="flex items-center gap-4 rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <img src={keyBlueImg} alt="" style={{ height: '32px', width: 'auto' }} />
                    <span>{creditBalance.phoneCredits} restantes</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <img src={keyGreenImg} alt="" style={{ height: '32px', width: 'auto' }} />
                    <span>{creditBalance.emailCredits} restantes</span>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-5 border-t border-gray-100 dark:border-gray-800">
              {addedIds.has(detail.id) ? (
                <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 py-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={15} /> Ajouté à la liste Bulk
                </div>
              ) : (() => {
                const canAdd = detail.phoneUnlocked || detail.emailUnlocked
                return (
                  <div className="space-y-2">
                    <button
                      onClick={() => handleAddToBulk(detail)}
                      disabled={!canAdd}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-[#124bd2] px-4 py-3 text-sm font-bold text-[#124bd2] hover:bg-[#124bd2]/5 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-transparent"
                    >
                      <Plus size={15} /> Ajouter à la liste Bulk
                    </button>
                    {!canAdd && (
                      <p className="text-center text-xs text-gray-400 dark:text-gray-500">
                        Débloquez au moins un téléphone ou email pour ajouter au Bulk
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      <CsvUploadModal
        open={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onImport={handleCsvImport}
      />
    </div>
  )
}
