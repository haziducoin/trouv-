// ─── API Prospects — interroge la table Supabase "contacts" ───────────────────
import { extractBirthCity, extractBirthYear, stripSensitiveFields } from '@/lib/privacy'
import { getSupabaseClient } from '@/lib/supabase'

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
  email:         string | null
  phone:         string | null
  phoneMobile:   string | null
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
}

export interface ProspectSearchParams {
  query:           string
  nom?:            string
  prenom?:         string
  city?:           string
  searchMode?:     'exact' | 'starts_with'
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
  const clean = stripSensitiveFields(row)

  const firstName = clean.prenom ?? clean.first_name ?? clean.firstName ?? ''
  const lastName  = clean.nom    ?? clean.last_name  ?? clean.lastName  ?? ''
  const companyName = clean.organisme ?? clean.company_name ?? clean.companyName ?? null

  return {
    id:            String(clean.id ?? crypto.randomUUID()),
    firstName,
    lastName,
    fullName:      `${firstName} ${lastName}`.trim() || companyName || 'Inconnu',
    jobTitle:      clean.situation    ?? clean.job_title   ?? clean.jobTitle   ?? null,
    companyName,
    companySiren:  null,
    activityCode:  null,
    activityLabel: null,
    companySize:   null,
    companyType:   null,
    email:         clean.email        ?? null,
    phone:         clean.telephone    ?? clean.phone        ?? null,
    phoneMobile:   clean.phone_mobile ?? clean.phoneMobile  ?? null,
    linkedinUrl:   clean.linkedin_url ?? clean.linkedinUrl  ?? null,
    website:       null,
    address:       clean.adresse      ?? clean.address      ?? null,
    city:          clean.ville        ?? clean.city         ?? null,
    zipCode:       clean.code_postal  ?? clean.zip_code     ?? clean.zipCode ?? null,
    department:    null,
    region:        null,
    country:       clean.country      ?? null,
    birthYear:     clean.birthYear    ?? extractBirthYear(clean),
    birthCity:     clean.birthCity    ?? extractBirthCity(clean),
    isActive:      true,
    createdAt:     clean.created_at   ?? new Date().toISOString(),
  }
}

export async function searchProspects(params: ProspectSearchParams): Promise<ProspectSearchResponse> {
  const supabase = getSupabaseClient()
  const pg = params.page    ?? 1
  const pp = params.perPage ?? 20

  let p_nom    = params.nom?.trim()    || null
  let p_prenom = params.prenom?.trim() || null

  if (!p_nom && !p_prenom && params.query.trim()) {
    const parts = params.query.trim().split(/\s+/)
    p_nom    = parts[0] || null
    p_prenom = parts.length > 1 ? parts.slice(1).join(' ') : null
  }

  const rpcParams: Record<string, any> = {
    p_limit:  pp,
    p_offset: (pg - 1) * pp,
    p_mode:   params.searchMode ?? 'exact',
  }
  if (p_nom)                  rpcParams.p_nom    = p_nom
  if (p_prenom)               rpcParams.p_prenom = p_prenom
  if (params.city?.trim())    rpcParams.p_ville  = params.city.trim()
  if (params.zipCode?.trim()) rpcParams.p_cp     = params.zipCode.trim()

  const timeoutMs = 10000
  const rpcPromise = supabase.rpc('search_contacts', rpcParams)
  const timeoutPromise = new Promise<{ data: null; error: { message: string; code: string } }>(
    (resolve) => setTimeout(() => resolve({ data: null, error: { message: 'Recherche trop longue — réessayez avec un nom exact', code: 'TIMEOUT' } }), timeoutMs)
  )

  const { data, error } = await Promise.race([rpcPromise, timeoutPromise])

  if (error) {
    if (
      error.message?.includes('Could not find') ||
      error.message?.includes('function') ||
      error.code === 'PGRST202'
    ) {
      return { results: [], total: 0, page: pg, perPage: pp, totalPages: 0 }
    }
    throw new Error(`Recherche impossible : ${error.message}`)
  }

  const rows  = (data ?? []) as Array<Record<string, any>>
  const total = rows.length > 0
    ? (Number(rows[0].total_count) || rows.length)
    : 0

  return {
    results:    rows.map(mapRow),
    total,
    page:       pg,
    perPage:    pp,
    totalPages: Math.ceil(total / pp),
  }
}

export function exportProspectsCSV(results: ProspectResult[], query: string) {
  const headers = [
    'Prénom', 'Nom', 'Poste', 'Entreprise',
    'Email', 'Téléphone fixe', 'Téléphone mobile', 'Réseau social public',
    'Adresse', 'Ville', 'Code postal', 'Pays',
    'Année de naissance', 'Ville de naissance',
  ]
  const rows = results.map(p => [
    p.firstName, p.lastName, p.jobTitle ?? '', p.companyName ?? '',
    p.email ?? '', p.phone ?? '', p.phoneMobile ?? '', p.linkedinUrl ?? '',
    p.address ?? '', p.city ?? '', p.zipCode ?? '', p.country ?? '',
    p.birthYear ?? '', p.birthCity ?? '',
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
