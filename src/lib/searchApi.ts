// ─── API Recherche Entreprises (gouvernement français, gratuite, sans clé) ──
const BASE = 'https://recherche-entreprises.api.gouv.fr/search'

// Codes NAF immobilier & transactions
export const IMMO_CODES = [
  '6831Z', // Agences immobilières
  '6832A', // Administration d'immeubles
  '6832B', // Supports de gestion de fonds
  '6810Z', // Marchands de biens
  '6820A', // Location de logements
  '6820B', // Location terrains
  '6800Z', // Activités immobilières
]

export const TYPE_LABELS: Record<string, string> = {
  '6831Z': 'Agence immobilière',
  '6832A': 'Administrateur de biens',
  '6832B': 'Gestionnaire de fonds',
  '6810Z': 'Marchand de biens',
  '6820A': 'Bailleur / Location',
  '6820B': 'Bailleur / Location',
  '6800Z': 'Immobilier (autre)',
}

export interface CompanyResult {
  siren:          string
  name:           string
  activityCode:   string
  activityLabel:  string
  typeLabel:      string
  address:        string
  city:           string
  zipCode:        string
  department:     string
  isActive:       boolean
  employees:      string | null   // tranche
  createdAt:      string | null
  etablissements: number
}

export interface SearchParams {
  query:       string
  department?: string
  activityCode?: string
  activeOnly?: boolean
  page?:       number
  perPage?:    number
}

export interface SearchResponse {
  results:    CompanyResult[]
  total:      number
  page:       number
  perPage:    number
  totalPages: number
}

// Mapping tranches effectif
const EFFECTIF: Record<string, string> = {
  'NN': 'NC', '00': '0', '01': '1-2', '02': '3-5', '03': '6-9',
  '11': '10-19', '12': '20-49', '21': '50-99', '22': '100-199',
  '31': '200-249', '32': '250-499', '41': '500-999', '42': '1000-1999',
  '51': '2000-4999', '52': '5000-9999', '53': '10 000+',
}

function mapResult(r: any): CompanyResult {
  const siege = r.siege ?? {}
  const zip   = siege.code_postal ?? ''
  const dept  = zip.slice(0, 2)
  const code  = r.activite_principale?.replace(/\./g, '') ?? ''

  return {
    siren:         r.siren ?? '',
    name:          r.nom_raison_sociale || r.nom_complet || `Entreprise ${r.siren}`,
    activityCode:  code,
    activityLabel: r.libelle_activite_principale ?? '',
    typeLabel:     TYPE_LABELS[code] ?? 'Immobilier',
    address:       siege.adresse ?? '',
    city:          siege.libelle_commune ?? '',
    zipCode:       zip,
    department:    dept,
    isActive:      r.etat_administratif === 'A',
    employees:     EFFECTIF[r.tranche_effectif_salarie ?? ''] ?? null,
    createdAt:     r.date_creation ?? null,
    etablissements: r.nombre_etablissements ?? 1,
  }
}

export async function searchCompanies(params: SearchParams): Promise<SearchResponse> {
  const p = new URLSearchParams()

  // Requête principale
  if (params.query.trim()) p.set('q', params.query.trim())
  else p.set('q', 'immobilier')  // fallback pour recherche vide

  p.set('page',     String(params.page ?? 1))
  p.set('per_page', String(params.perPage ?? 20))

  // Filtre secteur immobilier
  if (params.activityCode) {
    p.set('activite_principale', params.activityCode)
  } else {
    // Filtre multi-codes NAF immobilier
    p.set('section_activite_principale', 'L')  // section L = immobilier INSEE
  }

  if (params.department) p.set('departement', params.department)
  if (params.activeOnly) p.set('etat_administratif', 'A')

  const res = await fetch(`${BASE}?${p}`, {
    headers: { 'Accept': 'application/json' },
  })

  if (!res.ok) throw new Error(`API indisponible (${res.status})`)

  const json = await res.json()
  const total = json.total_results ?? 0

  return {
    results:    (json.results ?? []).map(mapResult),
    total,
    page:       params.page ?? 1,
    perPage:    params.perPage ?? 20,
    totalPages: Math.ceil(total / (params.perPage ?? 20)),
  }
}

// Liste des départements français
export const DEPARTMENTS = [
  { code: '75', label: 'Paris (75)' },
  { code: '13', label: 'Bouches-du-Rhône (13)' },
  { code: '69', label: 'Rhône (69)' },
  { code: '31', label: 'Haute-Garonne (31)' },
  { code: '33', label: 'Gironde (33)' },
  { code: '06', label: 'Alpes-Maritimes (06)' },
  { code: '59', label: 'Nord (59)' },
  { code: '67', label: 'Bas-Rhin (67)' },
  { code: '44', label: 'Loire-Atlantique (44)' },
  { code: '34', label: 'Hérault (34)' },
  { code: '92', label: 'Hauts-de-Seine (92)' },
  { code: '93', label: 'Seine-Saint-Denis (93)' },
  { code: '94', label: 'Val-de-Marne (94)' },
  { code: '78', label: 'Yvelines (78)' },
  { code: '91', label: 'Essonne (91)' },
  { code: '95', label: 'Val-d\'Oise (95)' },
  { code: '77', label: 'Seine-et-Marne (77)' },
  { code: '76', label: 'Seine-Maritime (76)' },
  { code: '57', label: 'Moselle (57)' },
  { code: '38', label: 'Isère (38)' },
  { code: '74', label: 'Haute-Savoie (74)' },
  { code: '83', label: 'Var (83)' },
  { code: '37', label: 'Indre-et-Loire (37)' },
  { code: '54', label: 'Meurthe-et-Moselle (54)' },
  { code: '29', label: 'Finistère (29)' },
  { code: '35', label: 'Ille-et-Vilaine (35)' },
]
