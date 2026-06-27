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
  _ids:          string[]        // tous les IDs des lignes fusionnées
  _phoneIds:     string[]        // IDs des lignes ayant un téléphone (pour unlock ciblé)
  _emailIds:     string[]        // IDs des lignes ayant un email (pour unlock ciblé)
  _phones:       string[]        // numéros propres déjà débloqués (phone_value)
  _phonesLocked: string[]        // numéros masqués non encore débloqués (phone_masked)
  _emails:       string[]        // emails débloqués (email_value)
  _emailsLocked: string[]        // emails masqués non encore débloqués (email_masked)
  _adresses:     MergedAddress[] // adresses uniques
  _mergedCount:  number          // nombre de lignes fusionnées
}

type RawRow = Record<string, any>

// ─── Normalisation ─────────────────────────────────────────────────────────────

function normalizeText(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // retire les diacritiques (accents, cédilles…)
    .replace(/[-–—]/g, ' ')           // "Jean-Charles" → "jean charles"
    .replace(/\s+/g, ' ')             // espaces multiples → un seul
    .toLowerCase()
    .trim()
}

function birthYear(row: RawRow): string | null {
  const d = row.date_naissance ?? row.annee_naissance ?? null
  if (!d) return null
  const m = String(d).match(/\b(19|20)\d{2}\b/)
  return m ? m[0] : null
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

function maskPhoneShort(raw: string): string {
  return raw.slice(0, 6) + '••••'
}

/** Tous les numéros bruts d'une fiche (telephone + mobile) normalisés */
function allNormsOf(row: RawRow): string[] {
  const nums: string[] = []
  for (const raw of [row.phone_value, row.telephone, row.mobile]) {
    const n = normalizePhone(raw)
    if (n) nums.push(n)
  }
  return [...new Set(nums)]
}

function mergeCluster(rows: RawRow[]): RawRow {
  const base: RawRow = { ...rows[0] }

  const idSet      = new Set<string>()
  const phoneIdSet = new Set<string>()
  const emailIdSet = new Set<string>()

  // Numéros débloqués (normalisés) et verrouillés (norm → masked)
  const phoneNormSet   = new Set<string>()
  const phoneLockedMap = new Map<string, string>() // norm → masked
  const emailSet       = new Set<string>()
  const emailLockedSet = new Set<string>()
  const addrKeySet     = new Set<string>()
  const adresses: MergedAddress[] = []

  // Numéro principal de la fiche de base (affiché comme result.phone) — ne pas le dupliquer
  const basePrimaryNorm = normalizePhone(rows[0].telephone || rows[0].mobile)

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri]
    idSet.add(String(row.id))
    if (row.has_phone) phoneIdSet.add(String(row.id))
    if (row.has_email) emailIdSet.add(String(row.id))

    const phoneUnlocked = !!row.phone_unlocked

    // Collecte telephone ET mobile de chaque fiche
    const rawPhones: string[] = []
    if (row.telephone?.trim()) rawPhones.push(row.telephone.trim())
    if (row.mobile?.trim() && row.mobile !== row.telephone) rawPhones.push(row.mobile.trim())

    for (const raw of rawPhones) {
      const norm = normalizePhone(raw)
      if (!norm) continue
      const isBasePrimary = ri === 0 && norm === basePrimaryNorm

      if (phoneUnlocked) {
        phoneNormSet.add(norm)
      } else if (!isBasePrimary) {
        if (!phoneLockedMap.has(norm)) phoneLockedMap.set(norm, maskPhoneShort(raw))
      }
    }

    // Email
    if (row.email_value && !looksLikePhone(row.email_value)) {
      emailSet.add(row.email_value)
    } else if (ri > 0 && row.email_masked && !looksLikePhone(row.email_masked)) {
      emailLockedSet.add(row.email_masked)
    }

    // Adresses
    const ak = addressKey(row)
    if (ak && !addrKeySet.has(ak)) {
      addrKeySet.add(ak)
      adresses.push({ rue: row.adresse ?? null, cp: row.code_postal ?? null, ville: row.ville ?? null })
    }

    for (const field of ['date_naissance', 'civilite', 'sexe', 'societe', 'code_postal', 'ville', 'adresse']) {
      if (!base[field] && row[field]) base[field] = row[field]
    }

    if (row.phone_unlocked) base.phone_unlocked = true
    if (row.email_unlocked) base.email_unlocked = true
    if (row.has_phone)      base.has_phone = true
    if (row.has_email)      base.has_email = true
  }

  // Retire les verrouillés déjà débloqués
  for (const norm of phoneNormSet) phoneLockedMap.delete(norm)

  const meta: EntityResolutionMeta = {
    _ids:          [...idSet],
    _phoneIds:     [...phoneIdSet],
    _emailIds:     [...emailIdSet],
    _phones:       [...phoneNormSet],
    _phonesLocked: [...phoneLockedMap.values()],
    _emails:       [...emailSet],
    _emailsLocked: [...emailLockedSet],
    _adresses:     adresses,
    _mergedCount:  rows.length,
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

        // Condition A : numéro partagé (telephone OU mobile des deux côtés)
        const normsA = new Set(allNormsOf(a))
        if (normsA.size > 0 && allNormsOf(b).some(p => normsA.has(p))) { union(i, j); continue }

        // Condition B : même date de naissance complète OU même année de naissance
        const ya = birthYear(a)
        const yb = birthYear(b)
        if (ya && yb && ya === yb) { union(i, j); continue }

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
