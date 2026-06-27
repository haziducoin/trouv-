// ─── POST /api/enrich — Enrichissement on-unlock ─────────────────────────────
// Déclenché quand l'utilisateur ouvre une fiche OU clique "Unlock".
// Récupère TOUS les signaux privés depuis Supabase (non affichés sur la fiche)
// pour enrichir la recherche IA et éviter les mauvais unlocks sur homonymes.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from './_lib/supabase.js'
import { enrichOnUnlock }              from './_lib/ai-enrichment.js'

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

  const { unlock_id, contact_id, unlock_type = 'phone' } = req.body ?? {}

  if (!contact_id) {
    res.status(400).json({ error: 'contact_id requis' })
    return
  }

  // force=true relance Groq (bouton "Rafraîchir") — on garde l'ancien cache en backup
  const forceRefresh = req.body?.force === true

  try {
    // ── 1. Lire le cache existant (toujours, même en force — sert de backup)
    const { data: existingCache } = await supabaseAdmin
      .from('contact_enrichment')
      .select('company,job_title,school,industry,professional_location,public_profile_url,company_website,confidence_score,status,ai_summary,checked_at')
      .eq('contact_id', Number(contact_id))
      .maybeSingle()

    if (!forceRefresh) {
      if (existingCache) {
        const ageMs = Date.now() - new Date(existingCache.checked_at ?? 0).getTime()
        const cacheTtlMs = 30 * 24 * 60 * 60 * 1000 // 30 jours
        if (ageMs < cacheTtlMs) {
          const showWarning = (existingCache.confidence_score ?? 100) < 60 || existingCache.status === 'possible_homonym'
          res.json({
            confidence_score:    existingCache.confidence_score ?? 70,
            status:              existingCache.status ?? 'likely',
            user_facing_message: existingCache.ai_summary ?? '',
            safe_enrichments: {
              company:               existingCache.company               ?? null,
              job_title:             existingCache.job_title             ?? null,
              school:                existingCache.school                ?? null,
              industry:              existingCache.industry              ?? null,
              professional_location: existingCache.professional_location ?? null,
              public_profile_url:    existingCache.public_profile_url    ?? null,
              company_website:       existingCache.company_website       ?? null,
            },
            show_warning:  showWarning,
            from_cache:    true,
          })
          return
        }
      }
    }

    // ── 2. Récupère TOUS les signaux disponibles en base (pas juste ce que le front envoie)
    const { data: rawContact } = await supabaseAdmin
      .from('contacts')
      .select([
        'nom', 'prenom', 'ville', 'adresse', 'adresse_complement',
        'code_postal', 'pays', 'date_naissance', 'lieu_naissance',
        'sexe', 'civilite', 'societe', 'siret', 'siren',
        'code_naf', 'activite', 'site_web', 'pseudo',
        'email', 'telephone', 'mobile', 'raw_data',
      ].join(','))
      .eq('id', Number(contact_id))
      .maybeSingle()

    const contact = rawContact as Record<string, any> | null

    if (!contact?.nom && !contact?.prenom) {
      res.status(404).json({ error: 'Contact introuvable' })
      return
    }

    // ── 3. Extrait les signaux supplémentaires du champ raw_data JSONB
    const raw = contact.raw_data as Record<string, unknown> | null ?? {}
    const rawExtra: string[] = []
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'string' && v.length < 200 && !['nom','prenom','email','telephone'].includes(k))
        rawExtra.push(`${k}: ${v}`)
    }

    // ── 4. Lance l'enrichissement IA avec tous les signaux disponibles
    const result = await enrichOnUnlock({
      prenom:             String(contact.prenom ?? '').trim(),
      nom:                String(contact.nom ?? '').trim(),
      ville:              contact.ville              ?? null,
      adresse:            contact.adresse            ?? null,
      code_postal:        contact.code_postal        ?? null,
      date_naissance:     contact.date_naissance     ?? null,
      lieu_naissance:     contact.lieu_naissance     ?? null,
      sexe:               contact.sexe               ?? null,
      entreprise:         contact.societe            ?? null,
      siret:              contact.siret              ?? null,
      siren:              contact.siren              ?? null,
      code_naf:           contact.code_naf           ?? null,
      activite:           contact.activite           ?? null,
      site_web:           contact.site_web           ?? null,
      pseudo:             contact.pseudo             ?? null,
      email_masque:       contact.email              ? String(contact.email).replace(/(.{2}).+(@.+)/, '$1***$2') : null,
      tel_masque:         contact.telephone          ? String(contact.telephone).slice(0, 4) + '******' : null,
      raw_extra:          rawExtra.length > 0 ? rawExtra.join(' | ') : null,
    })

    // ── 4. Persiste pour audit RGPD
    await supabaseAdmin.from('unlock_enrichments').insert({
      unlock_id:              unlock_id ? String(unlock_id) : null,
      contact_id:             Number(contact_id),
      organization_id:        auth.organizationId,
      unlocked_by:            auth.userId ?? null,
      unlock_type:            String(unlock_type),
      confidence_score:       result.identity_confidence_score,
      status:                 result.status,
      ai_summary:             result.professional_summary,
      disambiguation_signals: result.disambiguation_signals,
      conflicting_signals:    result.conflicting_signals,
      sources:                result.sources,
      safe_enrichments:       result.safe_enrichments,
    })

    // ── 5. Si le refresh échoue (insufficient_data) ET qu'il y a un ancien cache valide → le conserver
    if (forceRefresh && result.status === 'insufficient_data' && existingCache?.company) {
      // Le recherche live n'a rien trouvé de mieux — on remet l'ancien résultat
      await supabaseAdmin.from('contact_enrichment').upsert({
        contact_id:            Number(contact_id),
        company:               existingCache.company,
        job_title:             existingCache.job_title,
        school:                existingCache.school,
        industry:              existingCache.industry,
        professional_location: existingCache.professional_location,
        public_profile_url:    existingCache.public_profile_url,
        company_website:       existingCache.company_website,
        confidence_score:      existingCache.confidence_score,
        status:                existingCache.status,
        ai_summary:            existingCache.ai_summary,
        checked_at:            new Date().toISOString(),
      }, { onConflict: 'contact_id' })

      const showWarning = (existingCache.confidence_score ?? 100) < 60 || existingCache.status === 'possible_homonym'
      res.json({
        confidence_score:    existingCache.confidence_score ?? 70,
        status:              existingCache.status ?? 'likely',
        user_facing_message: existingCache.ai_summary ?? '',
        safe_enrichments: {
          company:               existingCache.company               ?? null,
          job_title:             existingCache.job_title             ?? null,
          school:                existingCache.school                ?? null,
          industry:              existingCache.industry              ?? null,
          professional_location: existingCache.professional_location ?? null,
          public_profile_url:    existingCache.public_profile_url    ?? null,
          company_website:       existingCache.company_website       ?? null,
        },
        show_warning:  showWarning,
        from_cache:    true,
        refreshed:     false,
      })
      return
    }

    // ── 6. Met à jour contact_enrichment si résultat exploitable ET meilleur que le cache existant
    const existingConfidence = existingCache?.confidence_score ?? 0
    const newConfidence = result.identity_confidence_score
    // Ne jamais écraser un cache de haute confiance (≥75) avec un résultat moins bon
    const shouldOverwrite = result.status !== 'insufficient_data'
      && newConfidence >= 40
      && (newConfidence > existingConfidence || existingConfidence < 75)

    // Si le cache existant est meilleur → le conserver et retourner directement
    if (forceRefresh && !shouldOverwrite && existingCache?.company) {
      const showWarning = (existingCache.confidence_score ?? 100) < 60 || existingCache.status === 'possible_homonym'
      res.json({
        confidence_score:    existingCache.confidence_score ?? 70,
        status:              existingCache.status ?? 'likely',
        user_facing_message: existingCache.ai_summary ?? '',
        safe_enrichments: {
          company:               existingCache.company               ?? null,
          job_title:             existingCache.job_title             ?? null,
          school:                existingCache.school                ?? null,
          industry:              existingCache.industry              ?? null,
          professional_location: existingCache.professional_location ?? null,
          public_profile_url:    existingCache.public_profile_url    ?? null,
          company_website:       existingCache.company_website       ?? null,
        },
        show_warning:  showWarning,
        from_cache:    true,
        refreshed:     false,
      })
      return
    }

    if (shouldOverwrite) {
      await supabaseAdmin.from('contact_enrichment').upsert({
        contact_id:            Number(contact_id),
        company:               result.safe_enrichments.company,
        job_title:             result.safe_enrichments.job_title,
        school:                result.safe_enrichments.school,
        industry:              result.safe_enrichments.industry,
        professional_location: result.safe_enrichments.professional_location,
        public_profile_url:    result.safe_enrichments.public_profile_url,
        company_website:       result.safe_enrichments.company_website,
        confidence_score:      result.identity_confidence_score,
        status:                result.status,
        sources:               result.sources,
        ai_summary:            result.professional_summary,
        checked_at:            new Date().toISOString(),
      }, { onConflict: 'contact_id' })
    }

    const showWarning = result.identity_confidence_score < 60 || result.status === 'possible_homonym'

    res.json({
      confidence_score:    result.identity_confidence_score,
      status:              result.status,
      user_facing_message: result.user_facing_message,
      safe_enrichments:    result.safe_enrichments,
      show_warning:        showWarning,
    })
  } catch (err: any) {
    console.error('[enrich/unlock]', err?.message ?? err)

    if (err?.message?.includes('API_KEY') || err?.message?.includes('401') || err?.message?.includes('invalid_api_key')) {
      res.status(503).json({ error: 'Service IA indisponible — vérifiez GROQ_API_KEY dans Vercel' })
      return
    }
    if (err?.message?.includes('429') || err?.message?.includes('rate_limit')) {
      res.status(503).json({ error: 'Quota IA atteint — réessayez dans quelques instants' })
      return
    }

    res.status(500).json({ error: 'Enrichissement impossible, réessayez dans quelques instants' })
  }
}
