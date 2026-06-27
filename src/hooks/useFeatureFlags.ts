import { useState, useEffect, useCallback } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

type FlagMap = Record<string, boolean>

const CACHE_KEY = '_ff_cache'
const CACHE_TTL = 60_000 // 1 min

function readCache(): FlagMap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw) as { data: FlagMap; ts: number }
    return Date.now() - ts < CACHE_TTL ? data : null
  } catch {
    return null
  }
}

function writeCache(data: FlagMap) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

export function invalidateFlagsCache() {
  try { localStorage.removeItem(CACHE_KEY) } catch {}
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FlagMap | null>(() => readCache())
  const [loading, setLoading] = useState(flags === null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = getSupabaseClient()
      const { data } = await supabase
        .from('feature_flags')
        .select('key, enabled')
      if (data) {
        const map = Object.fromEntries(data.map((f: { key: string; enabled: boolean }) => [f.key, f.enabled]))
        setFlags(map)
        writeCache(map)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const cached = readCache()
    if (cached) { setFlags(cached); setLoading(false) }
    else void refresh()
  }, [refresh])

  // Optimiste : si flags pas encore chargés, on considère tout comme activé
  const isEnabled = (key: string): boolean => flags === null ? true : (flags[key] ?? true)

  return { flags, isEnabled, loading, refresh }
}
