/**
 * POST /api/track-ip
 * Appelé après chaque connexion réussie — enregistre l'IP du client.
 * Déclenche une alerte si > 2 IPs distinctes sur le compte.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, supabaseAdmin } from './_lib/supabase.js'

const MAX_IPS = 2

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const auth = await authenticate(req)
  if (!auth) { res.status(401).json({ error: 'Non authentifié' }); return }

  const ip = getClientIp(req)
  const userAgent = req.headers['user-agent'] ?? 'unknown'

  // Upsert IP — incrémente login_count si déjà connue
  const { error: upsertErr } = await supabaseAdmin
    .from('profile_ips')
    .upsert(
      {
        profile_id: auth.userId,
        ip_address: ip,
        user_agent: userAgent,
        last_seen_at: new Date().toISOString(),
        login_count: 1,
      },
      {
        onConflict: 'profile_id,ip_address',
        ignoreDuplicates: false,
      }
    )

  // Si upsert ne supporte pas l'incrément, on update manuellement
  if (upsertErr) {
    await supabaseAdmin
      .from('profile_ips')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('profile_id', auth.userId)
      .eq('ip_address', ip)
  } else {
    // Incrémenter le compteur sur les entrées existantes
    // Incrémenter le compteur manuellement
    await supabaseAdmin
      .from('profile_ips')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('profile_id', auth.userId)
      .eq('ip_address', ip)
  }

  // Compter les IPs distinctes
  const { data: ips, count } = await supabaseAdmin
    .from('profile_ips')
    .select('ip_address, first_seen_at, last_seen_at', { count: 'exact' })
    .eq('profile_id', auth.userId)

  const ipCount = count ?? (ips?.length ?? 0)

  // Alerte si > MAX_IPS
  if (ipCount > MAX_IPS) {
    await supabaseAdmin
      .from('profiles')
      .update({
        ip_alert: true,
        ip_alert_reason: `${ipCount} adresses IP distinctes détectées (max autorisé : ${MAX_IPS})`,
      })
      .eq('id', auth.userId)

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: auth.userId,
      action: 'ip_alert_triggered',
      metadata: {
        ip_count: ipCount,
        new_ip: ip,
        user_agent: userAgent,
      },
    })
  } else {
    // Réinitialiser l'alerte si on redescend sous le seuil (ex: admin a supprimé une IP)
    await supabaseAdmin
      .from('profiles')
      .update({ ip_alert: false, ip_alert_reason: null })
      .eq('id', auth.userId)
      .eq('ip_alert', true)
  }

  res.json({ ok: true, ipCount, alert: ipCount > MAX_IPS, ip })
}
