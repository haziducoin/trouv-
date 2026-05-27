const COMPANY_SEARCH_ENDPOINT = 'https://recherche-entreprises.api.gouv.fr/search'

interface CompanySearchResponse {
  results: CompanySearchResult[]
}

interface CompanySearchResult {
  siren: string
  nom_complet?: string | null
  nom_raison_sociale?: string | null
  activite_principale?: string | null
  etat_administratif?: string | null
  siege?: {
    adresse?: string | null
    code_postal?: string | null
    libelle_commune?: string | null
  } | null
}

export interface VerifiedCompany {
  siren: string
  name: string
  address?: string
  activityCode?: string
  isActive: boolean
}

export function normalizeSiren(value: string) {
  return value.replace(/\s/g, '')
}

export async function findCompanyBySiren(rawSiren: string): Promise<VerifiedCompany | null> {
  const siren = normalizeSiren(rawSiren)

  if (!/^\d{9}$/.test(siren)) {
    throw new Error('Saisissez un numéro SIREN valide à 9 chiffres.')
  }

  const url = new URL(COMPANY_SEARCH_ENDPOINT)
  url.searchParams.set('q', siren)
  url.searchParams.set('page', '1')
  url.searchParams.set('per_page', '1')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('La vérification est temporairement indisponible.')
  }

  const payload = (await response.json()) as CompanySearchResponse
  const company = payload.results.find((result) => result.siren === siren)
  if (!company) {
    return null
  }

  return {
    siren: company.siren,
    name: company.nom_raison_sociale || company.nom_complet || `Entreprise ${company.siren}`,
    address: company.siege?.adresse || undefined,
    activityCode: company.activite_principale || undefined,
    isActive: company.etat_administratif === 'A',
  }
}
