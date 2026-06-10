import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
  ?? 'https://vomcbufxrfpypjzsbgyl.supabase.co'
)?.trim()
const supabaseAnonKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvbWNidWZ4cmZweXBqenNiZ3lsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NzkzNjQsImV4cCI6MjA5NjI1NTM2NH0.3OqpSq5Y4NpGwHgKrAOE88zc0plViWmgwVpEIpkaYpg'
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
        storageKey: 'trouve_supabase_auth',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    })
  }

  return supabaseClient
}

export function databaseModeLabel() {
  return isRemoteDatabaseConfigured ? 'Supabase connecté' : 'Mode démo local'
}
