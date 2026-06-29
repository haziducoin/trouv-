import { getSupabaseClient } from '@/lib/supabase'

export interface BanResult {
  adresse: string
  code_postal: string
  ville: string
  score: number
}

async function queryBAN(q: string): Promise<BanResult | null> {
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const f = data.features?.[0]
    if (!f) return null
    return {
      adresse:      f.properties.name    ?? '',
      code_postal:  f.properties.postcode ?? '',
      ville:        f.properties.city     ?? '',
      score:        f.properties.score    ?? 0,
    }
  } catch {
    return null
  }
}

export interface NormalizeProgress {
  total:     number
  done:      number
  skipped:   number
  failed:    number
}

// Returns true when BAN should be called (no separate cp/ville or adresse looks like full address)
function needsNormalization(adresse: string | null, code_postal: string | null, ville: string | null): boolean {
  if (!adresse?.trim()) return false
  if (code_postal?.trim() && ville?.trim()) return false  // already clean
  return true
}

export async function normalizeAllAddresses(
  onProgress?: (p: NormalizeProgress) => void,
  minScore = 0.5,
): Promise<NormalizeProgress> {
  const supabase = getSupabaseClient()

  // Fetch contacts that need normalization (no cp or no ville)
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, adresse, code_postal, ville')
    .not('adresse', 'is', null)
    .neq('adresse', '')

  if (error || !contacts) throw new Error(error?.message ?? 'Fetch failed')

  const toProcess = contacts.filter(c =>
    needsNormalization(c.adresse, c.code_postal, c.ville)
  )

  const progress: NormalizeProgress = { total: toProcess.length, done: 0, skipped: 0, failed: 0 }
  onProgress?.(progress)

  for (const contact of toProcess) {
    const result = await queryBAN(contact.adresse)

    if (!result || result.score < minScore) {
      progress.failed++
    } else {
      const { error: upErr } = await supabase
        .from('contacts')
        .update({ adresse: result.adresse, code_postal: result.code_postal, ville: result.ville })
        .eq('id', contact.id)
      if (upErr) { progress.failed++ } else { progress.done++ }
    }

    onProgress?.({ ...progress })
    // Rate-limit: ~10 req/s max
    await new Promise(r => setTimeout(r, 100))
  }

  return progress
}
