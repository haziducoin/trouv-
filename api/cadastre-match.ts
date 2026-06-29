import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, supabaseAdmin } from './_lib/supabase.js'
import { applyCors } from './_lib/cors.js'

const BAN_REVERSE = 'https://api-adresse.data.gouv.fr/reverse/'

interface ParcelInfo {
  id:         string
  commune:    string
  section:    string
  numero:     string
  adresse?:   string
  codeInsee?: string
  lng:        number
  lat:        number
}

interface BanResult {
  housenumber?: string
  street?:      string
  postcode?:    string
  city?:        string
  label?:       string
  score?:       number
}

async function banReverse(lng: number, lat: number): Promise<BanResult | null> {
  try {
    const res = await fetch(`${BAN_REVERSE}?lon=${lng}&lat=${lat}`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const data = await res.json() as { features?: Array<{ properties: BanResult }> }
    return data.features?.[0]?.properties ?? null
  } catch {
    return null
  }
}

function normalizeContacts(rows: Array<Record<string, unknown>>) {
  return rows.map(r => ({
    id:             r.id,
    nom:            r.nom,
    prenom:         r.prenom,
    adresse:        r.adresse,
    ville:          r.ville,
    code_postal:    r.code_postal,
    adresse_ban:    r.adresse_ban   ?? null,
    cp_ban:         r.cp_ban        ?? null,
    phone_masked:   r.phone_masked  ?? null,
    email_masked:   r.email_masked  ?? null,
    phone_unlocked: r.phone_unlocked ?? false,
    phone_value:    r.phone_value   ?? null,
    match_type:     r.match_type    ?? null,
  }))
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await authenticate(req)
  if (!auth) return res.status(401).json({ error: 'Authentification requise' })

  const { parcel } = req.body as { parcel: ParcelInfo }
  if (!parcel) return res.status(400).json({ error: 'parcel requis' })

  try {
    // ── Étape 1 : géocodage inverse BAN ──────────────────────────────────────
    const ban = await banReverse(parcel.lng, parcel.lat)

    const cp      = ban?.postcode    ?? parcel.codeInsee?.slice(0, 5) ?? ''
    const ville   = ban?.city        ?? parcel.commune   ?? ''
    const adresse = [ban?.housenumber, ban?.street].filter(Boolean).join(' ')

    console.info('[cadastre-match] BAN reverse:', { adresse, cp, ville, score: ban?.score })

    let contacts: ReturnType<typeof normalizeContacts> = []
    let matchStrategy = 'none'

    // ── Stratégie 1 : matching EXACT sur colonnes adresse_ban normalisées ────
    // Utilise idx_contacts_ban_cp_adresse → <10ms quand l'index est prêt
    if (adresse && cp) {
      const { data, error } = await supabaseAdmin.rpc('search_contacts_by_ban', {
        p_adresse_ban: adresse,
        p_cp_ban:      cp,
        p_limit:       30,
      })
      if (error) {
        console.warn('[cadastre-match] search_contacts_by_ban error:', error.message)
      } else if (data && (data as unknown[]).length > 0) {
        contacts = normalizeContacts(data as Array<Record<string, unknown>>)
        matchStrategy = 'ban_exact'
      }
    }

    // ── Stratégie 2 : contains sur le champ adresse original ─────────────────
    // Actif tant que la normalisation batch n'est pas terminée
    if (contacts.length === 0 && adresse && cp) {
      const { data, error } = await supabaseAdmin.rpc('search_contacts_secure', {
        p_nom:          null,
        p_prenom:       null,
        p_identity:     null,
        p_adresse:      adresse,
        p_cp:           cp,
        p_ville:        ville || null,
        p_mode:         'contains',
        p_tel:          null,
        p_annee_naissance: null,
        p_limit:        30,
        p_offset:       0,
      })
      if (!error && data && (data as unknown[]).length > 0) {
        contacts = normalizeContacts(data as Array<Record<string, unknown>>)
        matchStrategy = 'contains_original'
      }
    }

    // ── Stratégie 3 : fallback INSEE ──────────────────────────────────────────
    if (contacts.length === 0 && cp) {
      const { data } = await supabaseAdmin.rpc('search_contacts_for_cadastre', {
        p_code_insee: parcel.codeInsee ?? '',
        p_section:    parcel.section,
        p_numero:     parcel.numero,
        p_dept:       cp.slice(0, 2),
        p_limit:      20,
      })
      if (data && (data as unknown[]).length > 0) {
        contacts = normalizeContacts(data as Array<Record<string, unknown>>)
        matchStrategy = 'insee_fallback'
      }
    }

    console.info(`[cadastre-match] strategy=${matchStrategy} results=${contacts.length}`)

    return res.json({
      contacts,
      match_strategy: matchStrategy,
      ban_address: ban
        ? { adresse, cp, ville, score: ban.score }
        : null,
    })

  } catch (err) {
    console.error('[cadastre-match] error:', err)
    return res.status(500).json({ error: 'Erreur de correspondance', contacts: [] })
  }
}
