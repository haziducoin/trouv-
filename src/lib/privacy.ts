const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /iban/i,
  /\bvin\b/i,
  /plate/i,
  /plaque/i,
  /immatric/i,
  /ip(_?address)?/i,
  /steam/i,
  /discord/i,
  /snap(chat)?/i,
  /minecraft/i,
  /fivem/i,
]

const BIRTH_DATE_KEYS = [
  'birth_date',
  'date_birth',
  'date_of_birth',
  'date_naissance',
  'birthDate',
  'dateOfBirth',
  'dob',
]

const BIRTH_CITY_KEYS = [
  'birth_city',
  'city_birth',
  'birth_place',
  'place_of_birth',
  'ville_naissance',
  'lieu_naissance',
  'birthCity',
]

export function isSensitiveKey(key: string) {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key))
}

export function stripSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => stripSensitiveFields(item)) as T
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, item]) => [key, stripSensitiveFields(item)])
  ) as T
}

export function extractBirthYear(row: Record<string, unknown>): string | null {
  for (const key of BIRTH_DATE_KEYS) {
    const raw = row[key]
    if (!raw) continue

    if (raw instanceof Date) return String(raw.getFullYear())

    const value = String(raw)
    const isoYear = value.match(/\b(19|20)\d{2}\b/)?.[0]
    if (isoYear) return isoYear
  }

  return null
}

export function extractBirthCity(row: Record<string, unknown>): string | null {
  for (const key of BIRTH_CITY_KEYS) {
    const raw = row[key]
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }

  return null
}

export function formatBirthContext(year?: string | null, city?: string | null) {
  if (!year && !city) return null
  if (year && city) return `Né(e) en ${year} à ${city}`
  if (year) return `Né(e) en ${year}`
  return `Ville de naissance : ${city}`
}
