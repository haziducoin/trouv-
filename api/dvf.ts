import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createInflateRaw } from 'zlib'
import { Readable } from 'stream'
import { applyCors } from './_lib/cors.js'

// ── DPE (ADEME – nouveau dataset depuis 2025) ──────────────────────────────────
const ADEME_BASE = 'https://data.ademe.fr/data-fair/api/v1/datasets/meg-83tjwtg8dyz4vv7h1dqe/lines'

// ── DVF (CSV bruts data.gouv.fr – l'API Etalab dvf-api.data.gouv.fr est fermée) ─
//
// Colonnes du fichier texte (séparateur |) :
//  [0]  Identifiant de document   [7]  No disposition
//  [8]  Date mutation             [9]  Nature mutation
//  [10] Valeur fonciere           [11] No voie         [15] Voie
//  [16] Code postal               [17] Commune
//  [18] Code departement          [19] Code commune    [20] Prefixe de section
//  [21] Section                   [22] No plan
//  [25/27/29/31/33] Surface Carrez lot 1-5
//  [34] Nombre de lots            [36] Type local
//  [38] Surface reelle bati       [39] Nombre pieces principales
//  [42] Surface terrain
//
// L'en-tête ZIP local est identique pour tous les millésimes (nom fichier 25 chars
// + extra 28 bytes = 30 + 53 = 83 octets) → on commence directement le flux DEFLATE
// à l'offset 83 pour éviter le parsing du format ZIP.
const DVF_ZIP_OFFSET = 83
const DVF_YEARS: string[] = [
  'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20260405-002321/valeursfoncieres-2025.txt.zip',
  'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20260405-002306/valeursfoncieres-2024.txt.zip',
  'https://static.data.gouv.fr/resources/demandes-de-valeurs-foncieres/20260405-002251/valeursfoncieres-2023.txt.zip',
]

interface MutationRow {
  id_mutation:         string
  date_mutation:       string   // ISO YYYY-MM-DD
  nature_mutation:     string
  valeur_fonciere:     number
  adresse:             string
  code_postal:         string
  nom_commune:         string
  type_local:          string | null
  surface_reelle_bati: number | null
  surface_carrez:      number | null
  surface_terrain:     number | null
  nombre_pieces:       number | null
  nombre_lots:         number | null
  id_parcelle:         string
}

function parseFrDate(s: string): string {
  const p = s.split('/')
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` : s
}

function parseFrNum(s: string): number {
  return parseFloat((s ?? '').replace(/\s/g, '').replace(',', '.')) || 0
}

/** Streame et parse un millésime DVF en filtrant sur la parcelle demandée. */
async function streamDvfYear(
  url:         string,
  codeDept:    string,
  codeCommune: string,
  section?:    string,
  numeroPad?:  string,
): Promise<MutationRow[]> {
  const resp = await fetch(url, {
    headers: { Range: `bytes=${DVF_ZIP_OFFSET}-` },
    signal: AbortSignal.timeout(50_000),
  })
  if (resp.status !== 206 || !resp.body) return []

  const results = new Map<string, MutationRow>()
  let buf = ''
  let isHeader = true

  const nodeStream = Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0])
  const inflater   = createInflateRaw()
  nodeStream.pipe(inflater)

  await new Promise<void>((resolve, reject) => {
    inflater.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trimEnd()
        buf = buf.slice(nl + 1)

        if (isHeader) { isHeader = false; continue }
        const c = line.split('|')
        if (c.length < 43) continue

        if (c[18] !== codeDept)                             continue
        if (c[19].padStart(3, '0') !== codeCommune)        continue
        if (section   && c[21].toUpperCase() !== section)  continue
        if (numeroPad && c[22].padStart(4, '0') !== numeroPad) continue

        const mutId = `${c[0]}_${c[7]}`
        if (results.has(mutId)) continue

        const surfCarrez = [25, 27, 29, 31, 33]
          .map(i => parseFrNum(c[i] ?? ''))
          .reduce((a, b) => a + b, 0)

        results.set(mutId, {
          id_mutation:         mutId,
          date_mutation:       parseFrDate(c[8]),
          nature_mutation:     c[9],
          valeur_fonciere:     parseFrNum(c[10]),
          adresse:             [c[11], c[15]].filter(Boolean).join(' ').trim(),
          code_postal:         c[16],
          nom_commune:         c[17],
          type_local:          c[36] || null,
          surface_reelle_bati: parseFrNum(c[38]) || null,
          surface_carrez:      surfCarrez > 0 ? Math.round(surfCarrez * 10) / 10 : null,
          surface_terrain:     parseFrNum(c[42]) || null,
          nombre_pieces:       parseInt(c[39]) || null,
          nombre_lots:         parseInt(c[34]) || null,
          id_parcelle:         `${codeDept}${codeCommune}${c[20]}${c[21]}${c[22].padStart(4,'0')}`,
        })
      }
    })
    inflater.on('end',   resolve)
    inflater.on('error', reject)
    nodeStream.on('error', reject)
  })

  return [...results.values()]
}

async function fetchDvf(codeInsee: string, section?: string, numero?: string): Promise<MutationRow[]> {
  const codeDept    = codeInsee.slice(0, 2)
  const codeCommune = codeInsee.slice(2).padStart(3, '0')
  const numeroPad   = numero ? numero.padStart(4, '0') : undefined
  const sectionUp   = section?.toUpperCase()

  const perYear = await Promise.allSettled(
    DVF_YEARS.map(url => streamDvfYear(url, codeDept, codeCommune, sectionUp, numeroPad)),
  )

  const all: MutationRow[] = perYear
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<MutationRow[]>).value)

  return all
    .filter(m => m.valeur_fonciere > 0)
    .sort((a, b) => b.date_mutation.localeCompare(a.date_mutation))
    .slice(0, 20)
}

// ── DPE ───────────────────────────────────────────────────────────────────────

async function fetchDpe(cp: string, adresse?: string) {
  if (!cp) return []

  // code_postal_ban via qs (exact), nom de rue via q (full-text, insensible à la casse)
  const voie = adresse ? adresse.replace(/^\d+\s+/, '').replace(/\s+\d{5}.*$/, '').trim() : ''

  const params = new URLSearchParams({
    qs:   `code_postal_ban:"${cp}"`,
    ...(voie.length > 3 ? { q: voie } : {}),
    size: '10',
    select: [
      'numero_dpe', 'date_etablissement_dpe', 'etiquette_dpe', 'etiquette_ges',
      'conso_5_usages_ef', 'emission_ges_5_usages', 'surface_habitable_immeuble',
      'adresse_ban', 'type_batiment', 'periode_construction',
      'type_energie_principale_chauffage', 'qualite_isolation_enveloppe',
    ].join(','),
    sort: '-date_etablissement_dpe',
  })

  const res = await fetch(`${ADEME_BASE}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return []

  const raw = await res.json() as { results?: Array<Record<string, unknown>> }

  return (raw.results ?? []).map(d => ({
    id:                   String(d['numero_dpe']                         ?? ''),
    date:                 String(d['date_etablissement_dpe']             ?? ''),
    etiquette_dpe:        String(d['etiquette_dpe']                      ?? ''),
    etiquette_ges:        String(d['etiquette_ges']                      ?? ''),
    conso_energie:        d['conso_5_usages_ef']          != null ? Number(d['conso_5_usages_ef'])          : null,
    emission_ges:         d['emission_ges_5_usages']       != null ? Number(d['emission_ges_5_usages'])       : null,
    surface:              d['surface_habitable_immeuble']  != null ? Number(d['surface_habitable_immeuble'])  : null,
    adresse:              String(d['adresse_ban']                        ?? ''),
    type_batiment:        d['type_batiment']               ? String(d['type_batiment'])               : null,
    periode_construction: d['periode_construction']        ? String(d['periode_construction'])        : null,
    chauffage:            d['type_energie_principale_chauffage'] ? String(d['type_energie_principale_chauffage']) : null,
    isolation:            d['qualite_isolation_enveloppe'] ? String(d['qualite_isolation_enveloppe']) : null,
  }))
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { code_insee, section, numero, adresse, cp } = req.query as Record<string, string>
  if (!code_insee) return res.status(400).json({ error: 'code_insee requis' })

  try {
    const cpForDpe = cp || code_insee.slice(0, 5)

    const [mutations, dpe] = await Promise.allSettled([
      fetchDvf(code_insee, section, numero),
      fetchDpe(cpForDpe, adresse),
    ])

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.json({
      mutations: mutations.status === 'fulfilled' ? mutations.value : [],
      dpe:       dpe.status       === 'fulfilled' ? dpe.value       : [],
    })
  } catch (err) {
    console.error('[dvf+dpe] error:', err)
    return res.status(500).json({ error: 'Erreur récupération données', mutations: [], dpe: [] })
  }
}
