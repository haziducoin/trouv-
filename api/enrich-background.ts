// ─── /api/enrich-background — Worker d'enrichissement en arrière-plan ────────
// Deux modes :
//   GET  (cron Vercel 3h du matin) : batch autonome — choisit les contacts à traiter
//   POST (webhook interne)         : single-contact avec contact_id+prenom+nom dans le body
// Protégé par CRON_SECRET (env var Vercel, injecté automatiquement dans l'Authorization).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin }    from './_lib/supabase.js'
import { enrichBackground } from './_lib/ai-enrichment.js'

const CRON_SECRET  = process.env.CRON_SECRET
const BATCH_SIZE   = 5  // max contacts par run cron (budget 60s serverless)
const SEVEN_DAYS   = 7 * 24 * 60 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const authHeader = String(req.headers['authorization'] ?? '')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: 'Non autorisé' })
    return
  }

  // ── Mode POST : single-contact (webhook) ──────────────────────────────────
  if (req.method === 'POST') {
    const { contact_id, prenom, nom, ville, date_naissance } = req.body ?? {}
    if (!contact_id || !String(prenom ?? '').trim() || !String(nom ?? '').trim()) {
      res.status(400).json({ error: 'contact_id, prenom et nom sont requis' })
      return
    }
    const result = await enrichSingle({ contact_id: Number(contact_id), prenom: String(prenom).trim(), nom: String(nom).trim(), ville: ville ? String(ville).trim() : null, date_naissance: date_naissance ? String(date_naissance) : null })
    res.json(result)
    return
  }

  // ── Mode GET : batch cron ─────────────────────────────────────────────────
  // Sélectionne les contacts récemment débloqués mais pas encore enrichis (ou enrichissement périmé/faible)
  const { data: candidates, error } = await supabaseAdmin.rpc('pick_enrichment_candidates', { batch_limit: BATCH_SIZE })

  if (error || !candidates?.length) {
    res.json({ ok: true, processed: 0, reason: error ? error.message : 'no_candidates' })
    return
  }

  const results: Array<{ contact_id: number; ok: boolean; skipped?: boolean; confidence_score?: number; error?: string }> = []

  for (const c of candidates as Array<{ id: number; prenom: string; nom: string; ville: string | null; date_naissance: string | null }>) {
    try {
      const r = await enrichSingle({ contact_id: c.id, prenom: c.prenom, nom: c.nom, ville: c.ville, date_naissance: c.date_naissance })
      results.push(r)
    } catch (err: any) {
      results.push({ contact_id: c.id, ok: false, error: err?.message ?? 'unknown' })
    }
  }

  res.json({ ok: true, processed: results.length, results })
}

// ─── Enrichit un contact et met à jour contact_enrichment ────────────────────
async function enrichSingle(args: { contact_id: number; prenom: string; nom: string; ville: string | null; date_naissance: string | null }) {
  const { contact_id, prenom, nom, ville, date_naissance } = args

  // Évite de ré-enrichir une fiche récemment traitée (< 7 jours avec score ≥ 60)
  const { data: existing } = await supabaseAdmin
    .from('contact_enrichment')
    .select('checked_at, confidence_score')
    .eq('contact_id', contact_id)
    .maybeSingle()

  if (existing?.checked_at) {
    const age = Date.now() - new Date(existing.checked_at).getTime()
    if (age < SEVEN_DAYS && (existing.confidence_score ?? 0) >= 60) {
      return { contact_id, ok: true, skipped: true }
    }
  }

  const result = await enrichBackground({ prenom, nom, ville, date_naissance })

  const isOfficial = result.sources?.some(s => s.source_type === 'official_registry')

  await supabaseAdmin.from('contact_enrichment').upsert({
    contact_id,
    company:               result.company,
    job_title:             result.job_title,
    school:                result.school,
    industry:              result.industry,
    professional_location: result.professional_location,
    public_profile_url:    result.public_profile_url,
    company_website:       result.company_website,
    confidence_score:      result.confidence_score,
    status:                isOfficial ? 'confirmed' : 'uncertain',
    sources:               result.sources,
    checked_at:            new Date().toISOString(),
  }, { onConflict: 'contact_id' })

  return { contact_id, ok: true, confidence_score: result.confidence_score }
}
