// Entity Resolution — fusion intelligente des doublons de personnes
//
// Règles de fusion (OR) au sein d'un groupe de même nom/prénom :
//   A — même phone_masked (préfixe visible du numéro)
//   B — même date_naissance (homonyme certifié par la date de naissance)
//   C — même adresse complète (rue + code postal, foyer identique)
//
// Jamais de fusion sur nom+prénom+ville/CP seuls → trop de faux positifs.

export interface RawRow {
  id:             number | string
  nom:            string | null
  prenom:         string | null
  adresse:        string | null
  code_postal:    string | null
  ville:          string | null
  societe:        string | null
  phone_masked:   string | null
  phone_unlocked: boolean
  phone_value:    string | null
  has_phone:      boolean
  email_masked:   string | null
  email_unlocked: boolean
  email_value:    string | null
  has_email:      boolean
  date_naissance: string | null
  score:          number
  total_count:    number
  [key: string]:  unknown
}

export interface Address {
  adresse:     string | null
  code_postal: string | null
  ville:       string | null
}

export interface MergedRow extends Omit<RawRow, never> {
  emails_masked:  string[]
  emails_values:  string[]
  adresses:       Address[]
  merged_count:   number
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// Compare les préfixes visibles du phone_masked (ex: "+33789" dans "+33789••••")
function normPhone(s: string | null | undefined): string {
  return (s ?? '').replace(/[^0-9+]/g, '')
}

// Extrait la partie visible du phone_masked (avant les •) pour comparaison
function phoneMaskedPrefix(masked: string | null | undefined): string {
  if (!masked) return ''
  const cleaned = masked.replace(/[•\.]+.*$/, '').replace(/[^0-9+]/g, '')
  return cleaned
}

function canMerge(a: RawRow, b: RawRow): boolean {
  // Condition A : même préfixe de téléphone masqué (≥ 5 chiffres, plus fiable que 0)
  const prefA = phoneMaskedPrefix(a.phone_masked)
  const prefB = phoneMaskedPrefix(b.phone_masked)
  if (prefA.length >= 5 && prefA === prefB && a.has_phone && b.has_phone) return true

  // Condition B : même date de naissance (preuve d'identité)
  const birthA = (a.date_naissance ?? '').trim()
  const birthB = (b.date_naissance ?? '').trim()
  if (birthA.length >= 4 && birthA === birthB) return true

  // Condition C : même adresse complète (rue non vide + même CP)
  // Interdit de fusionner sur ville seule — trop de faux positifs
  const hasFullAddrA = !!(a.adresse && a.code_postal)
  const hasFullAddrB = !!(b.adresse && b.code_postal)
  if (hasFullAddrA && hasFullAddrB) {
    const addrA = norm(a.adresse) + '|' + norm(a.code_postal)
    const addrB = norm(b.adresse) + '|' + norm(b.code_postal)
    if (addrA === addrB && addrA.length > 3) return true
  }

  return false
}

// Union-Find pour le clustering transitif
function buildClusters(rows: RawRow[]): RawRow[][] {
  const n = rows.length
  const parent = Array.from({ length: n }, (_, i) => i)

  function find(x: number): number {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] }
    return x
  }

  function union(x: number, y: number) {
    const px = find(x), py = find(y)
    if (px !== py) parent[px] = py
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (canMerge(rows[i], rows[j])) union(i, j)
    }
  }

  const map = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const root = find(i)
    if (!map.has(root)) map.set(root, [])
    map.get(root)!.push(i)
  }

  return Array.from(map.values()).map(indices => indices.map(i => rows[i]))
}

export function deduplicateRows(rows: RawRow[]): MergedRow[] {
  // 1 — Grouper par nom + prénom normalisés
  const nameGroups = new Map<string, RawRow[]>()
  const order: string[] = []

  for (const row of rows) {
    const nomN    = norm(row.nom)
    const prenomN = norm(row.prenom)

    // Sans nom ni prénom → entrée isolée
    const key = (nomN || prenomN)
      ? `${nomN}|${prenomN}`
      : `__noid__${row.id}`

    if (!nameGroups.has(key)) { nameGroups.set(key, []); order.push(key) }
    nameGroups.get(key)!.push(row)
  }

  // 2 — Dans chaque groupe, clusteriser par les conditions A/B/C puis fusionner
  const result: MergedRow[] = []

  for (const key of order) {
    const group = nameGroups.get(key)!
    const clusters = group.length === 1 ? [[group[0]]] : buildClusters(group)
    for (const cluster of clusters) {
      result.push(mergeCluster(cluster))
    }
  }

  return result
}

function mergeCluster(rows: RawRow[]): MergedRow {
  // Meilleur score en tête
  rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const base = rows[0]

  // Emails masqués et en clair — sans doublons
  const maskedSeen = new Set<string>()
  const valueSeen  = new Set<string>()
  const emails_masked: string[] = []
  const emails_values: string[] = []

  for (const r of rows) {
    if (r.email_masked && !maskedSeen.has(r.email_masked)) {
      maskedSeen.add(r.email_masked); emails_masked.push(r.email_masked)
    }
    if (r.email_value && !valueSeen.has(r.email_value)) {
      valueSeen.add(r.email_value); emails_values.push(r.email_value)
    }
  }

  // Adresses uniques (adresse + cp + ville)
  const addrSeen = new Set<string>()
  const adresses: Address[] = []

  for (const r of rows) {
    const k = `${norm(r.adresse)}|${norm(r.code_postal)}|${norm(r.ville)}`
    if ((r.adresse || r.ville) && !addrSeen.has(k)) {
      addrSeen.add(k)
      adresses.push({ adresse: r.adresse, code_postal: r.code_postal, ville: r.ville })
    }
  }

  // Scalaires : conserver la première valeur non nulle
  const societe        = rows.find(r => r.societe)?.societe               ?? null
  const date_naissance = rows.find(r => r.date_naissance)?.date_naissance ?? null
  const phone_value    = rows.find(r => r.phone_value)?.phone_value        ?? null
  const phone_unlocked = rows.some(r => r.phone_unlocked)
  const email_unlocked = rows.some(r => r.email_unlocked)

  return {
    ...base,
    societe,
    date_naissance,
    phone_unlocked,
    phone_value,
    email_masked:   emails_masked[0] ?? null,
    email_value:    emails_values[0] ?? null,
    email_unlocked,
    has_email: emails_masked.length > 0 || emails_values.length > 0,
    // Adresse principale = première du tableau
    adresse:     adresses[0]?.adresse     ?? base.adresse,
    code_postal: adresses[0]?.code_postal ?? base.code_postal,
    ville:       adresses[0]?.ville       ?? base.ville,
    // Tableaux fusionnés
    emails_masked,
    emails_values,
    adresses,
    merged_count: rows.length,
  }
}
