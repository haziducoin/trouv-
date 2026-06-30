// scripts/rne-ingest.ts — Ingestion bulk INPI/RNE → rne_companies_staging + rne_dirigeants_staging
// LOCAL UNIQUEMENT — jamais sur Vercel (fichier source plusieurs Go, traitement en heures).
// Usage : npx tsx scripts/rne-ingest.ts /chemin/vers/flux-rne.json
//
// ⚠️ mapRecord() est À ADAPTER : structure non vérifiée contre un vrai fichier/doc INPI
// (le flux RNE expose typiquement formality.content.personneMorale.*, profondément imbriqué
// et sujet à variations selon le type de personne morale/physique). Vérifier sur un extrait
// réel avant un import complet.

import { createReadStream } from 'fs'
import { chain } from 'stream-chain'
import { parser } from 'stream-json'
import { streamArray } from 'stream-json/streamers/StreamArray.js'
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

interface RneDirigeantRow {
  siren: string
  nom: string
  prenom: string
  date_naissance: string | null
  qualite: string | null
}

function mapRecord(rec: any): { company: RneCompanyRow; dirigeants: RneDirigeantRow[] } | null {
  const siren = rec?.siren ?? rec?.formality?.siren
  if (!siren) return null

  const content = rec?.formality?.content ?? {}
  const pm = content.personneMorale ?? content.personnePhysique ?? {}
  const adresse = pm?.adresseEntreprise?.adresse ?? {}

  const company: RneCompanyRow = {
    siren,
    denomination: pm?.identite?.entreprise?.denomination ?? null,
    forme_juridique: pm?.identite?.entreprise?.formeJuridique ?? null,
    code_naf: pm?.identite?.entreprise?.codeApe ?? null,
    date_immatriculation: pm?.identite?.entreprise?.dateImmat ?? null,
    code_postal: adresse?.codePostal ?? null,
    ville: adresse?.commune ?? null,
    raw_json: rec,
  }

  const dirigeants: RneDirigeantRow[] = ((pm?.composition?.pouvoirs ?? []) as any[])
    .map((p) => ({
      siren,
      nom: p?.individu?.descriptionPersonne?.nom ?? '',
      prenom: p?.individu?.descriptionPersonne?.prenoms?.[0] ?? '',
      date_naissance: p?.individu?.descriptionPersonne?.dateDeNaissance ?? null,
      qualite: p?.roleEntreprise ?? null,
    }))
    .filter((d) => d.nom && d.prenom)

  return { company, dirigeants }
}

async function flush(companies: RneCompanyRow[], dirigeants: RneDirigeantRow[]) {
  if (companies.length) {
    const { error } = await supabase.from('rne_companies_staging').upsert(companies, { onConflict: 'siren' })
    if (error) throw new Error(`upsert companies: ${error.message}`)
  }
  if (dirigeants.length) {
    const { error } = await supabase
      .from('rne_dirigeants_staging')
      .upsert(dirigeants, { onConflict: 'siren,nom,prenom,qualite' })
    if (error) throw new Error(`upsert dirigeants: ${error.message}`)
  }
}

async function main(filePath: string) {
  if (!filePath) throw new Error('Usage: rne-ingest.ts <fichier.json>')

  const pipeline = chain([createReadStream(filePath), parser(), streamArray()])
  let companies: RneCompanyRow[] = []
  let dirigeants: RneDirigeantRow[] = []
  let total = 0

  for await (const { value } of pipeline as AsyncIterable<{ value: unknown }>) {
    const mapped = mapRecord(value)
    if (!mapped) continue
    companies.push(mapped.company)
    dirigeants.push(...mapped.dirigeants)
    total++

    if (companies.length >= BATCH_SIZE) {
      await flush(companies, dirigeants)
      companies = []
      dirigeants = []
      console.log(`[rne-ingest] ${total} entreprises traitées`)
    }
  }
  await flush(companies, dirigeants)
  console.log(`[rne-ingest] terminé : ${total} entreprises`)
}

main(process.argv[2]).catch((e) => {
  console.error(e)
  process.exit(1)
})
