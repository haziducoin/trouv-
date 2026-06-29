import { getSupabaseClient } from '@/lib/supabase'

export interface BanResult {
  adresse:     string
  code_postal: string
  ville:       string
  score:       number
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
      adresse:     f.properties.name     ?? '',
      code_postal: f.properties.postcode ?? '',
      ville:       f.properties.city     ?? '',
      score:       f.properties.score    ?? 0,
    }
  } catch {
    return null
  }
}

export interface NormalizeProgress {
  total:   number
  done:    number
  skipped: number
  failed:  number
}

// Build the best possible BAN query from available fields
function buildQuery(adresse: string, code_postal: string | null, ville: string | null): string {
  return [adresse, code_postal, ville].filter(Boolean).join(' ')
}

export async function normalizeAllAddresses(
  onProgress?: (p: NormalizeProgress) => void,
  minScore = 0.7,
): Promise<NormalizeProgress> {
  const supabase = getSupabaseClient()

  // Fetch ALL contacts with a non-empty adresse — normalize even those with cp+ville
  // because the rue field itself may be abbreviated or badly formatted
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, adresse, code_postal, ville')
    .not('adresse', 'is', null)
    .neq('adresse', '')

  if (error || !contacts) throw new Error(error?.message ?? 'Fetch failed')

  const progress: NormalizeProgress = {
    total:   contacts.length,
    done:    0,
    skipped: 0,
    failed:  0,
  }
  onProgress?.(progress)

  for (const contact of contacts) {
    const q      = buildQuery(contact.adresse, contact.code_postal, contact.ville)
    const result = await queryBAN(q)

    if (!result || result.score < minScore || !result.adresse) {
      progress.failed++
    } else {
      const { error: upErr } = await supabase
        .from('contacts')
        .update({
          adresse:     result.adresse,
          code_postal: result.code_postal,
          ville:       result.ville,
        })
        .eq('id', contact.id)
      if (upErr) { progress.failed++ } else { progress.done++ }
    }

    onProgress?.({ ...progress })
    // ~10 req/s to stay within BAN API rate limits
    await new Promise(r => setTimeout(r, 100))
  }

  return progress
}
