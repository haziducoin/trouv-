import { useEffect, useState } from 'react'
import {
  X, Home, TrendingUp, Users, Phone, Mail, MapPin, Euro, Calendar,
  Loader2, ExternalLink, Zap, Leaf, Thermometer, Building2, Info,
} from 'lucide-react'
import type { ParcelInfo } from '../../pages/MapPage'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DvfMutation {
  id_mutation:        string
  date_mutation:      string
  nature_mutation:    string
  valeur_fonciere:    number
  adresse:            string
  code_postal:        string
  nom_commune:        string
  type_local:         string | null
  surface_reelle_bati: number | null
  surface_carrez:     number | null
  surface_terrain:    number | null
  nombre_pieces:      number | null
  nombre_lots:        number | null
  id_parcelle:        string
}

interface DpeResult {
  id:                   string
  date:                 string
  etiquette_dpe:        string
  etiquette_ges:        string
  conso_energie:        number | null
  emission_ges:         number | null
  surface:              number | null
  adresse:              string
  type_batiment:        string | null
  periode_construction: string | null
  chauffage:            string | null
  isolation:            string | null
}

interface ContactMatch {
  id:             number
  nom:            string
  prenom:         string
  adresse:        string
  ville:          string
  code_postal:    string
  adresse_ban:    string | null
  phone_masked?:  string
  email_masked?:  string
  phone_unlocked: boolean
  phone_value?:   string
  match_type?:    string
}

interface BanAddress {
  adresse: string
  cp:      string
  ville:   string
  score:   number
}

interface Props {
  parcel:  ParcelInfo | null
  onClose: () => void
}

type Tab = 'dvf' | 'dpe' | 'contacts'

// ── DPE helpers ───────────────────────────────────────────────────────────────

const DPE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: '#00964a', text: '#fff' },
  B: { bg: '#51a232', text: '#fff' },
  C: { bg: '#a2c737', text: '#fff' },
  D: { bg: '#f0e619', text: '#333' },
  E: { bg: '#f0b50f', text: '#fff' },
  F: { bg: '#e8821e', text: '#fff' },
  G: { bg: '#e1401a', text: '#fff' },
}

function DpeLabel({ label, size = 'md' }: { label: string; size?: 'sm' | 'md' | 'lg' }) {
  const colors = DPE_COLORS[label?.toUpperCase()] ?? { bg: '#94a3b8', text: '#fff' }
  const sz = size === 'lg' ? 'w-10 h-10 text-lg' : size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-black ${sz}`}
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {label?.toUpperCase() ?? '?'}
    </span>
  )
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR')
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function ParcelSidepanel({ parcel, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('dvf')

  const [dvf,        setDvf]        = useState<DvfMutation[]>([])
  const [dpe,        setDpe]        = useState<DpeResult[]>([])
  const [contacts,   setContacts]   = useState<ContactMatch[]>([])
  const [banAddress, setBanAddress] = useState<BanAddress | null>(null)

  const [dvfLoading,      setDvfLoading]      = useState(false)
  const [dpeLoading,      setDpeLoading]      = useState(false)
  const [contactsLoading, setContactsLoading] = useState(false)

  const [dvfError,      setDvfError]      = useState<string | null>(null)
  const [dpeError,      setDpeError]      = useState<string | null>(null)
  const [contactsError, setContactsError] = useState<string | null>(null)

  useEffect(() => {
    // Reset systématique à chaque changement de parcelle (y compris null→parcel et parcelA→parcelB)
    setDvf([]); setDpe([]); setContacts([]); setBanAddress(null)
    setDvfError(null); setDpeError(null); setContactsError(null)

    if (!parcel) {
      setTab('dvf')
      return
    }

    // ── DVF + DPE (un seul appel) ──────────────────────────────────────────
    setDvfLoading(true); setDpeLoading(true)
    fetch(`/api/dvf?code_insee=${encodeURIComponent(parcel.codeInsee ?? '')}&section=${encodeURIComponent(parcel.section)}&numero=${encodeURIComponent(parcel.numero)}`)
      .then(r => r.json())
      .then(d => {
        setDvf(d.mutations ?? [])
        setDpe(d.dpe ?? [])
      })
      .catch(() => {
        setDvfError("Impossible de charger l'historique DVF")
        setDpeError('Impossible de charger les DPE')
      })
      .finally(() => { setDvfLoading(false); setDpeLoading(false) })

    // ── Contacts + BAN address ─────────────────────────────────────────────
    setContactsLoading(true); setContactsError(null)
    fetch('/api/dvf', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ parcel }),
    })
      .then(r => r.json())
      .then(d => {
        setContacts(d.contacts ?? [])
        if (d.ban_address) setBanAddress(d.ban_address)
      })
      .catch(() => setContactsError('Impossible de trouver des correspondances'))
      .finally(() => setContactsLoading(false))

  }, [parcel])

  // Quand l'adresse BAN arrive (après contacts), on re-fetch DVF+DPE avec l'adresse pour DPE plus précis
  useEffect(() => {
    if (!parcel || !banAddress) return
    const cp      = banAddress.cp
    const adresse = banAddress.adresse
    if (!cp || !adresse) return

    setDpeLoading(true)
    const params = new URLSearchParams({
      code_insee: parcel.codeInsee ?? '',
      section:    parcel.section,
      numero:     parcel.numero,
      cp,
      adresse,
    })
    fetch(`/api/dvf?${params}`)
      .then(r => r.json())
      .then(d => { if (d.dpe?.length) setDpe(d.dpe) })
      .catch(() => {})
      .finally(() => setDpeLoading(false))
  }, [parcel, banAddress])

  if (!parcel) return null

  const lastSale = dvf[0]
  const bestDpe  = dpe[0]

  return (
    <div className="w-[440px] h-full bg-white border-l border-slate-100 flex flex-col shadow-xl overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between p-5 border-b border-slate-100 shrink-0">
        <div className="min-w-0 flex-1 pr-3">
          <div className="flex items-center gap-2 text-[#1B54FF] mb-1">
            <Home size={15} />
            <span className="text-xs font-semibold uppercase tracking-wide">Parcelle cadastrale</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold text-slate-800">
              {parcel.section} {parcel.numero}
            </p>
            {parcel.contenance != null && (
              <span className="text-xs text-slate-400 font-medium">
                {parcel.contenance >= 10000
                  ? `${(parcel.contenance / 10000).toFixed(2)} ha`
                  : `${parcel.contenance} m²`}
              </span>
            )}
          </div>
          {banAddress ? (
            <p className="text-sm text-slate-700 flex items-center gap-1 mt-0.5 font-medium">
              <MapPin size={12} className="text-[#1B54FF] shrink-0" />
              <span className="truncate">
                {banAddress.adresse && `${banAddress.adresse}, `}{banAddress.cp} {banAddress.ville}
              </span>
            </p>
          ) : (
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin size={12} className="shrink-0" />
              <span className="truncate">{parcel.commune || 'Commune inconnue'} · {parcel.codeInsee}</span>
            </p>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition shrink-0">
          <X size={17} />
        </button>
      </div>

      {/* ── Résumé rapide DVF + DPE ──────────────────────────────────────── */}
      {(lastSale || bestDpe) && (
        <div className="flex gap-3 px-4 pt-4 shrink-0">
          {lastSale && (
            <div className="flex-1 rounded-xl bg-[#1B54FF]/5 border border-[#1B54FF]/10 p-3">
              <div className="flex items-center gap-1.5 text-[#1B54FF] text-[11px] font-semibold mb-1.5">
                <TrendingUp size={11} /> Dernière vente
              </div>
              <p className="text-xl font-black text-slate-800">{fmt(lastSale.valeur_fonciere)} €</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {new Date(lastSale.date_mutation).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
                {lastSale.surface_carrez && ` · ${lastSale.surface_carrez} m²`}
              </p>
            </div>
          )}
          {bestDpe && (
            <div className="flex-1 rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold mb-1.5">
                <Zap size={11} /> DPE
              </div>
              <div className="flex items-center gap-2">
                <DpeLabel label={bestDpe.etiquette_dpe} size="lg" />
                <div>
                  <p className="text-xs text-slate-500">Énergie</p>
                  {bestDpe.conso_energie && (
                    <p className="text-sm font-bold text-slate-700">{fmt(bestDpe.conso_energie)} kWh/m²/an</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-slate-100 px-4 mt-4 shrink-0">
        {([
          { key: 'dvf',      label: 'DVF',          icon: TrendingUp, count: dvf.length },
          { key: 'dpe',      label: 'DPE',           icon: Zap,        count: dpe.length },
          { key: 'contacts', label: 'Propriétaires', icon: Users,      count: contacts.length },
        ] as const).map(({ key, label, icon: Icon, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              tab === key
                ? 'border-[#1B54FF] text-[#1B54FF]'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <Icon size={13} />
            {label}
            {count > 0 && (
              <span className={`ml-0.5 rounded-full text-[10px] font-bold px-1.5 py-px ${
                tab === key ? 'bg-[#1B54FF] text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* ═══ DVF ═══════════════════════════════════════════════════════ */}
        {tab === 'dvf' && (
          <>
            {dvfLoading && <Spinner label="Chargement DVF…" />}
            {dvfError && !dvfLoading && <ErrorMsg msg={dvfError} />}
            {!dvfLoading && !dvfError && dvf.length === 0 && (
              <Empty icon={TrendingUp} msg="Aucune vente enregistrée sur cette parcelle" />
            )}
            {dvf.map((m) => (
              <div key={m.id_mutation} className="rounded-xl border border-slate-100 p-4 hover:border-[#1B54FF]/20 transition">
                {/* Ligne principale */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-800 flex items-center gap-1.5 text-base">
                      <Euro size={14} className="text-[#1B54FF] shrink-0" />
                      {fmt(m.valeur_fonciere)} €
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{m.nature_mutation}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-slate-400 bg-slate-50 rounded-lg px-2 py-1 flex items-center gap-1">
                      <Calendar size={10} />
                      {new Date(m.date_mutation).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                </div>

                {/* Détails surfaces */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {m.surface_carrez && (
                    <Chip label="Surface Carrez" value={`${m.surface_carrez} m²`} />
                  )}
                  {m.surface_reelle_bati && !m.surface_carrez && (
                    <Chip label="Surface bâti" value={`${m.surface_reelle_bati} m²`} />
                  )}
                  {m.surface_terrain && (
                    <Chip label="Terrain" value={`${fmt(m.surface_terrain)} m²`} />
                  )}
                  {m.nombre_pieces && (
                    <Chip label="Pièces" value={String(m.nombre_pieces)} />
                  )}
                  {m.nombre_lots && (
                    <Chip label="Lots" value={String(m.nombre_lots)} />
                  )}
                  {m.type_local && (
                    <Chip label="Type" value={m.type_local} />
                  )}
                </div>

                {/* Prix au m² */}
                {m.surface_carrez && m.valeur_fonciere > 0 && (
                  <p className="mt-2.5 text-xs font-semibold text-[#1B54FF]">
                    {fmt(Math.round(m.valeur_fonciere / m.surface_carrez))} €/m²
                  </p>
                )}

                {/* Adresse */}
                {m.adresse && (
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                    <MapPin size={10} className="shrink-0" />
                    {m.adresse}{m.code_postal ? `, ${m.code_postal} ${m.nom_commune}` : ''}
                  </p>
                )}
              </div>
            ))}
          </>
        )}

        {/* ═══ DPE ════════════════════════════════════════════════════════ */}
        {tab === 'dpe' && (
          <>
            {dpeLoading && <Spinner label="Chargement DPE ADEME…" />}
            {dpeError && !dpeLoading && <ErrorMsg msg={dpeError} />}
            {!dpeLoading && !dpeError && dpe.length === 0 && (
              <Empty icon={Zap} msg="Aucun DPE trouvé à cette adresse" sub="Les DPE disponibles couvrent les logements existants depuis juillet 2021." />
            )}
            {dpe.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-100 p-4 hover:border-[#1B54FF]/20 transition">
                {/* En-tête DPE */}
                <div className="flex items-center gap-3">
                  <DpeLabel label={d.etiquette_dpe} size="lg" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-800">Étiquette {d.etiquette_dpe}</p>
                      <span className="text-xs text-slate-400">GES:</span>
                      <DpeLabel label={d.etiquette_ges} size="sm" />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                      <Calendar size={10} />
                      {d.date ? new Date(d.date).toLocaleDateString('fr-FR') : 'Date inconnue'}
                    </p>
                  </div>
                </div>

                {/* Consommations */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {d.conso_energie != null && (
                    <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5">
                      <div className="flex items-center gap-1 text-amber-600 text-[10px] font-semibold mb-1">
                        <Zap size={10} /> ÉNERGIE
                      </div>
                      <p className="text-sm font-bold text-slate-800">{fmt(d.conso_energie)}</p>
                      <p className="text-[10px] text-slate-400">kWh/m²/an</p>
                    </div>
                  )}
                  {d.emission_ges != null && (
                    <div className="rounded-lg bg-green-50 border border-green-100 p-2.5">
                      <div className="flex items-center gap-1 text-green-600 text-[10px] font-semibold mb-1">
                        <Leaf size={10} /> GES
                      </div>
                      <p className="text-sm font-bold text-slate-800">{fmt(d.emission_ges)}</p>
                      <p className="text-[10px] text-slate-400">kgCO₂/m²/an</p>
                    </div>
                  )}
                </div>

                {/* Détails techniques */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3 text-xs">
                  {d.surface && (
                    <DetailRow icon={Building2} label="Surface" value={`${d.surface} m²`} />
                  )}
                  {d.type_batiment && (
                    <DetailRow icon={Home} label="Type" value={d.type_batiment} />
                  )}
                  {d.periode_construction && (
                    <DetailRow icon={Calendar} label="Construction" value={d.periode_construction} />
                  )}
                  {d.chauffage && (
                    <DetailRow icon={Thermometer} label="Chauffage" value={d.chauffage} />
                  )}
                  {d.isolation && (
                    <DetailRow icon={Info} label="Isolation" value={d.isolation} />
                  )}
                </div>

                {/* Adresse DPE */}
                {d.adresse && (
                  <p className="text-[11px] text-slate-400 mt-2.5 flex items-center gap-1">
                    <MapPin size={9} className="shrink-0" />
                    {d.adresse}
                  </p>
                )}
              </div>
            ))}

            {dpe.length > 0 && (
              <p className="text-[10px] text-slate-300 text-center pt-1">
                Source : ADEME — DPE logements existants
              </p>
            )}
          </>
        )}

        {/* ═══ Contacts ════════════════════════════════════════════════════ */}
        {tab === 'contacts' && (
          <>
            {contactsLoading && <Spinner label="Recherche des propriétaires…" />}
            {contactsError && !contactsLoading && <ErrorMsg msg={contactsError} />}
            {!contactsLoading && !contactsError && contacts.length === 0 && (
              <Empty icon={Users} msg="Aucun propriétaire trouvé à cette adresse" sub="Essayez une parcelle avec une adresse plus précise." />
            )}
            {contacts.map((c) => (
              <div key={c.id} className="rounded-xl border border-slate-100 p-4 hover:border-[#1B54FF]/20 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{c.prenom} {c.nom}</p>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                      <MapPin size={10} className="shrink-0" />
                      {c.adresse_ban ?? c.adresse}, {c.code_postal} {c.ville}
                    </p>
                  </div>
                  {c.match_type && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                      c.match_type === 'exact' ? 'bg-green-100 text-green-700'
                      : c.match_type === 'fuzzy' ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-500'
                    }`}>
                      {c.match_type === 'exact' ? 'Exact' : c.match_type === 'fuzzy' ? 'Approché' : c.match_type}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {c.phone_value ? (
                    <a
                      href={`tel:${c.phone_value}`}
                      className="flex items-center gap-1.5 rounded-lg bg-[#1B54FF] text-white text-xs font-medium px-3 py-1.5 hover:bg-[#1B54FF]/90 transition"
                    >
                      <Phone size={12} /> {c.phone_value}
                    </a>
                  ) : c.phone_masked ? (
                    <button className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-200 transition">
                      <Phone size={12} /> {c.phone_masked} <ExternalLink size={10} />
                    </button>
                  ) : null}
                  {c.email_masked && (
                    <button className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium px-3 py-1.5 hover:bg-slate-200 transition">
                      <Mail size={12} /> {c.email_masked}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ── Petits composants utilitaires ─────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-2">
      <p className="text-[10px] text-slate-400 font-medium">{label}</p>
      <p className="text-xs font-semibold text-slate-700 mt-0.5">{value}</p>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-slate-600">
      <Icon size={11} className="text-slate-400 shrink-0" />
      <span className="text-slate-400">{label} :</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  )
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
      <Loader2 size={18} className="animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div className="text-center py-8 text-sm text-red-400 bg-red-50 rounded-xl">{msg}</div>
}

function Empty({ icon: Icon, msg, sub }: { icon: React.ElementType; msg: string; sub?: string }) {
  return (
    <div className="text-center py-12 text-sm text-slate-400">
      <Icon size={32} className="mx-auto mb-3 opacity-20" />
      <p className="font-medium text-slate-500">{msg}</p>
      {sub && <p className="mt-1.5 text-xs text-slate-400 max-w-xs mx-auto">{sub}</p>}
    </div>
  )
}
