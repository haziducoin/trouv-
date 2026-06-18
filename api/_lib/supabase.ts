import { createClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'

// Variables DÉDIÉES (TROUVE_*) prioritaires : elles ciblent le projet vomcbufx
// utilisé par le front, indépendamment de l'intégration Vercel↔Supabase qui
// pointe sur un autre projet.
const SUPABASE_URL =
  process.env.TROUVE_SUPABASE_URL
  ?? process.env.VITE_SUPABASE_URL
  ?? process.env.SUPABASE_URL ?? ''
const SERVICE_KEY =
  process.env.TROUVE_SUPABASE_SECRET
  ?? process.env.SUPABASE_SECRET_KEY
  ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// Client admin (service role) — bypass RLS, jamais exposé au client.
export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface AuthContext {
  userId: string
  email: string
  organizationId: string | null
  cguAccepted: boolean
  role: string
}

/**
 * Vérifie le token Bearer envoyé par le frontend et renvoie le contexte utilisateur.
 * Retourne null si le token est absent ou invalide.
 */
export async function authenticate(req: VercelRequest): Promise<AuthContext | null> {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id, cgu_accepted, role')
    .eq('id', user.id)
    .single()

  return {
    userId: user.id,
    email: user.email ?? '',
    organizationId: profile?.organization_id ?? null,
    cguAccepted: profile?.cgu_accepted ?? false,
    role: profile?.role ?? 'agent',
  }
}

/** Retourne null si l'utilisateur est admin, sinon un objet { status, message } à renvoyer. */
export function requireAdmin(auth: AuthContext | null): { status: number; message: string } | null {
  if (!auth) return { status: 401, message: 'Authentification requise' }
  if (auth.role !== 'admin') return { status: 403, message: 'Accès réservé aux administrateurs' }
  return null
}
