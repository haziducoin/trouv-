// ─── POST /api/enrich-background — Worker d'enrichissement en arrière-plan ───
// Appelé par un cron Vercel ou un webhook interne, jamais directement par le front.
// Protégé par CRON_SECRET (env var Vercel).
//
// Système de priorité suggéré (à implémenter dans le cron) :
//   Haute  : contacts souvent recherchés, fiches incomplètes, homonymes fréquents
//   Basse  : fiches déjà très complètes, contacts jamais vus

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin }    from './_lib/supabase.js'
import { enrichBackground } from './_lib/ai-enrichment.js'

const CRON_SECRET = process.env.CRON_SECRET

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // Secret partagé entre le cron et cette route
  const authHeader = String(req.headers['authorization'] ?? '')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: 'Non autorisé' })
    return
  }

  const { contact_id, prenom, nom, ville } = req.body ?? {}

  if (!contact_id || !String(prenom ?? '').trim() || !String(nom ?? '').trim()) {
    res.status(400).json({ error: 'contact_id, prenom et nom sont requis' })
    return
  }

  // Évite de ré-enrichir une fiche récemment traitée (< 7 jours)
  const { data: existing } = await supabaseAdmin
    .from('contact_enrichment')
    .select('checked_at, confidence_score')
    .eq('contact_id', Number(contact_id))
    .maybeSingle()

  if (existing?.checked_at) {
    const age = Date.now() - new Date(existing.checked_at).getTime()
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (age < sevenDays && (existing.confidence_score ?? 0) >= 60) {
      res.json({ ok: true, skipped: true, reason: 'already_enriched_recently' })
      return
    }
  }

  try {
    const result = await enrichBackground({
      prenom: String(prenom).trim(),
      nom:    String(nom).trim(),
      ville:  ville ? String(ville).trim() : null,
    })

    await supabaseAdmin.from('contact_enrichment').upsert({
      contact_id:            Number(contact_id),
      company:               result.company,
      job_title:             result.job_title,
      school:                result.school,
      industry:              result.industry,
      professional_location: result.professional_location,
      public_profile_url:    result.public_profile_url,
      company_website:       result.company_website,
      confidence_score:      result.confidence_score,
      status:                'uncertain', // background = signal d'aide, pas confirmation
      sources:               result.sources,
      checked_at:            new Date().toISOString(),
    }, { onConflict: 'contact_id' })

    res.json({ ok: true, contact_id, confidence_score: result.confidence_score })
  } catch (err: any) {
    console.error('[enrich/background]', err?.message ?? err)
    res.status(500).json({ error: 'Enrichissement background échoué' })
  }
}
