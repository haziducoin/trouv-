import type { VerifiedCompany } from '@/lib/companyApi'
import { getSupabaseClient, isRemoteDatabaseConfigured } from '@/lib/supabase'

export type UserRole = 'agent' | 'agence' | 'admin'
export type AccessStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

export interface Account {
  id: string
  organizationId?: string
  firstName: string
  lastName: string
  email: string
  companyName: string
  siren: string
  role: UserRole
  status: AccessStatus
  quota: number
  monthlyUsage: number
  createdAt: string
  lastLoginAt?: string
  passwordHash?: string
}

export interface AuditEvent {
  id: string
  action: string
  actorEmail: string
  targetEmail: string
  timestamp: string
}

export interface DataMetric {
  entity: string
  total: number
}

export interface RegistrationInput {
  firstName: string
  lastName: string
  email: string
  password: string
  role: Exclude<UserRole, 'admin'>
}

export interface FavoriteInput {
  targetSiren?: string
  targetName: string
  targetCity?: string
  note?: string
}

const ACCOUNTS_KEY = 'trouve_accounts_v1'
const SESSION_KEY = 'trouve_session_v1'
const AUDIT_KEY = 'trouve_audit_v1'
const FAVORITES_KEY = 'trouve_favorites_v1'
const SEARCHES_KEY = 'trouve_searches_v1'

export const DEMO_ADMIN = {
  email: 'admin@trouve.local',
  password: 'DemoAdmin2026!',
}

export const usesRemoteDatabase = isRemoteDatabaseConfigured

const quotaByRole: Record<UserRole, number> = {
  agent: 1500,
  agence: 5000,
  admin: 0,
}

function readValue<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function saveLocalAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
}

function appendLocalAudit(event: Omit<AuditEvent, 'id' | 'timestamp'>) {
  const events = readValue<AuditEvent[]>(AUDIT_KEY, [])
  const nextEvent: AuditEvent = {
    ...event,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  }
  localStorage.setItem(AUDIT_KEY, JSON.stringify([nextEvent, ...events].slice(0, 40)))
}

async function hashPassword(password: string) {
  const content = new TextEncoder().encode(password)
  const hash = await crypto.subtle.digest('SHA-256', content)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function initializeLocalAccounts() {
  const accounts = readValue<Account[]>(ACCOUNTS_KEY, [])
  if (accounts.some((account) => account.email === DEMO_ADMIN.email)) {
    return accounts
  }

  const adminAccount: Account = {
    id: crypto.randomUUID(),
    firstName: 'Administrateur',
    lastName: 'Démo',
    email: DEMO_ADMIN.email,
    companyName: 'trouvé! - environnement local',
    siren: 'DEMO',
    role: 'admin',
    status: 'approved',
    quota: quotaByRole.admin,
    monthlyUsage: 0,
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(DEMO_ADMIN.password),
  }

  const initializedAccounts = [...accounts, adminAccount]
  saveLocalAccounts(initializedAccounts)
  return initializedAccounts
}

function currentPeriod() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}-01`
}

function mapRemoteProfile(row: Record<string, any>): Account {
  const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
  const usages = (row.monthly_usage ?? []) as Array<{ period_start: string; searches_used: number }>
  const monthlyUsage =
    usages.find((usage) => usage.period_start === currentPeriod())?.searches_used ?? 0

  return {
    id: row.id,
    organizationId: row.organization_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.professional_email,
    companyName: organization?.legal_name ?? 'Société à vérifier',
    siren: organization?.siren ?? '',
    role: row.role as UserRole,
    status: row.access_status as AccessStatus,
    quota: row.monthly_search_quota,
    monthlyUsage,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? undefined,
  }
}

async function fetchRemoteProfiles(accountId?: string) {
  const supabase = getSupabaseClient()
  let query = supabase
    .from('profiles')
    .select(
      'id, organization_id, first_name, last_name, professional_email, role, access_status, monthly_search_quota, created_at, last_login_at, organizations ( siren, legal_name ), monthly_usage ( period_start, searches_used )',
    )
    .order('created_at', { ascending: false })

  if (accountId) {
    query = query.eq('id', accountId)
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Lecture des comptes impossible : ${error.message}`)
  }

  return (data ?? []).map((row) => mapRemoteProfile(row as Record<string, any>))
}

export async function initializeAccounts() {
  return usesRemoteDatabase ? fetchRemoteProfiles() : initializeLocalAccounts()
}

export async function createAccessRequest(input: RegistrationInput, company: VerifiedCompany) {
  const email = input.email.trim().toLowerCase()

  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          requested_role: input.role,
          siren: company.siren,
          company_name: company.name,
          activity_code: company.activityCode ?? null,
          address: company.address ?? null,
          administrative_status: company.isActive ? 'A' : null,
        },
      },
    })
    if (error || !data.user) {
      throw new Error(error?.message ?? 'Impossible de créer la demande distante.')
    }

    await supabase.auth.signOut()
    return {
      id: data.user.id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      companyName: company.name,
      siren: company.siren,
      role: input.role,
      status: 'pending',
      quota: quotaByRole[input.role],
      monthlyUsage: 0,
      createdAt: new Date().toISOString(),
    } satisfies Account
  }

  const accounts = await initializeLocalAccounts()
  if (accounts.some((account) => account.email === email)) {
    throw new Error('Un compte existe déjà pour cet email professionnel.')
  }

  const account: Account = {
    id: crypto.randomUUID(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email,
    companyName: company.name,
    siren: company.siren,
    role: input.role,
    status: 'pending',
    quota: quotaByRole[input.role],
    monthlyUsage: 0,
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(input.password),
  }

  saveLocalAccounts([account, ...accounts])
  appendLocalAudit({
    action: 'request_created',
    actorEmail: account.email,
    targetEmail: account.email,
  })
  return account
}

export async function authenticate(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()

  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error || !data.user) {
      throw new Error('Email ou mot de passe incorrect.')
    }

    const [account] = await fetchRemoteProfiles(data.user.id)
    if (!account || account.status === 'pending') {
      await supabase.auth.signOut()
      throw new Error('Votre accès attend encore la validation administrateur.')
    }
    if (account.status === 'rejected' || account.status === 'suspended') {
      await supabase.auth.signOut()
      throw new Error('Votre accès professionnel n’est pas actif.')
    }

    const { error: logError } = await supabase.rpc('record_login')
    if (logError) {
      await supabase.auth.signOut()
      throw new Error(`Connexion non journalisée : ${logError.message}`)
    }
    return account
  }

  const accounts = await initializeLocalAccounts()
  const account = accounts.find((item) => item.email === normalizedEmail)

  if (!account || account.passwordHash !== (await hashPassword(password))) {
    throw new Error('Email ou mot de passe incorrect.')
  }
  if (account.status === 'pending') {
    throw new Error('Votre accès attend encore la validation administrateur.')
  }
  if (account.status === 'rejected' || account.status === 'suspended') {
    throw new Error('Votre accès professionnel n’est pas actif.')
  }

  const connectedAccount = { ...account, lastLoginAt: new Date().toISOString() }
  saveLocalAccounts(
    accounts.map((item) => (item.id === connectedAccount.id ? connectedAccount : item)),
  )
  localStorage.setItem(SESSION_KEY, connectedAccount.id)
  appendLocalAudit({
    action: 'login',
    actorEmail: connectedAccount.email,
    targetEmail: connectedAccount.email,
  })
  return connectedAccount
}

export async function restoreSession() {
  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user.id) {
      return null
    }
    const [account] = await fetchRemoteProfiles(data.session.user.id)
    if (!account || account.status !== 'approved') {
      await supabase.auth.signOut()
      return null
    }
    return account
  }

  const accounts = await initializeLocalAccounts()
  const accountId = localStorage.getItem(SESSION_KEY)
  return accounts.find((account) => account.id === accountId) ?? null
}

export async function clearSession() {
  if (usesRemoteDatabase) {
    await getSupabaseClient().auth.signOut()
    return
  }
  localStorage.removeItem(SESSION_KEY)
}

export async function getAccounts() {
  return usesRemoteDatabase ? fetchRemoteProfiles() : initializeLocalAccounts()
}

export async function getAuditEvents() {
  if (usesRemoteDatabase) {
    const { data, error } = await getSupabaseClient()
      .from('audit_logs')
      .select('id, action, created_at')
      .order('created_at', { ascending: false })
      .limit(12)
    if (error) {
      throw new Error(`Lecture du journal impossible : ${error.message}`)
    }
    return (data ?? []).map((log) => ({
      id: log.id,
      action: log.action,
      actorEmail: 'Base distante',
      targetEmail: log.action,
      timestamp: log.created_at,
    }))
  }

  return readValue<AuditEvent[]>(AUDIT_KEY, [])
}

export async function getDataMetrics(): Promise<DataMetric[]> {
  if (usesRemoteDatabase) {
    const { data, error } = await getSupabaseClient().rpc('admin_dashboard_totals')
    if (error) {
      throw new Error(`Statistiques base indisponibles : ${error.message}`)
    }
    return (data ?? []).map((item: { entity: string; total: number }) => ({
      entity: item.entity,
      total: Number(item.total),
    }))
  }

  return [
    { entity: 'demandes', total: (await initializeLocalAccounts()).filter((item) => item.role !== 'admin').length },
    { entity: 'utilisateurs', total: (await initializeLocalAccounts()).length },
    { entity: 'abonnements', total: 0 },
    { entity: 'recherches', total: readValue<any[]>(SEARCHES_KEY, []).length },
    { entity: 'favoris', total: readValue<any[]>(FAVORITES_KEY, []).length },
    { entity: 'logs', total: readValue<AuditEvent[]>(AUDIT_KEY, []).length },
  ]
}

export async function reviewAccessRequest(
  accountId: string,
  status: Extract<AccessStatus, 'approved' | 'rejected'>,
  actorEmail: string,
) {
  if (usesRemoteDatabase) {
    const { error } = await getSupabaseClient().rpc('review_access_request', {
      p_user_id: accountId,
      p_decision: status,
      p_notes: null,
    })
    if (error) {
      throw new Error(`Validation impossible : ${error.message}`)
    }
    return getAccounts()
  }

  const accounts = await initializeLocalAccounts()
  const target = accounts.find((account) => account.id === accountId)
  if (!target) {
    throw new Error('Cette demande n’existe plus.')
  }

  const updatedAccounts = accounts.map((account) =>
    account.id === accountId ? { ...account, status } : account,
  )
  saveLocalAccounts(updatedAccounts)
  appendLocalAudit({
    action: status === 'approved' ? 'approved' : 'rejected',
    actorEmail,
    targetEmail: target.email,
  })
  return updatedAccounts
}

export async function recordSearch(queryLabel: string, filters: Record<string, unknown>, resultCount: number) {
  if (usesRemoteDatabase) {
    const { error } = await getSupabaseClient().rpc('record_search', {
      p_query_label: queryLabel,
      p_filters: filters,
      p_result_count: resultCount,
    })
    if (error) {
      throw new Error(`Recherche non enregistrée : ${error.message}`)
    }
    return
  }

  const searches = readValue<any[]>(SEARCHES_KEY, [])
  localStorage.setItem(
    SEARCHES_KEY,
    JSON.stringify([{ queryLabel, filters, resultCount, createdAt: new Date().toISOString() }, ...searches]),
  )
}

export async function saveFavorite(account: Account, favorite: FavoriteInput) {
  if (usesRemoteDatabase) {
    const { error } = await getSupabaseClient().from('favorites').insert({
      user_id: account.id,
      organization_id: account.organizationId,
      target_siren: favorite.targetSiren ?? null,
      target_name: favorite.targetName,
      target_city: favorite.targetCity ?? null,
      note: favorite.note ?? null,
    })
    if (error) {
      throw new Error(`Favori non enregistré : ${error.message}`)
    }
    return
  }

  const favorites = readValue<FavoriteInput[]>(FAVORITES_KEY, [])
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([favorite, ...favorites]))
}
