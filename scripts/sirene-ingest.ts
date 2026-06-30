// scripts/sirene-ingest.ts — Ingestion bulk INSEE Sirene → rne_companies_staging
// LOCAL UNIQUEMENT — jamais sur Vercel (fichier ~3-4Go décompressé, traitement en heures).
//
// Source GRATUITE, SANS INSCRIPTION (contrairement au flux INPI/RNE qui nécessite un
// accès SFTP) : StockEtablissement_utf8.csv, mis à jour mensuellement.
// Téléchargement : https://www.data.gouv.fr/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret
//
// Schéma colonnes vérifié (stable, documenté INSEE) : siren, nic, siret,
// statutDiffusionEtablissement, dateCreationEtablissement, ..., codePostalEtablissement,
// libelleCommuneEtablissement, ..., dateDebut, etatAdministratifEtablissement,
// denominationUsuelleEtablissement, activitePrincipaleEtablissement, ...
//
// ⚠️ Ne contient PAS les dirigeants (exclus du Sirene par design — voir api-rne.inpi.fr /
// recherche-entreprises.api.gouv.fr déjà intégré dans api/_lib/ai-enrichment.ts pour ça).
// La dénomination officielle complète vit dans StockUniteLegale_utf8.csv (clé siren) —
// non jointe ici par souci de simplicité v1 ; libelleCommune sert de repli.
//
// Usage : npx tsx scripts/sirene-ingest.ts /chemin/vers/StockEtablissement_utf8.csv

import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.TROUVE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

const BATCH_SIZE = 10_000

interface RneCompanyRow {
  siren: string
  denomination: string | null
  forme_juridique: string | null
  code_naf: string | null
  date_immatriculation: string | null
  code_postal: string | null
  ville: string | null
  raw_json: unknown
}

function parseCsvLine(line: string): string[] {
  // CSV Sirene : séparateur virgule, champs entre guillemets si contiennent une virgule
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') inQuotes = !inQuotes
    else if (c === ',' && !inQuotes) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

async function flush(rows: RneCompanyRow[]) {
  if (!rows.length) return
  const { error } = await supabase.from('rne_companies_staging').upsert(rows, { onConflict: 'siren' })
  if (error) throw new Error(`upsert: ${error.message}`)
}

async function main(filePath: string) {
  if (!filePath) throw new Error('Usage: sirene-ingest.ts <StockEtablissement_utf8.csv>')

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
  let header: string[] | null = null
  let idx: Record<string, number> = {}
  let batch: RneCompanyRow[] = []
  let total = 0

  for await (const line of rl) {
    if (!header) {
      header = parseCsvLine(line)
      header.forEach((h, i) => { idx[h] = i })
      continue
    }
    const cols = parseCsvLine(line)

    // Ne garder que les sièges actifs (1 ligne par siren suffit pour le matching)
    if (cols[idx.etablissementSiege] !== 'true' && cols[idx.etablissementSiege] !== '1') continue
    if (cols[idx.etatAdministratifEtablissement] !== 'A') continue

    const row: RneCompanyRow = {
      siren: cols[idx.siren],
      denomination: cols[idx.denominationUsuelleEtablissement] || null,
      forme_juridique: null, // vit dans StockUniteLegale, pas StockEtablissement
      code_naf: cols[idx.activitePrincipaleEtablissement] || null,
      date_immatriculation: cols[idx.dateCreationEtablissement] || null,
      code_postal: cols[idx.codePostalEtablissement] || null,
      ville: cols[idx.libelleCommuneEtablissement] || null,
      raw_json: null,
    }
    if (!row.siren) continue

    batch.push(row)
    total++

    if (batch.length >= BATCH_SIZE) {
      await flush(batch)
      batch = []
      console.log(`[sirene-ingest] ${total} établissements traités`)
    }
  }
  await flush(batch)
  console.log(`[sirene-ingest] terminé : ${total} établissements actifs (sièges)`)
}

main(process.argv[2]).catch((e) => {
  console.error(e)
  process.exit(1)
})
