// ─── Client de l'enrichissement approfondi CrewAI (/api/enrich-crew) ─────────
// Le endpoint est un POST qui répond en SSE : on parse le stream manuellement
// (EventSource ne supporte que GET).

import { getSupabaseClient } from '@/lib/supabase'

export interface CrewSource {
  url: string | null
  source_type: string
  confidence: number
  date_collecte: string
}

export interface CrewEnrichResult {
  contact_id: number
  review_status: 'auto' | 'pending_review' | 'approved' | 'rejected'
  company: string | null
  job_title: string | null
  school: string | null
  industry: string | null
  professional_location: string | null
  public_profile_url: string | null
  company_website: string | null
  confidence_score: number
  status: 'confirmed' | 'likely' | 'uncertain' | 'possible_homonym' | 'insufficient_data'
  ai_summary: string
  sources: CrewSource[]
}

export interface CrewStreamCallbacks {
  onStart?: (stages: string[]) => void
  onStep?: (tool: string | null) => void
  onResult: (result: CrewEnrichResult) => void
  onError: (message: string) => void
}

async function authHeader(): Promise<string> {
  const { data: { session } } = await getSupabaseClient().auth.getSession()
  if (!session?.access_token) throw new Error('Session expirée')
  return `Bearer ${session.access_token}`
}

export async function streamCrewEnrichment(
  contactId: string | number,
  callbacks: CrewStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch('/api/enrich-crew', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify({ contact_id: contactId }),
    signal,
  })

  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    callbacks.onError(err.error ?? `HTTP ${resp.status}`)
    return
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let gotResult = false

  const handleEvent = (eventName: string, data: string) => {
    if (eventName === 'start') {
      try { callbacks.onStart?.(JSON.parse(data).stages ?? []) } catch { /* ignore */ }
    } else if (eventName === 'step') {
      try { callbacks.onStep?.(JSON.parse(data).tool ?? null) } catch { callbacks.onStep?.(null) }
    } else if (eventName === 'result') {
      try {
        gotResult = true
        callbacks.onResult(JSON.parse(data) as CrewEnrichResult)
      } catch {
        callbacks.onError('Réponse illisible du service')
      }
    } else if (eventName === 'error') {
      gotResult = true
      try { callbacks.onError(JSON.parse(data).message ?? 'Erreur inconnue') } catch { callbacks.onError('Erreur inconnue') }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // Les événements SSE sont séparés par une ligne vide
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) handleEvent(eventName, dataLines.join('\n'))
    }
  }

  if (!gotResult) callbacks.onError('Le flux s\'est interrompu avant la fin de l\'enrichissement')
}

export async function reviewCrewEnrichment(
  contactId: string | number,
  decision: 'approve' | 'reject',
): Promise<void> {
  const resp = await fetch('/api/enrich-crew', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify({ contact_id: contactId, review: decision }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error ?? `HTTP ${resp.status}`)
  }
}
