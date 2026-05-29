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

function extractBirthYear(row: Record<string, unknown>) {
  for (const key of BIRTH_DATE_KEYS) {
    const raw = row[key]
    if (!raw) continue

    if (raw instanceof Date) return String(raw.getFullYear())

    const value = String(raw)
    const year = value.match(/\b(19|20)\d{2}\b/)?.[0]
    if (year) return year
  }

  return null
}

function extractBirthCity(row: Record<string, unknown>) {
  for (const key of BIRTH_CITY_KEYS) {
    const raw = row[key]
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }

  return null
}

export function sanitizePublicSearchRecord(row: Record<string, unknown>) {
  const clean = stripSensitiveFields(row)
  const birthYear = extractBirthYear(clean)
  const birthCity = extractBirthCity(clean)

  return {
    lastName: clean.last_name ?? clean.lastName ?? null,
    firstName: clean.first_name ?? clean.firstName ?? null,
    displayName: clean.display_name ?? clean.displayName ?? clean.username ?? clean.name ?? null,
    email: clean.email ?? null,
    phoneMobile: clean.phone_mobile ?? clean.mobile ?? null,
    phoneFixed: clean.phone_fixed ?? clean.phone ?? null,
    address: clean.address ?? null,
    city: clean.city ?? null,
    zipCode: clean.zip_code ?? clean.zipCode ?? null,
    country: clean.country ?? null,
    profession: clean.profession ?? clean.job_title ?? clean.type ?? null,
    employer: clean.employer ?? clean.company_name ?? null,
    publicSocial: clean.public_social ?? clean.twitter ?? clean.x_url ?? clean.linkedin_url ?? null,
    birthYear,
    birthCity,
  }
}

export function sanitizeSubscriptionForClient(sub: Record<string, any>) {
  const clean = stripSensitiveFields(sub)
  const plan = clean.plans && typeof clean.plans === 'object' ? stripSensitiveFields(clean.plans) as Record<string, unknown> : null

  return {
    status: clean.status ?? null,
    planCode: clean.plan_code ?? null,
    billingPeriod: clean.billing_period ?? null,
    currentPeriodEnd: clean.current_period_end ?? null,
    monthlySearchQuota: clean.monthly_search_quota ?? null,
    plan: plan ? {
      name: plan.name ?? null,
      searches: plan.searches ?? null,
      users: plan.users ?? null,
    } : null,
  }
}

export function sanitizeProspectForClient(row: Record<string, unknown>) {
  const clean = stripSensitiveFields(row)
  const firstName = typeof clean.first_name === 'string' ? clean.first_name : ''
  const lastName = typeof clean.last_name === 'string' ? clean.last_name : ''
  const companyName = typeof clean.company_name === 'string' ? clean.company_name : null

  return {
    id: String(clean.id ?? `${firstName}-${lastName}-${companyName ?? ''}`),
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim() || companyName || 'Inconnu',
    jobTitle: clean.job_title ?? null,
    companyName,
    email: clean.email ?? null,
    phone: clean.phone ?? null,
    phoneMobile: clean.phone_mobile ?? null,
    linkedinUrl: clean.linkedin_url ?? clean.public_social_url ?? null,
    address: clean.address ?? null,
    city: clean.city ?? null,
    zipCode: clean.zip_code ?? null,
    country: clean.country ?? null,
    birthYear: extractBirthYear(clean),
    birthCity: extractBirthCity(clean),
  }
}
