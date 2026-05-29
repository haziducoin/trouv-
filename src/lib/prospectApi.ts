// ─── API Prospects — interroge la table Supabase "prospects" ──────────────────
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
  return {
    id:            row.id,
    firstName:     row.first_name  ?? '',
    lastName:      row.last_name   ?? '',
    fullName:      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.company_name || 'Inconnu',
    jobTitle:      row.job_title      ?? null,
    companyName:   row.company_name   ?? null,
    companySiren:  row.company_siren  ?? null,
    activityCode:  row.activity_code  ?? null,
    activityLabel: row.activity_label ?? null,
    companySize:   row.company_size   ?? null,
    companyType:   row.company_type   ?? null,
    email:         row.email          ?? null,
    phone:         row.phone          ?? null,
    phoneMobile:   row.phone_mobile   ?? null,
    linkedinUrl:   row.linkedin_url   ?? null,
    website:       row.website        ?? null,
    address:       row.address        ?? null,
    city:          row.city           ?? null,
    zipCode:       row.zip_code       ?? null,
    department:    row.department     ?? null,
    region:        row.region         ?? null,
    isActive:      row.is_active      ?? true,
    createdAt:     row.created_at     ?? new Date().toISOString(),
  }
}

export async function searchProspects(params: ProspectSearchParams): Promise<ProspectSearchResponse> {
  const supabase  = getSupabaseClient()
  const pg        = params.page    ?? 1
  const pp        = params.perPage ?? 20

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
    'Prénom', 'Nom', 'Poste', 'Entreprise', 'SIREN',
    'Email', 'Téléphone', 'Mobile', 'LinkedIn',
    'Adresse', 'Ville', 'Code postal', 'Département', 'Région',
    'Activité NAF', 'Taille', 'Statut',
  ]
  const rows = results.map(p => [
    p.firstName, p.lastName, p.jobTitle ?? '', p.companyName ?? '', p.companySiren ?? '',
    p.email ?? '', p.phone ?? '', p.phoneMobile ?? '', p.linkedinUrl ?? '',
    p.address ?? '', p.city ?? '', p.zipCode ?? '', p.department ?? '', p.region ?? '',
    p.activityCode ?? '', p.companySize ?? '', p.isActive ? 'Actif' : 'Inactif',
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
