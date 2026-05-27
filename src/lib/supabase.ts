import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
)?.trim()
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)?.trim()

export const isRemoteDatabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient() {
  if (!isRemoteDatabaseConfigured || !supabaseUrl || !supabaseAnonKey) {
    throw new Error('La base Supabase n’est pas encore configurée.')
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }

  return supabaseClient
}

export function databaseModeLabel() {
  return isRemoteDatabaseConfigured ? 'Supabase connecté' : 'Mode démo local'
}
