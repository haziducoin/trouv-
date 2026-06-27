import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, supabaseAdmin } from './_lib/supabase.js'
import { deduplicateRows } from './_lib/dedup.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await authenticate(req)
  if (!auth) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }

  if (!auth.organizationId) {
    res.status(403).json({ error: 'Organisation requise' })
    return
  }

  const {
    p_nom, p_prenom, p_ville, p_cp, p_tel,
    p_identity, p_annee_naissance,
    p_mode  = 'starts_with',
    p_limit = 20,
    p_offset = 0,
  } = req.body ?? {}

  const { data, error } = await supabaseAdmin.rpc('search_contacts_for_org', {
    p_org:              auth.organizationId,
    p_nom:              p_nom              ?? null,
    p_prenom:           p_prenom           ?? null,
    p_ville:            p_ville            ?? null,
    p_cp:               p_cp               ?? null,
    p_tel:              p_tel              ?? null,
    p_identity:         p_identity         ?? null,
    p_annee_naissance:  p_annee_naissance  ?? null,
    p_mode,
    p_limit:  Math.min(Number(p_limit)  || 20, 100),
    p_offset: Math.max(Number(p_offset) || 0,  0),
  })

  if (error) {
    console.error('[search] rpc error:', error.message)
    res.status(500).json({ error: error.message })
    return
  }

  const deduped = deduplicateRows((data ?? []) as Parameters<typeof deduplicateRows>[0])

  // Enregistre la recherche (fire-and-forget — ne bloque pas la réponse)
  const queryLabel = [p_nom, p_prenom, p_ville, p_cp, p_identity]
    .filter(Boolean).join(' ').trim() || 'Recherche sans critère'
  void supabaseAdmin.from('searches').insert({
    user_id:         auth.userId,
    organization_id: auth.organizationId,
    query_label:     queryLabel.slice(0, 200),
    filters:         { p_nom, p_prenom, p_ville, p_cp, p_tel, p_identity, p_annee_naissance, p_mode },
    result_count:    deduped.length,
    units_consumed:  1,
  })

  res.json({ results: deduped })
}
