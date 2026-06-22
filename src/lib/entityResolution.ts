/**
 * Entity Resolution — fusionne les doublons dans les résultats bruts de la RPC
 * avant le mapRow(). Utilise un Union-Find (quasi O(n)) pour grouper efficacement.
 *
 * Règle de fusion : même identité (nom+prénom normalisés) ET au moins l'une de :
 *   A. même numéro de mobile (normalisé)
 *   B. même date de naissance complète
 *   C. même adresse physique complète (rue obligatoire — jamais seulement CP+ville)
 */

export interface MergedAddress {
  rue:   string | null
  cp:    string | null
  ville: string | null
}

/** Champs internes ajoutés par resolveEntities() sur la row canonique */
export interface EntityResolutionMeta {
  _phones:      string[]         // numéros normalisés uniques
  _emails:      string[]         // emails uniques (sans téléphones)
  _adresses:    MergedAddress[]  // adresses uniques
  _mergedCount: number           // nombre de lignes fusionnées
}

type RawRow = Record<string, any>

// ─── Normalisation ─────────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les diacritiques (accents, cédilles…)
    .toLowerCase()
    .trim()
}

function normalizePhone(p: string | null | undefined): string {
  if (!p) return ''
  const clean = p.replace(/[\s\.\-\(\)]/g, '')
  // Uniformise +33 / 0033 → 0XXXXXXXXX
  if (clean.startsWith('+33') && clean.length >= 11)  return '0' + clean.slice(3)
  if (clean.startsWith('0033') && clean.length >= 12) return '0' + clean.slice(4)
  return clean
}

function looksLikePhone(value: string | null | undefined): boolean {
  if (!value) return false
  return /^[0-9][0-9\s\.\-\+]{6,}$/.test(value.trim())
}

/** Clé d'adresse — null si pas de rue (empêche fusion CP+ville seul) */
function addressKey(row: RawRow): string | null {
  const rue = row.adresse?.trim()
  if (!rue) return null
  return `${normalizeText(rue)}|${(row.code_postal ?? '').trim()}|${normalizeText(row.ville)}`
}

/** Clé d'identité normalisée (insensible à casse + accents) */
function identityKey(row: RawRow): string {
  return `${normalizeText(row.nom)}||${normalizeText(row.prenom)}`
}

// ─── Union-Find ────────────────────────────────────────────────────────────────

function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i)
  const rank   = new Array<number>(n).fill(0)

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x])
    return parent[x]
  }
  function union(a: number, b: number) {
    const ra = find(a), rb = find(b)
    if (ra === rb) return
    if (rank[ra] < rank[rb]) parent[ra] = rb
    else if (rank[ra] > rank[rb]) parent[rb] = ra
    else { parent[rb] = ra; rank[ra]++ }
  }
  return { find, union }
}

// ─── Fusion d'un cluster ───────────────────────────────────────────────────────

function mergeCluster(rows: RawRow[]): RawRow {
  // On prend la première ligne comme base canonique
  const base: RawRow = { ...rows[0] }

  const phoneSet   = new Set<string>()
  const emailSet   = new Set<string>()
  const addrKeySet = new Set<string>()
  const adresses:  MergedAddress[] = []

  for (const row of rows) {
    // Téléphones : on collecte toutes les valeurs non-nulles
    const phone = normalizePhone(row.phone_value || row.phone_masked)
    if (phone) phoneSet.add(phone)

    // Emails : on exclut les numéros mal mappés
    const emailVal = row.email_value || row.email_masked
    if (emailVal && !looksLikePhone(emailVal)) emailSet.add(emailVal)

    // Adresses uniques (clé basée sur la rue)
    const ak = addressKey(row)
    if (ak && !addrKeySet.has(ak)) {
      addrKeySet.add(ak)
      adresses.push({ rue: row.adresse ?? null, cp: row.code_postal ?? null, ville: row.ville ?? null })
    }

    // Préférer les valeurs non-nulles pour les champs scalaires
    for (const field of ['date_naissance', 'civilite', 'sexe', 'societe', 'code_postal', 'ville', 'adresse']) {
      if (!base[field] && row[field]) base[field] = row[field]
    }

    // Statut débloqué : vrai si au moins une ligne l'est
    if (row.phone_unlocked) base.phone_unlocked = true
    if (row.email_unlocked) base.email_unlocked = true
    if (row.has_phone)      base.has_phone = true
    if (row.has_email)      base.has_email = true
  }

  // Valeur affichée principale : on reprend le phone_value / email_value de la base
  // (le mapRow les utilisera normalement)

  const meta: EntityResolutionMeta = {
    _phones:      [...phoneSet],
    _emails:      [...emailSet],
    _adresses:    adresses,
    _mergedCount: rows.length,
  }

  return { ...base, ...meta }
}

// ─── Point d'entrée public ─────────────────────────────────────────────────────

/**
 * Prend les lignes brutes de la RPC et retourne un tableau dédoublonné.
 * Les lignes fusionnées portent les champs _phones, _emails, _adresses, _mergedCount.
 */
export function resolveEntities(rows: RawRow[]): RawRow[] {
  if (rows.length <= 1) return rows

  // 1. Grouper par identité normalisée
  const identityGroups = new Map<string, { idx: number; row: RawRow }[]>()
  rows.forEach((row, idx) => {
    const key = identityKey(row)
    if (!identityGroups.has(key)) identityGroups.set(key, [])
    identityGroups.get(key)!.push({ idx, row })
  })

  const result: RawRow[] = []

  for (const group of identityGroups.values()) {
    if (group.length === 1) {
      result.push(group[0].row)
      continue
    }

    // 2. Union-Find au sein du groupe d'identité
    const { find, union } = makeUnionFind(group.length)

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (find(i) === find(j)) continue  // déjà dans le même cluster

        const a = group[i].row
        const b = group[j].row

        // Condition A : même mobile
        const pa = normalizePhone(a.phone_value || a.phone_masked)
        const pb = normalizePhone(b.phone_value || b.phone_masked)
        if (pa && pb && pa === pb) { union(i, j); continue }

        // Condition B : même date de naissance complète
        if (a.date_naissance && b.date_naissance && a.date_naissance === b.date_naissance) {
          union(i, j); continue
        }

        // Condition C : même adresse complète (rue obligatoire)
        const addrA = addressKey(a)
        const addrB = addressKey(b)
        if (addrA && addrB && addrA === addrB) { union(i, j); continue }
      }
    }

    // 3. Collecter les clusters et les fusionner
    const clusters = new Map<number, RawRow[]>()
    for (let i = 0; i < group.length; i++) {
      const root = find(i)
      if (!clusters.has(root)) clusters.set(root, [])
      clusters.get(root)!.push(group[i].row)
    }

    for (const cluster of clusters.values()) {
      result.push(cluster.length === 1 ? cluster[0] : mergeCluster(cluster))
    }
  }

  return result
}
