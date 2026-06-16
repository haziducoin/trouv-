import type { VerifiedCompany } from '@/lib/companyApi'
import { getSupabaseClient, isRemoteDatabaseConfigured } from '@/lib/supabase'

export type UserRole = 'agent' | 'agence' | 'admin'
export type AccessStatus = 'pending' | 'trial' | 'approved' | 'rejected' | 'suspended'
export type OAuthProvider = 'google' | 'azure'

// ─── Domaines email personnels bloqués ───────────────────────────────────────
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'googlemail.co.uk',
  'hotmail.com', 'hotmail.fr', 'hotmail.co.uk', 'hotmail.es', 'hotmail.de', 'hotmail.it', 'hotmail.be',
  'outlook.com', 'outlook.fr', 'outlook.es', 'outlook.de', 'outlook.it', 'outlook.be',
  'live.com', 'live.fr', 'live.co.uk', 'live.be', 'live.nl',
  'yahoo.com', 'yahoo.fr', 'yahoo.co.uk', 'yahoo.es', 'yahoo.de', 'yahoo.it', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'orange.fr', 'free.fr', 'sfr.fr', 'neuf.fr', 'bbox.fr',
  'laposte.net', 'wanadoo.fr', 'numericable.fr', 'club-internet.fr',
  'aol.com', 'protonmail.com', 'protonmail.ch', 'pm.me',
  'yandex.com', 'yandex.ru', 'mail.ru',
])

export function isPersonalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return PERSONAL_EMAIL_DOMAINS.has(domain)
}

export class PersonalEmailError extends Error {
  public readonly email: string
  constructor(email: string) {
    super('Connexion réservée aux adresses professionnelles.')
    this.name = 'PersonalEmailError'
    this.email = email
  }
}

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

export interface DemoRequest {
  id: string
  userId: string
  email: string
  firstName: string
  lastName: string
  message?: string
  ipAddress: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export interface FavoriteInput {
  targetSiren?: string
  targetName: string
  targetCity?: string
  note?: string
}

const ACCOUNTS_KEY          = 'trouve_accounts_v1'
const SESSION_KEY           = 'trouve_session_v1'
const AUDIT_KEY             = 'trouve_audit_v1'
const FAVORITES_KEY         = 'trouve_favorites_v1'
const SEARCHES_KEY          = 'trouve_searches_v1'
const OAUTH_PREVIEW_SESSION_KEY = 'trouve_oauth_preview_provider_v1'
const DEMO_REQUESTS_KEY     = 'trouve_demo_requests_v1'
const IP_REGS_KEY           = 'trouve_ip_regs_v1'
const REMEMBER_ME_KEY = 'trouve_remember_me_v1'
const SESSION_ONLY_KEY = 'trouve_session_only_v1'

export const DEMO_ADMIN = {
  email: 'admin@trouve.local',
  passwordHash: '6193a66b95d6d2f7fb26e0f59fe32028649fc4ebe61f3b283089be7287dade2d',
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

function isLocalPreviewHost() {
  if (typeof window === 'undefined') {
    return false
  }
  return ['127.0.0.1', 'localhost', '::1'].includes(window.location.hostname)
}

export function isOAuthPreviewEnabled() {
  return usesRemoteDatabase && isLocalPreviewHost()
}

function getOAuthPreviewAccount(provider: OAuthProvider): Account {
  const isMicrosoft = provider === 'azure'
  return {
    id: `oauth-preview-${provider}`,
    organizationId: 'oauth-preview-organization',
    firstName: isMicrosoft ? 'Alex' : 'Camille',
    lastName: isMicrosoft ? 'Microsoft' : 'Google',
    email: isMicrosoft ? 'alex.microsoft@trouve.local' : 'camille.google@trouve.local',
    companyName: 'Agence Preview trouvé!',
    siren: '552100554',
    role: 'agence',
    status: 'approved',
    quota: quotaByRole.agence,
    monthlyUsage: 684,
    createdAt: '2026-05-27T00:00:00.000Z',
    lastLoginAt: new Date().toISOString(),
  }
}

function getActiveOAuthPreviewAccount() {
  if (!isOAuthPreviewEnabled()) {
    return null
  }
  const provider = localStorage.getItem(OAUTH_PREVIEW_SESSION_KEY)
  if (provider !== 'google' && provider !== 'azure') {
    return null
  }
  return getOAuthPreviewAccount(provider)
}

function getOAuthPreviewAccounts() {
  return [
    getOAuthPreviewAccount('google'),
    getOAuthPreviewAccount('azure'),
  ]
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
    passwordHash: DEMO_ADMIN.passwordHash,
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

export async function createAccessRequest(input: RegistrationInput, company?: VerifiedCompany) {
  const email = input.email.trim().toLowerCase()

  // ── Bloquer les emails personnels dès l'inscription ──────────────────────
  if (isPersonalEmail(email)) {
    throw new PersonalEmailError(email)
  }

  // ── Protection anti-abus par IP (soft, côté client) ──────────────────────
  if (await checkIPRegistrationLimit()) {
    throw new Error('Trop de comptes créés depuis cet accès réseau. Contactez-nous à contact@trouve.fr.')
  }
  await recordRegistrationIP()

  const companyName = company?.name ?? ''
  const sirenValue  = company?.siren ?? ''

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
          siren: sirenValue,
          company_name: companyName,
          activity_code: company?.activityCode ?? null,
          address: company?.address ?? null,
          administrative_status: company?.isActive ? 'A' : null,
        },
      },
    })
    if (error || !data.user) {
      throw new Error(error?.message ?? 'Impossible de créer la demande distante.')
    }

    // On garde la session ouverte → onAuthStateChange(SIGNED_IN) dans App.tsx
    // prend le relais et route l'utilisateur directement vers l'accès limité.
    return {
      id: data.user.id,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email,
      companyName,
      siren: sirenValue,
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
    companyName,
    siren: sirenValue,
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

  // Réservé aux adresses professionnelles.
  if (isPersonalEmail(normalizedEmail)) {
    throw new PersonalEmailError(normalizedEmail)
  }

  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (error || !data.user) {
      throw new Error(error?.message ?? 'Connexion impossible — utilisateur introuvable.')
    }

    const [account] = await fetchRemoteProfiles(data.user.id)

    // Seuls les accès explicitement refusés/suspendus sont bloqués.
    if (account && (account.status === 'rejected' || account.status === 'suspended')) {
      await supabase.auth.signOut()
      throw new Error("Votre accès professionnel n'est pas actif. Contactez-nous si besoin.")
    }

    // Non-bloquant : si la RPC n'existe pas encore, la connexion reste valide.
    void (async () => {
      await supabase.rpc('record_login')
    })().catch(() => {})

    // pending / trial / approved → on laisse entrer ; l'app route vers le bon niveau d'accès.
    if (account) return account

    // Profil pas encore créé (cas rare) → compte "pending" minimal, sans bloquer la connexion.
    const meta = (data.user.user_metadata ?? {}) as Record<string, string>
    return {
      id:           data.user.id,
      firstName:    meta.first_name ?? normalizedEmail.split('@')[0],
      lastName:     meta.last_name ?? '',
      email:        normalizedEmail,
      companyName:  meta.company_name ?? '',
      siren:        meta.siren ?? '',
      role:         (meta.requested_role as UserRole) ?? 'agent',
      status:       'pending' as AccessStatus,
      quota:        quotaByRole.agent,
      monthlyUsage: 0,
      createdAt:    data.user.created_at ?? new Date().toISOString(),
    }
  }

  const accounts = await initializeLocalAccounts()
  const account = accounts.find((item) => item.email === normalizedEmail)

  if (!account || account.passwordHash !== (await hashPassword(password))) {
    throw new Error('Email ou mot de passe incorrect.')
  }
  if (account.status === 'rejected' || account.status === 'suspended') {
    throw new Error("Votre accès professionnel n'est pas actif.")
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

export async function authenticateWithOAuth(provider: OAuthProvider) {
  if (isOAuthPreviewEnabled()) {
    const account = getOAuthPreviewAccount(provider)
    localStorage.setItem(OAUTH_PREVIEW_SESSION_KEY, provider)
    appendLocalAudit({
      action: `oauth_preview_${provider}`,
      actorEmail: account.email,
      targetEmail: account.email,
    })
    return account
  }

  if (!usesRemoteDatabase) {
    throw new Error('La connexion Google/Microsoft nécessite Supabase.')
  }

  const { error } = await getSupabaseClient().auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin,
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  return null
}

export async function restoreSession() {
  if (localStorage.getItem(REMEMBER_ME_KEY) === '0' && sessionStorage.getItem(SESSION_ONLY_KEY) !== '1') {
    if (usesRemoteDatabase) {
      await getSupabaseClient().auth.signOut()
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
    localStorage.removeItem(OAUTH_PREVIEW_SESSION_KEY)
    return null
  }

  const previewAccount = getActiveOAuthPreviewAccount()
  if (previewAccount) {
    return previewAccount
  }

  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data } = await supabase.auth.getSession()
    if (!data.session?.user.id) {
      return null
    }

    // ── Vérification email professionnel ─────────────────────────────────
    const sessionEmail = data.session.user.email ?? ''
    if (isPersonalEmail(sessionEmail)) {
      await supabase.auth.signOut()
      throw new PersonalEmailError(sessionEmail)
    }

    // ── Lecture du profil (table peut ne pas encore exister) ─────────────
    let profileResult: Account[] = []
    try {
      profileResult = await fetchRemoteProfiles(data.session.user.id)
    } catch {
      // Table absente ou erreur réseau → on traite comme "nouvel utilisateur"
    }
    const [account] = profileResult

    // ── Nouvel utilisateur (OAuth ou email/password) — pas encore de profil ─
    if (!account) {
      const meta = (data.session.user.user_metadata ?? {}) as Record<string, string>
      // OAuth → given_name/family_name ; email/password → first_name/last_name
      const givenName  = (meta.given_name  ?? meta.first_name  ?? meta.name?.split(' ')[0]           ?? sessionEmail.split('@')[0]).trim()
      const familyName = (meta.family_name ?? meta.last_name   ?? meta.name?.split(' ').slice(1).join(' ') ?? '').trim()
      return {
        id:           data.session.user.id,
        firstName:    givenName,
        lastName:     familyName,
        email:        sessionEmail,
        companyName:  meta.company_name ?? '',
        siren:        meta.siren ?? '',
        role:         (meta.requested_role as UserRole) ?? 'agent',
        status:       'pending' as AccessStatus,
        quota:        quotaByRole.agent,
        monthlyUsage: 0,
        createdAt:    data.session.user.created_at ?? new Date().toISOString(),
      }
    }

    // ── Compte en attente → page d'attente (sans déconnecter) ────────────
    if (account.status === 'pending') {
      return account
    }

    // ── Compte rejeté / suspendu → déconnecter ────────────────────────────
    if (account.status !== 'approved' && account.status !== 'trial') {
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
  localStorage.removeItem(OAUTH_PREVIEW_SESSION_KEY)
  sessionStorage.removeItem(SESSION_ONLY_KEY)
  if (usesRemoteDatabase) {
    await getSupabaseClient().auth.signOut()
    return
  }
  localStorage.removeItem(SESSION_KEY)
}

export async function getAccounts() {
  if (getActiveOAuthPreviewAccount()) {
    return getOAuthPreviewAccounts()
  }
  return usesRemoteDatabase ? fetchRemoteProfiles() : initializeLocalAccounts()
}

export async function getAuditEvents() {
  if (getActiveOAuthPreviewAccount()) {
    return readValue<AuditEvent[]>(AUDIT_KEY, [])
  }

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
  if (getActiveOAuthPreviewAccount()) {
    return [
      { entity: 'demandes', total: 12 },
      { entity: 'utilisateurs', total: getOAuthPreviewAccounts().length },
      { entity: 'abonnements', total: 3 },
      { entity: 'recherches', total: readValue<any[]>(SEARCHES_KEY, []).length + 684 },
      { entity: 'favoris', total: readValue<any[]>(FAVORITES_KEY, []).length },
      { entity: 'logs', total: readValue<AuditEvent[]>(AUDIT_KEY, []).length },
    ]
  }

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

// ─── IP helpers ──────────────────────────────────────────────────────────────

async function getClientIP(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) })
    const { ip } = await r.json()
    return ip as string
  } catch {
    return 'unknown'
  }
}

/** Enregistre l'IP lors d'une inscription (protection anti-abus) */
export async function recordRegistrationIP(): Promise<void> {
  const ip = await getClientIP()
  if (ip === 'unknown') return
  const regs: { ip: string; ts: number }[] = readValue(IP_REGS_KEY, [])
  regs.push({ ip, ts: Date.now() })
  localStorage.setItem(IP_REGS_KEY, JSON.stringify(regs.slice(-100)))
}

/** Vérifie si l'IP a déjà trop de comptes (max 3 dans les 30 derniers jours) */
export async function checkIPRegistrationLimit(): Promise<boolean> {
  const ip = await getClientIP()
  if (ip === 'unknown') return false // bénéfice du doute si fetch IP échoue
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const regs: { ip: string; ts: number }[] = readValue(IP_REGS_KEY, [])
  const count = regs.filter(r => r.ip === ip && r.ts > cutoff).length
  return count >= 3
}

// ─── Demo requests ───────────────────────────────────────────────────────────

export async function createDemoRequest(account: Account, message?: string): Promise<void> {
  const ip = await getClientIP()

  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    // Vérifier si cet utilisateur a déjà une demande
    const { data: existing } = await supabase
      .from('demo_requests')
      .select('id, status')
      .eq('user_id', account.id)
      .limit(1)
    if (existing?.length) {
      throw new Error('Vous avez déjà soumis une demande de démo. Notre équipe vous contactera sous 24–48h.')
    }
    // Vérifier si cette IP a déjà une demande approuvée/en attente
    if (ip !== 'unknown') {
      const { data: ipExisting } = await supabase
        .from('demo_requests')
        .select('id')
        .eq('ip_address', ip)
        .in('status', ['pending', 'approved'])
        .limit(1)
      if (ipExisting?.length) {
        throw new Error('Une demande de démo est déjà en cours depuis cet accès réseau.')
      }
    }
    const { error } = await supabase.from('demo_requests').insert({
      user_id:    account.id,
      email:      account.email,
      first_name: account.firstName,
      last_name:  account.lastName,
      message:    message ?? null,
      ip_address: ip,
      status:     'pending',
    })
    if (error) throw new Error(`Impossible de soumettre la demande : ${error.message}`)
    return
  }

  // ── Mode local ──────────────────────────────────────────────────────────────
  const requests = readValue<DemoRequest[]>(DEMO_REQUESTS_KEY, [])
  if (requests.some(r => r.userId === account.id)) {
    throw new Error('Vous avez déjà soumis une demande de démo.')
  }
  if (ip !== 'unknown' && requests.some(r => r.ipAddress === ip && r.status !== 'rejected')) {
    throw new Error('Une demande de démo est déjà en cours depuis cet accès réseau.')
  }
  requests.push({
    id:         crypto.randomUUID(),
    userId:     account.id,
    email:      account.email,
    firstName:  account.firstName,
    lastName:   account.lastName,
    message,
    ipAddress:  ip,
    status:     'pending',
    createdAt:  new Date().toISOString(),
  })
  localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(requests))
}

export async function getDemoRequests(): Promise<DemoRequest[]> {
  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('demo_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (data ?? []).map((r: Record<string, any>) => ({
      id:        r.id,
      userId:    r.user_id,
      email:     r.email,
      firstName: r.first_name,
      lastName:  r.last_name,
      message:   r.message ?? undefined,
      ipAddress: r.ip_address,
      status:    r.status,
      createdAt: r.created_at,
    }))
  }
  return readValue<DemoRequest[]>(DEMO_REQUESTS_KEY, [])
}

export async function reviewDemoRequest(
  requestId: string,
  decision:  'approved' | 'rejected',
  actorEmail: string,
): Promise<void> {
  if (usesRemoteDatabase) {
    const supabase = getSupabaseClient()
    const { data: req, error: fetchErr } = await supabase
      .from('demo_requests')
      .select('user_id, email')
      .eq('id', requestId)
      .single()
    if (fetchErr || !req) throw new Error('Demande introuvable.')
    await supabase.from('demo_requests').update({
      status:      decision,
      reviewed_at: new Date().toISOString(),
      reviewed_by: actorEmail,
    }).eq('id', requestId)
    if (decision === 'approved') {
      await supabase.from('profiles').update({ access_status: 'trial' }).eq('id', req.user_id)
    }
    appendLocalAudit({
      action:      decision === 'approved' ? 'demo_approved' : 'demo_rejected',
      actorEmail,
      targetEmail: req.email,
    })
    return
  }

  // ── Mode local ──────────────────────────────────────────────────────────────
  const requests = readValue<DemoRequest[]>(DEMO_REQUESTS_KEY, [])
  const req      = requests.find(r => r.id === requestId)
  if (!req) throw new Error('Demande introuvable.')
  req.status = decision
  localStorage.setItem(DEMO_REQUESTS_KEY, JSON.stringify(requests))
  if (decision === 'approved') {
    const accounts = await initializeLocalAccounts()
    const updated  = accounts.map(a => a.id === req.userId ? { ...a, status: 'trial' as AccessStatus } : a)
    saveLocalAccounts(updated)
  }
  appendLocalAudit({ action: decision === 'approved' ? 'demo_approved' : 'demo_rejected', actorEmail, targetEmail: req.email })
}

export async function reviewAccessRequest(
  accountId: string,
  status: Extract<AccessStatus, 'approved' | 'rejected'>,
  actorEmail: string,
) {
  if (getActiveOAuthPreviewAccount()) {
    return getOAuthPreviewAccounts()
  }

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
    throw new Error("Cette demande n'existe plus.")
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
  if (usesRemoteDatabase && !getActiveOAuthPreviewAccount()) {
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
  if (usesRemoteDatabase && !getActiveOAuthPreviewAccount()) {
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
