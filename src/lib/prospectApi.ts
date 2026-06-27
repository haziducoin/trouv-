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
  const raw = phone.replace(/[^\d+]/g, '')

  // Normalise vers E.164
  let e164: string
  if (raw.startsWith('+'))            e164 = raw
  else if (raw.startsWith('0033'))    e164 = '+33' + raw.slice(4)
  else if (raw.startsWith('0032'))    e164 = '+32' + raw.slice(4)
  else if (raw.startsWith('0041'))    e164 = '+41' + raw.slice(4)
  else if (raw.startsWith('0') && raw.length === 10) e164 = '+33' + raw.slice(1)
  else if (raw.length === 9 && /^[1-9]/.test(raw))   e164 = '+33' + raw
  else return phone

  // France: +33 X XX XX XX XX (12 chiffres après +)
  if (e164.startsWith('+33') && e164.length === 12) {
    const d = e164.slice(3)
    return `+33 ${d[0]} ${d.slice(1,3)} ${d.slice(3,5)} ${d.slice(5,7)} ${d.slice(7,9)}`
  }
  // Belgique: +32 XXX XX XX XX
  if (e164.startsWith('+32')) {
    const d = e164.slice(3)
    if (d.length === 8)  return `+32 ${d.slice(0,2)} ${d.slice(2,4)} ${d.slice(4,6)} ${d.slice(6,8)}`
    if (d.length === 9)  return `+32 ${d[0]} ${d.slice(1,4)} ${d.slice(4,6)} ${d.slice(6,9)}`
    return `+32 ${d}`
  }
  // Suisse: +41 XX XXX XX XX
  if (e164.startsWith('+41')) {
    const d = e164.slice(3)
    if (d.length === 9) return `+41 ${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5,7)} ${d.slice(7,9)}`
    return `+41 ${d}`
  }
  // Espagne: +34 XXX XXX XXX
  if (e164.startsWith('+34')) {
    const d = e164.slice(3)
    if (d.length === 9) return `+34 ${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)}`
    return `+34 ${d}`
  }
  // Italie: +39 XXX XXX XXXX
  if (e164.startsWith('+39')) {
    const d = e164.slice(3)
    return `+39 ${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
  }
  // Royaume-Uni: +44 XXXX XXXXXX
  if (e164.startsWith('+44')) {
    const d = e164.slice(3)
    if (d.length >= 10) return `+44 ${d.slice(0,4)} ${d.slice(4)}`
    return `+44 ${d}`
  }
  // Allemagne: +49 XXX XXXXXXX
  if (e164.startsWith('+49')) {
    const d = e164.slice(3)
    return `+49 ${d.slice(0,3)} ${d.slice(3)}`
  }
  // USA/Canada: +1 (XXX) XXX-XXXX
  if (e164.startsWith('+1') && e164.length === 12) {
    const d = e164.slice(2)
    return `+1 (${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6,10)}`
  }
  // Pays Bas: +31 X XXXX XXXX
  if (e164.startsWith('+31')) {
    const d = e164.slice(3)
    if (d.length === 9) return `+31 ${d[0]} ${d.slice(1,5)} ${d.slice(5,9)}`
    return `+31 ${d}`
  }

  // Fallback générique : retourne e164 brut
  return e164
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
  allIds?:        string[]        // IDs de toutes les fiches fusionnées
  phoneIds?:      string[]        // IDs des fiches ayant un téléphone (pour unlock ciblé)
  emailIds?:      string[]        // IDs des fiches ayant un email (pour unlock ciblé)
  mobiles?:       string[]        // téléphones débloqués (phone_value)
  mobilesLocked?: string[]        // téléphones masqués des autres fiches
  mobileRaw?:     string | null   // valeur brute du mobile (fiche unique) pour révéler après unlock
  allEmails?:     string[]        // emails débloqués des fiches fusionnées
  emailsLocked?:  string[]        // emails masqués des autres fiches
  allAddresses?:  MergedAddress[]
  mergedCount?:   number
}

export interface ProspectSearchParams {
  query:           string
  identity?:       string  // omnibar : "Jean Dupont" ou "Dupont Jean"
  nom?:            string
  prenom?:         string
  city?:           string
  address?:        string
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
    result.phoneIds      = row._phoneIds
    result.emailIds      = row._emailIds
    result.mobiles       = row._phones
    result.mobilesLocked = row._phonesLocked
    result.allEmails     = row._emails
    result.emailsLocked  = (row._emailsLocked as string[]).map(e => maskEmail(e) ?? e)
    result.allAddresses  = row._adresses
  } else if (row.telephone?.trim() && row.mobile?.trim() && row.telephone !== row.mobile) {
    // Fiche unique avec téléphone fixe ET mobile — afficher les deux
    if (phoneUnlocked) {
      // Phone débloqué → mobile révélé gratuitement (même crédit)
      const fmt = formatPhone(row.mobile)
      if (fmt && fmt !== result.phone) result.mobiles = [fmt]
    } else {
      // Phone verrouillé → mobile masqué, brut stocké pour révéler au déblocage
      const mobileMasked = maskPhone(row.mobile)
      if (mobileMasked && mobileMasked !== result.phone) {
        result.mobilesLocked = [mobileMasked]
        result.mobileRaw = row.mobile
      }
    }
  }

  return result
}

function maskPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw.slice(0, 6) + '••••'
}

function enrichRawContact(row: Record<string, any>): Record<string, any> {
  return {
    ...row,
    has_phone:      !!(row.telephone || row.mobile),
    has_email:      !!row.email,
    phone_masked:   maskPhone(row.telephone) ?? maskPhone(row.mobile),
    email_masked:   maskEmail(row.email),
    phone_unlocked: false,
    email_unlocked: false,
    phone_value:    null,
    email_value:    null,
    score:          0,
    total_count:    0,
  }
}

async function searchByAddressCluster(
  adresse: string,
  codePostal: string,
  page: number,
  perPage: number
): Promise<ProspectSearchResponse> {
  const supabase = getSupabaseClient()
  const formattedAddress = '%' + adresse.trim().replace(/\s+/g, '%') + '%'

  const { data, error } = await supabase.rpc('get_contacts_cluster_by_address', {
    p_adresse:     formattedAddress,
    p_code_postal: codePostal || null,
  })

  if (error) throw new Error(`Recherche impossible : ${error.message}`)

  const rows     = (data ?? []) as Array<Record<string, any>>
  const enriched = rows.map(enrichRawContact)
  const resolved = resolveEntities(enriched)

  const seen = new Set<string>()
  const results = resolved.map(mapRow).filter(p => {
    if (!p.hasPhone && !p.hasEmail) return false
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  const start = (page - 1) * perPage
  return {
    results:    results.slice(start, start + perPage),
    total:      results.length,
    page,
    perPage,
    totalPages: Math.ceil(results.length / perPage),
  }
}

// ─── Pivot Search : récupère toutes les fiches partageant les mêmes téléphones/emails ──

async function fetchPivotCluster(
  initialRows: Array<Record<string, any>>,
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<Array<Record<string, any>>> {
  const phoneSet = new Set<string>()
  const emailSet = new Set<string>()

  for (const row of initialRows) {
    const tel = (row.telephone ?? '').replace(/[^0-9]/g, '')
    const mob = (row.mobile    ?? '').replace(/[^0-9]/g, '')
    const em  = (row.email     ?? '').toLowerCase().trim()
    if (tel.length >= 6) phoneSet.add(tel)
    if (mob.length >= 6) phoneSet.add(mob)
    if (em.includes('@')) emailSet.add(em)
  }

  if (phoneSet.size === 0 && emailSet.size === 0) return initialRows

  const { data, error } = await supabase.rpc('get_contacts_by_pivots', {
    p_phone_digits: [...phoneSet],
    p_emails:       [...emailSet],
    p_limit:        1000,
  })

  if (error || !data) return initialRows

  const idSet  = new Set(initialRows.map(r => String(r.id)))
  const newRows = (data as Array<Record<string, any>>).filter(r => !idSet.has(String(r.id)))
  return [...initialRows, ...newRows]
}

export async function searchProspects(params: ProspectSearchParams): Promise<ProspectSearchResponse> {
  const supabase = getSupabaseClient()
  const pg = params.page    ?? 1
  const pp = params.perPage ?? 20

  const p_identity = params.identity?.trim() || null
  let p_nom    = params.nom?.trim()    || null
  let p_prenom = params.prenom?.trim() || null

  const queryRaw = params.query.trim()

  if (!p_identity && !p_nom && !p_prenom && queryRaw) {
    const parts = queryRaw.split(/\s+/)
    p_nom    = parts[0] || null
    p_prenom = parts.length > 1 ? parts.slice(1).join(' ') : null
  }

  // ── Recherche par email (query contient '@') ──────────────────────────────
  const isEmailSearch = queryRaw.includes('@') && !p_identity && !p_nom && !p_prenom
  if (isEmailSearch) {
    const { data, error } = await supabase.rpc('get_contacts_by_pivots', {
      p_phone_digits: [],
      p_emails:       [queryRaw.toLowerCase()],
      p_limit:        500,
    })
    if (error) throw new Error(`Recherche impossible : ${error.message}`)
    const emailRows = (data ?? []) as Array<Record<string, any>>
    const resolved  = resolveEntities(emailRows)
    const seen = new Set<string>()
    const all  = resolved.map(mapRow).filter(p => {
      if (!p.hasPhone && !p.hasEmail) return false
      if (seen.has(p.id)) return false
      seen.add(p.id); return true
    })
    return {
      results:    all.slice((pg - 1) * pp, pg * pp),
      total:      all.length,
      page:       pg,
      perPage:    pp,
      totalPages: Math.ceil(all.length / pp),
    }
  }

  // ── Recherche nominative avec Pivot Search ────────────────────────────────
  const isNameSearch = !!(p_identity || p_nom || p_prenom)

  const rpcParams: Record<string, any> = {
    // Pour le pivot on prend 50 seeds ; sinon pagination normale
    p_limit:  isNameSearch ? 50 : pp,
    p_offset: isNameSearch ? 0  : (pg - 1) * pp,
    p_mode:   params.searchMode ?? 'starts_with',
  }
  if (p_identity) {
    rpcParams.p_identity = p_identity
  } else {
    if (p_nom)    rpcParams.p_nom    = p_nom
    if (p_prenom) rpcParams.p_prenom = p_prenom
  }
  if (params.city?.trim())    rpcParams.p_ville   = params.city.trim()
  if (params.zipCode?.trim()) rpcParams.p_cp      = params.zipCode.trim()
  if (params.address?.trim()) rpcParams.p_adresse = params.address.trim()
  if (params.tel?.trim()) {
    const clean = params.tel.replace(/[\s\.\-\(\)]/g, '').trim()
    let normalizedTel = clean
    if      (clean.startsWith('+33'))            normalizedTel = clean.slice(3)
    else if (clean.startsWith('0033'))           normalizedTel = clean.slice(4)
    else if (/^0[1-9]\d{8}$/.test(clean))       normalizedTel = clean.slice(1)
    if (normalizedTel) rpcParams.p_tel = normalizedTel
  }
  if (params.birthYear?.trim() && (p_identity || (p_nom && p_prenom)))
    rpcParams.p_annee_naissance = params.birthYear.trim()

  const telOnly    = !!rpcParams.p_tel && !rpcParams.p_nom && !rpcParams.p_prenom && !rpcParams.p_identity
  const timeoutMs  = telOnly ? 30000 : 15000
  const rpcPromise = supabase.rpc('search_contacts_secure', rpcParams)
  const timeoutPromise = new Promise<{ data: null; error: { message: string; code: string } }>(
    (resolve) => setTimeout(() => resolve({ data: null, error: {
      message: telOnly
        ? 'Recherche par numéro trop longue — essayez d\'ajouter un nom'
        : 'Recherche trop longue — réessayez avec un nom exact',
      code: 'TIMEOUT',
    } }), timeoutMs)
  )

  const { data, error } = await Promise.race([rpcPromise, timeoutPromise])

  if (error) {
    if ((error as any).code === 'PGRST202') {
      return { results: [], total: 0, page: pg, perPage: pp, totalPages: 0 }
    }
    throw new Error(`Recherche impossible : ${error.message}`)
  }

  let rows = (data ?? []) as Array<Record<string, any>>

  // Pivot Search : pour les recherches nominatives, récupère toutes les fiches liées
  if (isNameSearch && rows.length > 0) {
    try {
      rows = await fetchPivotCluster(rows, supabase)
    } catch { /* fallback gracieux sur les résultats initiaux */ }
  }

  const resolved = resolveEntities(rows)

  const seen = new Set<string>()
  const all  = resolved.map(mapRow).filter(p => {
    if (!p.hasPhone && !p.hasEmail) return false
    if (seen.has(p.id)) return false
    seen.add(p.id); return true
  })

  // Pour les recherches nominatives : pagination en mémoire après pivot
  if (isNameSearch) {
    return {
      results:    all.slice((pg - 1) * pp, pg * pp),
      total:      all.length,
      page:       pg,
      perPage:    pp,
      totalPages: Math.ceil(all.length / pp),
    }
  }

  const total = rows.length > 0 ? (Number(rows[0].total_count) || rows.length) : 0
  return {
    results:    all,
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
  _field: UnlockField,
): Promise<EnrichBeforeUnlockResult> {
  const supabase = getSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée')

  const resp = await fetch('/api/enrich', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body:    JSON.stringify({ contact_id: prospect.id }),
    signal:  AbortSignal.timeout(12000),
  })

  if (!resp.ok) {
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
