// ─── API Prospects — recherche sécurisée (masquage serveur) + déblocage crédits ─
import { getSupabaseClient } from '@/lib/supabase'
import { resolveEntities, type MergedAddress } from '@/lib/entityResolution'

function fixMojibake(str: string): string {
  if (!/[Ã\xC0-\xC5]/.test(str)) return str
  try {
    const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return str
  }
}

function maskEmail(raw: string | null | undefined): string | null {
  if (!raw) return null
  const at = raw.indexOf('@')
  if (at < 0) return raw
  const local = raw.slice(0, at)
  const visible = local.slice(0, 1)
  return `${visible}${'•'.repeat(Math.max(4, local.length - 1))}@••••`
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
  // Entity resolution — présent quand plusieurs fiches ont été fusionnées
  allIds?:        string[]        // IDs de toutes les fiches fusionnées (pour unlock en lot)
  mobiles?:       string[]        // téléphones débloqués (phone_value)
  mobilesLocked?: string[]        // téléphones masqués des autres fiches
  allEmails?:     string[]
  allAddresses?:  MergedAddress[]
  mergedCount?:   number
}

export interface ProspectSearchParams {
  query:           string
  identity?:       string  // omnibar : "Jean Dupont" ou "Dupont Jean"
  nom?:            string
  prenom?:         string
  city?:           string
  tel?:            string
  searchMode?:     'exact' | 'starts_with' | 'ends_with' | 'contains'
  department?:     string
  activityCode?:   string
  zipCode?:        string
  employeeRange?:  string
  legalForm?:      string
  activeOnly?:     boolean
  birthYear?:      string
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

function looksLikePhone(value: string | null | undefined): boolean {
  if (!value) return false
  return /^[0-9][0-9\s\.\-\+]{6,}$/.test(value.trim())
}

function mapRow(row: Record<string, any>): ProspectResult {
  const firstName   = toTitleCase(row.prenom) ?? ''
  const lastName    = toTitleCase(row.nom) ?? ''
  const companyName = toTitleCase(row.societe) ?? null
  const phoneUnlocked = !!row.phone_unlocked
  const emailUnlocked = !!row.email_unlocked

  const result: ProspectResult = {
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
    email:         emailUnlocked ? (looksLikePhone(row.email_value) ? null : (row.email_value ?? null)) : (looksLikePhone(row.email_masked) ? null : maskEmail(row.email_masked)),
    linkedinUrl:   null,
    website:       null,
    address:       row.adresse ?? null,
    city:          row.ville ?? null,
    zipCode:       row.code_postal ?? null,
    department:    null,
    region:        null,
    country:       null,
    birthYear:     row.date_naissance ? (row.date_naissance.match(/[0-9]{4}/)?.[0] ?? null) : null,
    birthCity:     null,
    isActive:      true,
    createdAt:     new Date().toISOString(),
  }

  // Champs issus de l'entity resolution (présents uniquement sur les fiches fusionnées)
  if (row._mergedCount > 1) {
    result.mergedCount   = row._mergedCount
    result.allIds        = row._ids
    result.mobiles       = row._phones
    result.mobilesLocked = row._phonesLocked
    result.allEmails     = row._emails
    result.allAddresses  = row._adresses
  }

  return result
}

export async function searchProspects(params: ProspectSearchParams): Promise<ProspectSearchResponse> {
  const supabase = getSupabaseClient()
  const pg = params.page    ?? 1
  const pp = params.perPage ?? 20

  const p_identity = params.identity?.trim() || null
  let p_nom    = params.nom?.trim()    || null
  let p_prenom = params.prenom?.trim() || null

  if (!p_identity && !p_nom && !p_prenom && params.query.trim()) {
    const parts = params.query.trim().split(/\s+/)
    p_nom    = parts[0] || null
    p_prenom = parts.length > 1 ? parts.slice(1).join(' ') : null
  }

  const rpcParams: Record<string, any> = {
    p_limit:  pp,
    p_offset: (pg - 1) * pp,
    p_mode:   params.searchMode ?? 'starts_with',
  }
  if (p_identity) {
    // Mode omnibar : un seul champ, le backend split et rank
    rpcParams.p_identity = p_identity
  } else {
    if (p_nom)    rpcParams.p_nom    = p_nom
    if (p_prenom) rpcParams.p_prenom = p_prenom
  }
  if (params.city?.trim())    rpcParams.p_ville  = params.city.trim()
  if (params.zipCode?.trim()) rpcParams.p_cp     = params.zipCode.trim()
  if (params.tel?.trim())     rpcParams.p_tel    = params.tel.trim()
  // Année de naissance — uniquement si identity OU (nom ET prénom) fournis
  if (params.birthYear?.trim() && (p_identity || (p_nom && p_prenom)))
    rpcParams.p_annee_naissance = params.birthYear.trim()

  const timeoutMs = 10000
  const rpcPromise = supabase.rpc('search_contacts_secure', rpcParams)
  const timeoutPromise = new Promise<{ data: null; error: { message: string; code: string } }>(
    (resolve) => setTimeout(() => resolve({ data: null, error: { message: 'Recherche trop longue — réessayez avec un nom exact', code: 'TIMEOUT' } }), timeoutMs)
  )

  const { data, error } = await Promise.race([rpcPromise, timeoutPromise])

  if (error) {
    if ((error as any).code === 'PGRST202') {
      return { results: [], total: 0, page: pg, perPage: pp, totalPages: 0 }
    }
    throw new Error(`Recherche impossible : ${error.message}`)
  }

  const rows  = (data ?? []) as Array<Record<string, any>>
  const total = rows.length > 0 ? (Number(rows[0].total_count) || rows.length) : 0

  // Entity resolution : fusionne les doublons (même personne, données différentes)
  const resolved = resolveEntities(rows)

  // Déduplique par id de contact ; ne garde que les fiches avec au moins un contact.
  const seen = new Set<string>()
  const results = resolved.map(mapRow).filter(p => {
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

// ─── Déblocage sécurisé (server-side : vérifie crédits + retourne valeur réelle) ─
export class UnlockError extends Error {
  public readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'UnlockError'
    this.code = code
  }
}

/** Débloque téléphone ou email : vérifie crédits, déduit 1, retourne la valeur en clair. */
export async function unlockContactField(contactId: string, field: UnlockField): Promise<string> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.rpc('unlock_contact_field', {
    p_contact_id: Number(contactId),
    p_field:      field,
  })

  if (error) {
    const raw = (error.message || '').toLowerCase()
    let code = 'unknown'
    if (raw.includes('no_subscription'))       code = 'no_subscription'
    else if (raw.includes('no_phone_credits')) code = 'no_phone_credits'
    else if (raw.includes('no_email_credits')) code = 'no_email_credits'
    else if (raw.includes('no_credits'))       code = 'no_credits'
    else if (raw.includes('not_approved'))     code = 'not_approved'
    else if (raw.includes('no_data'))          code = 'no_data'
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
