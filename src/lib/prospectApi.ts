// ─── API Prospects — interroge la table Supabase "prospects" ──────────────────
import { extractBirthCity, extractBirthYear, stripSensitiveFields } from '@/lib/privacy'
import { getSupabaseClient } from '@/lib/supabase'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

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
  const firstName = clean.first_name ?? clean.firstName ?? ''
  const lastName = clean.last_name ?? clean.lastName ?? ''
  const companyName = clean.company_name ?? clean.companyName ?? null

  return {
    id:            String(clean.id ?? crypto.randomUUID()),
    firstName,
    lastName,
    fullName:      clean.fullName ?? (`${firstName} ${lastName}`.trim() || companyName || 'Inconnu'),
    jobTitle:      clean.job_title      ?? clean.jobTitle ?? null,
    companyName,
    companySiren:  null,
    activityCode:  null,
    activityLabel: clean.activity_label ?? clean.activityLabel ?? null,
    companySize:   null,
    companyType:   null,
    email:         clean.email          ?? null,
    phone:         clean.phone          ?? null,
    phoneMobile:   clean.phone_mobile   ?? clean.phoneMobile ?? null,
    linkedinUrl:   clean.linkedin_url   ?? clean.linkedinUrl ?? clean.public_social_url ?? null,
    website:       null,
    address:       clean.address        ?? null,
    city:          clean.city           ?? null,
    zipCode:       clean.zip_code       ?? clean.zipCode ?? null,
    department:    null,
    region:        null,
    country:       clean.country        ?? null,
    birthYear:     clean.birthYear      ?? extractBirthYear(clean),
    birthCity:     clean.birthCity      ?? extractBirthCity(clean),
    isActive:      true,
    createdAt:     clean.created_at     ?? new Date().toISOString(),
  }
}

export async function searchProspects(params: ProspectSearchParams): Promise<ProspectSearchResponse> {
  const supabase  = getSupabaseClient()
  const pg        = params.page    ?? 1
  const pp        = params.perPage ?? 20
  const token     = (await supabase.auth.getSession()).data.session?.access_token

  if (token) {
    try {
      const response = await fetch(`${API_URL}/api/prospects/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...params, page: pg, perPage: pp }),
      })

      if (!response.ok) throw new Error(`API prospects indisponible (${response.status})`)

      const payload = await response.json() as ProspectSearchResponse
      return {
        ...payload,
        results: (payload.results ?? []).map(row => mapRow(row as unknown as Record<string, any>)),
      }
    } catch (error) {
      if (import.meta.env.PROD) throw error
    }
  }

  const { data, error } = await supabase.rpc('search_prospects', {
    p_query:          params.query.trim(),
    p_department:     params.department    ?? '',
    p_activity_code:  params.activityCode  ?? '',
    p_zip_code:       params.zipCode       ?? '',
    p_employee_range: params.employeeRange ?? '',
    p_legal_form:     params.legalForm     ?? '',
    p_page:           pg,
    p_per_page:       pp,
  })

  if (error) {
    // Fonction RPC absente = SQL pas encore exécuté dans Supabase → état vide silencieux
    if (
      error.message?.includes('Could not find') ||
      error.message?.includes('function') ||
      error.code === 'PGRST202'
    ) {
      return { results: [], total: 0, page: pg, perPage: pp, totalPages: 0 }
    }
    throw new Error(`Recherche impossible : ${error.message}`)
  }

  const rows = (data ?? []) as Array<Record<string, any>>
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0

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
  a.download = `prospects_${query || 'immobilier'}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
