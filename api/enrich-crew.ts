// ─── /api/enrich-crew — Proxy vers le microservice CrewAI ────────────────────
// POST { contact_id }                    → relaie le stream SSE du crew au client
// POST { contact_id, review: 'approve' } → validation humaine d'un enrichissement
//
// Le microservice Python (Railway) n'est jamais exposé au navigateur : ce proxy
// authentifie le JWT Supabase de l'utilisateur puis forward avec le secret partagé.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate } from './_lib/supabase.js'

const SERVICE_URL    = process.env.ENRICH_SERVICE_URL ?? ''
const SERVICE_SECRET = process.env.ENRICH_SERVICE_SECRET ?? ''

export const config = { maxDuration: 300 }

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

  if (!SERVICE_URL || !SERVICE_SECRET) {
    res.status(503).json({ error: "Service d'enrichissement non configuré" })
    return
  }

  const { contact_id, review } = req.body ?? {}
  if (!contact_id) {
    res.status(400).json({ error: 'contact_id requis' })
    return
  }

  // ── Mode review : validation humaine ──────────────────────────────────────
  if (review === 'approve' || review === 'reject') {
    const r = await fetch(`${SERVICE_URL}/review/${Number(contact_id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Enrich-Secret': SERVICE_SECRET },
      body: JSON.stringify({ decision: review }),
    })
    res.status(r.status).json(await r.json().catch(() => ({})))
    return
  }

  // ── Mode enrich : relais du stream SSE ─────────────────────────────────────
  try {
    const upstream = await fetch(`${SERVICE_URL}/enrich/${Number(contact_id)}`, {
      method: 'POST',
      headers: { 'X-Enrich-Secret': SERVICE_SECRET },
    })

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => '')
      res.status(upstream.status).json({ error: detail || 'Erreur du service d\'enrichissement' })
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    const reader = upstream.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(Buffer.from(value))
    }
    res.end()
  } catch (e: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: `Service d'enrichissement injoignable : ${e.message}` })
    } else {
      res.end()
    }
  }
}
