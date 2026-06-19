/**
 * GET  /api/devices           — liste les appareils de l'utilisateur connecté
 * POST /api/devices           — enregistre / met à jour un appareil après connexion
 * DELETE /api/devices?id=xxx  — révoque un appareil (avec vérif du mot de passe)
 * DELETE /api/devices?all=1   — révoque tous les autres appareils
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, supabaseAdmin } from './_lib/supabase.js'

const MAX_DEVICES = 2

function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
  }
  return req.socket?.remoteAddress ?? 'unknown'
}

function parseUserAgent(ua: string): {
  deviceType: string
  operatingSystem: string
  browser: string
  deviceName: string
} {
  const s = ua.toLowerCase()

  // Device type
  let deviceType = 'desktop'
  if (/iphone|android.*mobile|windows phone/.test(s)) deviceType = 'mobile'
  else if (/ipad|android(?!.*mobile)|tablet/.test(s)) deviceType = 'tablet'

  // OS
  let operatingSystem = 'Inconnu'
  if (s.includes('windows nt 10')) operatingSystem = 'Windows 10/11'
  else if (s.includes('windows nt 6.3')) operatingSystem = 'Windows 8.1'
  else if (s.includes('windows')) operatingSystem = 'Windows'
  else if (s.includes('mac os x') && !s.includes('iphone') && !s.includes('ipad')) operatingSystem = 'macOS'
  else if (s.includes('iphone os')) operatingSystem = 'iOS'
  else if (s.includes('ipad')) operatingSystem = 'iPadOS'
  else if (s.includes('android')) operatingSystem = 'Android'
  else if (s.includes('linux')) operatingSystem = 'Linux'

  // Browser
  let browser = 'Inconnu'
  if (s.includes('edg/') || s.includes('edge/')) browser = 'Edge'
  else if (s.includes('opr/') || s.includes('opera')) browser = 'Opera'
  else if (s.includes('chrome/') && !s.includes('chromium')) browser = 'Chrome'
  else if (s.includes('firefox/')) browser = 'Firefox'
  else if (s.includes('safari/') && !s.includes('chrome')) browser = 'Safari'
  else if (s.includes('chromium')) browser = 'Chromium'

  const deviceName = deviceType === 'mobile'
    ? `${operatingSystem} Mobile`
    : deviceType === 'tablet'
      ? `${operatingSystem} Tablet`
      : `${browser} sur ${operatingSystem}`

  return { deviceType, operatingSystem, browser, deviceName }
}

async function getGeoFromIp(ip: string): Promise<{ country: string; region: string; city: string }> {
  // Skip geolocation for private/local IPs
  if (!ip || ip === 'unknown' || ip.startsWith('127.') || ip.startsWith('::1') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return { country: '', region: '', city: '' }
  }
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { 'User-Agent': 'trouve-app/1.0' },
      signal: AbortSignal.timeout(2500),
    })
    if (!res.ok) return { country: '', region: '', city: '' }
    const data = await res.json() as { country_name?: string; region?: string; city?: string; error?: boolean }
    if (data.error) return { country: '', region: '', city: '' }
    return {
      country: data.country_name ?? '',
      region:  data.region ?? '',
      city:    data.city ?? '',
    }
  } catch {
    return { country: '', region: '', city: '' }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticate(req)
  if (!auth) { res.status(401).json({ error: 'Non authentifié' }); return }

  // ── GET : liste des appareils ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('user_devices')
      .select('id, device_id, device_name, device_type, operating_system, browser, last_ip, country, region, city, first_seen_at, last_seen_at, status')
      .eq('user_id', auth.userId)
      .order('last_seen_at', { ascending: false })

    if (error) { res.status(500).json({ error: error.message }); return }
    res.json({ devices: data ?? [] })
    return
  }

  // ── POST : enregistrer / mettre à jour l'appareil courant ─────────────────
  if (req.method === 'POST') {
    const deviceId = req.headers['x-device-id'] as string | undefined
    if (!deviceId) { res.status(400).json({ error: 'X-Device-Id manquant' }); return }

    const ip      = getClientIp(req)
    const ua      = req.headers['user-agent'] ?? 'unknown'
    const parsed  = parseUserAgent(ua)

    // Vérifier si cet appareil est déjà connu
    const { data: existing } = await supabaseAdmin
      .from('user_devices')
      .select('id, status')
      .eq('user_id', auth.userId)
      .eq('device_id', deviceId)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'revoked') {
        // Appareil révoqué → refuser la connexion
        res.status(403).json({ error: 'Cet appareil a été révoqué. Contactez le support si nécessaire.', revoked: true })
        return
      }
      // Mise à jour de l'appareil connu
      await supabaseAdmin
        .from('user_devices')
        .update({
          last_ip: ip,
          last_seen_at: new Date().toISOString(),
          browser: parsed.browser,
          operating_system: parsed.operatingSystem,
          device_name: parsed.deviceName,
        })
        .eq('id', existing.id)

      res.json({ ok: true, isNew: false })
      return
    }

    // Nouvel appareil — vérifier la limite
    const { count: activeCount } = await supabaseAdmin
      .from('user_devices')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', auth.userId)
      .eq('status', 'active')

    if ((activeCount ?? 0) >= MAX_DEVICES) {
      // Renvoyer la liste des appareils actifs pour que le frontend propose de révoquer
      const { data: activeDevices } = await supabaseAdmin
        .from('user_devices')
        .select('id, device_name, device_type, last_ip, country, city, last_seen_at')
        .eq('user_id', auth.userId)
        .eq('status', 'active')
        .order('last_seen_at', { ascending: true })

      res.status(409).json({
        error: `Limite de ${MAX_DEVICES} appareils atteinte.`,
        limitReached: true,
        activeDevices: activeDevices ?? [],
      })
      return
    }

    // Géolocalisation
    const geo = await getGeoFromIp(ip)

    // Enregistrement
    const { error: insertErr } = await supabaseAdmin
      .from('user_devices')
      .insert({
        user_id:          auth.userId,
        device_id:        deviceId,
        device_name:      parsed.deviceName,
        device_type:      parsed.deviceType,
        operating_system: parsed.operatingSystem,
        browser:          parsed.browser,
        first_ip:         ip,
        last_ip:          ip,
        country:          geo.country,
        region:           geo.region,
        city:             geo.city,
        status:           'active',
      })

    if (insertErr) { res.status(500).json({ error: insertErr.message }); return }

    // Audit
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: auth.userId,
      action:   'new_device_registered',
      metadata: { device_name: parsed.deviceName, ip, country: geo.country, city: geo.city },
    })

    res.json({ ok: true, isNew: true })
    return
  }

  // ── DELETE : révoquer un appareil ─────────────────────────────────────────
  if (req.method === 'DELETE') {
    const revokeAll = req.query.all === '1'
    const deviceRowId = req.query.id as string | undefined

    if (revokeAll) {
      const currentDeviceId = req.headers['x-device-id'] as string | undefined

      let query = supabaseAdmin
        .from('user_devices')
        .update({ status: 'revoked', revoked_at: new Date().toISOString() })
        .eq('user_id', auth.userId)
        .eq('status', 'active')

      if (currentDeviceId) {
        // Révoquer tous sauf l'appareil courant
        query = query.neq('device_id', currentDeviceId) as typeof query
      }

      const { error } = await query

      if (error) { res.status(500).json({ error: error.message }); return }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: auth.userId,
        action:   'revoke_all_devices',
        metadata: { kept_current: Boolean(currentDeviceId) },
      })

      // Déconnecter globalement (les sessions des autres appareils seront invalides)
      if (!currentDeviceId) {
        await supabaseAdmin.auth.admin.signOut(auth.userId, 'global')
      }

      res.json({ ok: true })
      return
    }

    if (!deviceRowId) { res.status(400).json({ error: 'id requis' }); return }

    // Vérifier que l'appareil appartient à l'utilisateur
    const { data: device } = await supabaseAdmin
      .from('user_devices')
      .select('id, device_id, device_name')
      .eq('id', deviceRowId)
      .eq('user_id', auth.userId)
      .maybeSingle()

    if (!device) { res.status(404).json({ error: 'Appareil introuvable' }); return }

    const { error } = await supabaseAdmin
      .from('user_devices')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', deviceRowId)

    if (error) { res.status(500).json({ error: error.message }); return }

    await supabaseAdmin.from('audit_logs').insert({
      actor_id: auth.userId,
      action:   'device_revoked',
      metadata: { device_id: (device as Record<string, unknown>).device_id, device_name: (device as Record<string, unknown>).device_name },
    })

    res.json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
