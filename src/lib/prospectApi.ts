// ─── API Prospects — recherche sécurisée (masquage serveur) + déblocage crédits ─
import { getSupabaseClient } from '@/lib/supabase'

function fixMojibake(str: string): string {
  if (!/[Ã\xC0-\xC5]/.test(str)) return str
  try {
    const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return str
  }
}

function extractYear(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const m = String(dateStr).match(/\b(19|20)\d{2}\b/)
  return m ? m[0] : null
}

function toTitleCase(str: string | null | undefined): string | null {
  if (!str) return null
  const fixed = fixMojibake(str)
  return fixed.toLowerCase().replace(/(^|[ \-'])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase())
}

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const clean = phone.replace(/[^\d+]/g, '')
  let digits: string

  if (clean.startsWith('+33') && clean.length === 12) digits = clean.slice(3)
  else if (clean.startsWith('0033') && clean.length === 13) digits = clean.slice(4)
  else if (clean.startsWith('0') && clean.length === 10) digits = clean.slice(1)
  else if (clean.length === 9 && /^[1-9]/.test(clean)) digits = clean
  else return phone

  return `+33 ${digits[0]} ${digits.slice(1, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`
}

export type UnlockField = 'phone' | 'email'

export interface ProspectResult {
  id:            string
  firstName:     string
  lastName:      string
  fullName:      string
  jobTitle:      string | null
  companyName:   string | null
  companySiren:  string | null
  activityCode:  string | null
  activityLabel: string | null
  companySize:   string | null
  companyType:   string | null
  // Contacts — valeur affichée (masquée si verrouillée, complète si débloquée)
  hasPhone:      boolean
  phoneUnlocked: boolean
  phone:         string | null
  phoneMobile:   string | null
  hasEmail:      boolean
  emailUnlocked: boolean
  email:         string | null
  linkedinUrl:   string | null
  website:       string | null
  address:       string | null
  city:          string | null
  zipCode:       string | null
  department:    string | null
  region:        string | null
  country?:      string | null
  birthYear?:    string | null
  birthCity?:    string | null
  isActive:      boolean
  createdAt:     string
  // Déduplication — tableaux issus de la fusion d'enregistrements homonymes
  emails:        string[]
  addresses:     Array<{ address: string | null; city: string | null; zipCode: string | null }>
  mergedCount:   number
}

export interface ProspectSearchParams {
  query:           string
  identity?:       string
  nom?:            string
  prenom?:         string
  city?:           string
  tel?:            string
  birthYear?:      string
  searchMode?:     'exact' | 'starts_with' | 'ends_with' | 'contains'
  department?:     string
  activityCode?:   string
  zipCode?:        string
  employeeRange?:  string
  legalForm?:      string
  activeOnly?:     boolean
  page?:           number
  perPage?:        number
}

export interface ProspectSearchResponse {
  results:    ProspectResult[]
  total:      number
  page:       number
  perPage:    number
  totalPages: number
}

function mapRow(row: Record<string, any>): ProspectResult {
  const firstName   = toTitleCase(row.prenom) ?? ''
  const lastName    = toTitleCase(row.nom) ?? ''
  const companyName = toTitleCase(row.societe) ?? null
  const phoneUnlocked = !!row.phone_unlocked
  const emailUnlocked = !!row.email_unlocked

  // Emails : tableau fusionné si disponible, sinon email principal
  const primaryEmail = emailUnlocked ? (row.email_value ?? null) : (row.email_masked ?? null)
  const emails: string[] = emailUnlocked
    ? (Array.isArray(row.emails_values) && row.emails_values.length > 0
        ? row.emails_values
        : primaryEmail ? [primaryEmail] : [])
    : (Array.isArray(row.emails_masked) && row.emails_masked.length > 0
        ? row.emails_masked
        : primaryEmail ? [primaryEmail] : [])

  // Adresses : tableau fusionné si disponible, sinon adresse principale
  const rawAdresses: Array<{ adresse: string | null; code_postal: string | null; ville: string | null }> =
    Array.isArray(row.adresses) && row.adresses.length > 0
      ? row.adresses
      : (row.adresse || row.ville)
        ? [{ adresse: row.adresse ?? null, code_postal: row.code_postal ?? null, ville: row.ville ?? null }]
        : []

  const addresses = rawAdresses.map(a => ({
    address: a.adresse ?? null,
    city:    toTitleCase(a.ville) ?? null,
    zipCode: a.code_postal ?? null,
  }))

  return {
    id:            String(row.id),
    firstName,
    lastName,
    fullName:      `${firstName} ${lastName}`.trim() || companyName || 'Inconnu',
    jobTitle:      null,
    companyName,
    companySiren:  null,
    activityCode:  null,
    activityLabel: null,
    companySize:   null,
    companyType:   null,
    hasPhone:      !!row.has_phone,
    phoneUnlocked,
    phone:         phoneUnlocked ? formatPhone(row.phone_value) : (row.phone_masked ?? null),
    phoneMobile:   null,
    hasEmail:      !!row.has_email,
    emailUnlocked,
    email:         primaryEmail,
    linkedinUrl:   null,
    website:       null,
    address:       addresses[0]?.address ?? null,
    city:          addresses[0]?.city    ?? null,
    zipCode:       addresses[0]?.zipCode ?? null,
    department:    null,
    region:        null,
    country:       null,
    birthYear:     extractYear(row.date_naissance),
    birthCity:     null,
    isActive:      true,
    createdAt:     new Date().toISOString(),
    emails,
    addresses,
    mergedCount:   typeof row.merged_count === 'number' ? row.merged_count : 1,
  }
}

export async function searchProspects(params: ProspectSearchParams): Promise<ProspectSearchResponse> {
  const supabase = getSupabaseClient()
  const pg = params.page    ?? 1
  const pp = params.perPage ?? 20

  const p_identity = params.identity?.trim() || null
  let p_nom    = p_identity ? null : (params.nom?.trim()    || null)
  let p_prenom = p_identity ? null : (params.prenom?.trim() || null)

  if (!p_identity && !p_nom && !p_prenom && params.query.trim()) {
    const parts = params.query.trim().split(/\s+/)
    p_nom    = parts[0] || null
    p_prenom = parts.length > 1 ? parts.slice(1).join(' ') : null
  }

  const p_ville = params.city?.trim()    || null
  const p_cp    = params.zipCode?.trim() || null
  const p_tel   = params.tel?.trim()     || null
  const p_mode  = params.searchMode ?? 'starts_with'

  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée, reconnectez-vous')

  const body: Record<string, unknown> = {
    p_identity: p_identity ?? null,
    p_nom:      p_identity ? null : p_nom,
    p_prenom:   p_identity ? null : p_prenom,
    p_ville, p_cp, p_tel,
    p_mode,
    p_limit:  pp,
    p_offset: (pg - 1) * pp,
  }
  if (params.birthYear?.trim() && (p_identity || (p_nom && p_prenom)))
    body.p_annee_naissance = params.birthYear.trim()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  let resp: Response
  try {
    resp = await fetch('/api/search', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body:   JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: any) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Recherche trop longue — affinez avec un prénom ou une ville')
    throw err
  }
  clearTimeout(timer)

  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({ error: resp.statusText }))
    throw new Error(`Recherche impossible : ${error}`)
  }

  const { results: rows } = (await resp.json()) as { results: Array<Record<string, any>> }
  const total = rows.length > 0 ? (Number(rows[0].total_count) || rows.length) : 0

  // Déduplique par id de contact ; ne garde que les fiches avec au moins un contact.
  const seen = new Set<string>()
  const results = rows.map(mapRow).filter(p => {
    if (!p.hasPhone && !p.hasEmail) return false
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  return {
    results,
    total,
    page:       pg,
    perPage:    pp,
    totalPages: Math.ceil(total / pp),
  }
}

// ─── Enrichissement avant unlock (ne consomme PAS de crédit) ────────────────

export interface EnrichBeforeUnlockResult {
  confidence_score:    number
  status:              'confirmed' | 'likely' | 'uncertain' | 'possible_homonym' | 'insufficient_data'
  user_facing_message: string
  show_warning:        boolean
  safe_enrichments: {
    company:               string | null
    job_title:             string | null
    public_profile_url:    string | null
    professional_location: string | null
  }
}

export async function enrichBeforeUnlock(
  prospect: ProspectResult,
  field: UnlockField,
): Promise<EnrichBeforeUnlockResult> {
  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée')

  const resp = await fetch('/api/enrich', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      contact_id:        prospect.id,
      unlock_type:       field,
      prenom:            prospect.firstName,
      nom:               prospect.lastName,
      ville:             prospect.city ?? null,
      entreprise:        prospect.companyName ?? null,
      annee_naissance:   prospect.birthYear ?? null,
      tel_masque:        !prospect.phoneUnlocked ? (prospect.phone ?? null) : null,
      email_masque:      !prospect.emailUnlocked ? (prospect.email ?? null) : null,
      adresse_partielle: prospect.address ?? null,
    }),
    signal: AbortSignal.timeout(12000),
  })

  if (!resp.ok) {
    // Erreur IA → on ne bloque pas l'unlock, on laisse passer sans warning
    return {
      confidence_score:    50,
      status:              'uncertain',
      user_facing_message: '',
      show_warning:        false,
      safe_enrichments:    { company: null, job_title: null, public_profile_url: null, professional_location: null },
    }
  }

  return resp.json() as Promise<EnrichBeforeUnlockResult>
}

// ─── Enrichissement à l'ouverture d'une fiche (sans consommer de crédit) ─────
export async function enrichContactPreview(contactId: string): Promise<EnrichBeforeUnlockResult> {
  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée')

  const resp = await fetch('/api/enrich', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body:    JSON.stringify({ contact_id: contactId }),
    signal:  AbortSignal.timeout(15000),
  })

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json() as Promise<EnrichBeforeUnlockResult>
}

// ─── Déblocage d'un champ (consomme 1 crédit, idempotent) ───────────────────
export class UnlockError extends Error {
  public readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'UnlockError'
    this.code = code
  }
}

/** Débloque le téléphone ou l'email d'un contact. Renvoie la valeur complète. */
export async function unlockContactField(contactId: string, field: UnlockField): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('unlock_contact_field', {
    p_contact_id: Number(contactId),
    p_field:      field,
  })

  if (error) {
    // Le code métier est dans le message de l'exception PostgreSQL.
    const raw = (error.message || '').toLowerCase()
    let code = 'unknown'
    if (raw.includes('no_subscription'))   code = 'no_subscription'
    else if (raw.includes('no_phone_credits')) code = 'no_phone_credits'
    else if (raw.includes('no_email_credits')) code = 'no_email_credits'
    else if (raw.includes('no_credits'))    code = 'no_credits'
    else if (raw.includes('not_approved'))  code = 'not_approved'
    else if (raw.includes('no_data'))       code = 'no_data'
    throw new UnlockError(code, error.message)
  }

  return field === 'phone' ? (formatPhone(data as string) ?? (data as string)) : (data as string)
}

// ─── Solde de crédits de l'organisation ─────────────────────────────────────
export interface CreditBalance {
  phoneCredits:      number
  emailCredits:      number
  unlimited:         boolean
  totalPhoneCredits?: number
  totalEmailCredits?: number
}

export async function getCreditBalance(): Promise<CreditBalance | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('credit_balances')
    .select('phone_credits, email_credits, unlimited')
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return {
    phoneCredits: data.phone_credits ?? 0,
    emailCredits: data.email_credits ?? 0,
    unlimited:    !!data.unlimited,
  }
}

export function exportProspectsCSV(results: ProspectResult[], query: string) {
  const headers = ['Prénom', 'Nom', 'Entreprise', 'Email', 'Téléphone', 'Adresse', 'Ville', 'Code postal']
  const rows = results.map(p => [
    p.firstName, p.lastName, p.companyName ?? '',
    p.emailUnlocked ? (p.email ?? '') : '', p.phoneUnlocked ? (p.phone ?? '') : '',
    p.address ?? '', p.city ?? '', p.zipCode ?? '',
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `contacts_${query || 'recherche'}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
