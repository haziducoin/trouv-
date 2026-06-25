import type { ProspectResult, ProspectSearchParams } from './prospectApi'

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function maskEmailDemo(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  if (local.length <= 2) return `${local}@${domain}`
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`
}

export function strHash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}

function pick<T>(arr: T[], seed: number, off: number): T {
  return arr[(seed + off) % arr.length]
}

// ─── Listes de données ────────────────────────────────────────────────────────

const JOBS = [
  'Directeur Commercial', 'Responsable Marketing', 'Gérant', 'PDG', 'DRH',
  'Chef de Projet', 'Directeur Général', 'Consultant Senior', 'Responsable Commercial',
  'Directeur Administratif', 'Responsable Grands Comptes', 'Directeur des Ventes',
  'Responsable Développement', 'Directeur Technique', 'Responsable RH',
  'Directeur Financier', 'Responsable Communication', 'Chef d\'Entreprise',
]

const SUFFIXES = ['Corp', 'SAS', '& Associés', 'Conseil', 'Industries', 'Group', 'Solutions', 'Services']
const PREFIXES = ['Alpha', 'Beta', 'Nexus', 'Pro', 'Euro', 'Trans', 'Uni', 'Inter', 'Primo', 'Acme']
const CITIES   = ['Paris', 'Lyon', 'Marseille', 'Toulouse', 'Bordeaux', 'Nantes', 'Strasbourg', 'Lille', 'Nice', 'Rennes', 'Montpellier', 'Grenoble', 'Angers', 'Dijon', 'Reims']

const FIRST_NAMES = ['Jean', 'Sophie', 'Thomas', 'Marie', 'Pierre', 'Claire', 'Nicolas', 'Isabelle', 'François', 'Camille', 'Julien', 'Nathalie', 'Alexandre', 'Céline', 'Antoine', 'Laure', 'Mathieu', 'Émilie', 'Guillaume', 'Aurélie']
const LAST_NAMES  = ['Martin', 'Bernard', 'Dupont', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David', 'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Mercier']

// ─── Constructeur de prospect ─────────────────────────────────────────────────

export function makeDemoProspect(
  id: string,
  firstName: string,
  lastName: string,
  jobTitle: string,
  company: string,
  city: string,
): ProspectResult {
  return {
    id, firstName, lastName, fullName: `${firstName} ${lastName}`,
    jobTitle, companyName: company, companySiren: null, activityCode: null, activityLabel: null,
    companySize: '10-49', companyType: 'SAS',
    hasPhone: true, phoneUnlocked: false, phone: '+33 6 15 ** ** **', phoneMobile: null,
    hasEmail: true, emailUnlocked: false,
    email: maskEmailDemo(`${firstName[0].toLowerCase()}.${lastName.toLowerCase()}@gmail.com`),
    linkedinUrl: null, website: null,
    address: null, city, zipCode: null, department: null, region: null,
    country: 'France', birthYear: null, birthCity: null,
    isActive: true, createdAt: new Date().toISOString(),
  }
}

// ─── Générateur pour Bulk (par nom/prénom saisi) ───────────────────────────────

export function generateBulkDemoResults(row: { nom: string; prenom: string }): ProspectResult[] {
  const nom    = (row.nom.trim()    || 'Dupont').replace(/\s+/g, '')
  const prenom = (row.prenom.trim() || 'Jean')
  const seed   = strHash(prenom.toLowerCase() + nom.toLowerCase())
  const count  = 2 + (seed % 2)

  return Array.from({ length: count }, (_, i) => {
    const city    = pick(CITIES, seed, i * 7)
    const job     = pick(JOBS, seed, i * 5)
    const company = i === 0
      ? `${nom} ${pick(SUFFIXES, seed, 1)}`
      : `${pick(PREFIXES, seed, i * 3)}${nom}`
    return makeDemoProspect(`dyn-${seed}-${i}`, prenom, nom, job, company, city)
  })
}

// ─── Générateur pour recherche simple (par query/filtres) ─────────────────────

export function generateSearchDemoResults(
  params: ProspectSearchParams,
  count = 8,
): { results: ProspectResult[]; total: number; totalPages: number; page: number } {
  const seed = strHash((params.query ?? '') + (params.nom ?? '') + (params.prenom ?? '') + (params.department ?? '') + (params.activityCode ?? ''))

  // Détermine le job title à partir de la query
  const queryLower = (params.query ?? '').toLowerCase()
  const matchedJob = JOBS.find(j => queryLower && j.toLowerCase().includes(queryLower.split(' ')[0]))

  const results: ProspectResult[] = Array.from({ length: count }, (_, i) => {
    const lastName  = params.nom?.trim()    ? params.nom.trim()    : pick(LAST_NAMES,  seed, i * 3)
    const firstName = params.prenom?.trim() ? params.prenom.trim() : pick(FIRST_NAMES, seed, i * 7)
    const city      = params.city?.trim()   ? params.city.trim()   : pick(CITIES,      seed, i * 5)
    const job       = matchedJob ?? pick(JOBS, seed, i * 11)
    const company   = i % 2 === 0
      ? `${lastName} ${pick(SUFFIXES, seed, i * 2)}`
      : `${pick(PREFIXES, seed, i * 4)} ${lastName}`
    const uid       = `sdemo-${seed}-${i}`
    return makeDemoProspect(uid, firstName, lastName, job, company, city)
  })

  const total = count + Math.floor((seed % 5) * 10)
  return { results, total, totalPages: Math.ceil(total / (params.perPage ?? count)), page: params.page ?? 1 }
}
