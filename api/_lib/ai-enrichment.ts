// ─── Enrichissement IA — Groq Compound-mini ──────────────────────────────────
//
// GROQ_API_KEY requis (Vercel env var — jamais exposé côté front)
//
// Groq Compound-mini = LLM + recherche web intégrée en 1 seul appel API
// Free tier : 250 appels/jour (~7 500/mois) — gratuit sans CB
//
// compound-mini ne supporte pas json_schema → generateText + parse Zod

import { groq }         from '@ai-sdk/groq'
import { generateText } from 'ai'
import { z }            from 'zod'

// ─── Schéma commun : sources ─────────────────────────────────────────────────

const SourceSchema = z.object({
  url:         z.string().nullable(),
  source_type: z.enum(['company_site','professional_directory','public_profile','school_site','other']),
  confidence:  z.number().int().min(1).max(100),
})

// ─── Mode 1 : Enrichissement background ──────────────────────────────────────

export const BackgroundEnrichmentSchema = z.object({
  company:               z.string().nullable(),
  job_title:             z.string().nullable(),
  school:                z.string().nullable(),
  industry:              z.string().nullable(),
  professional_location: z.string().nullable(),
  public_profile_url:    z.string().nullable(),
  company_website:       z.string().nullable(),
  confidence_score:      z.number().int().min(1).max(100),
  sources:               z.array(SourceSchema),
})

export type BackgroundEnrichmentResult = z.infer<typeof BackgroundEnrichmentSchema>

export interface BackgroundEnrichInput {
  prenom: string
  nom:    string
  ville:  string | null
}

// ─── Mode 2 : Enrichissement on-unlock ───────────────────────────────────────

export const UnlockEnrichmentSchema = z.object({
  identity_confidence_score: z.number().int().min(0).max(100),
  status:                    z.enum(['confirmed','likely','uncertain','possible_homonym','insufficient_data']),
  professional_summary:      z.string(),
  disambiguation_signals:    z.array(z.string()),
  conflicting_signals:       z.array(z.string()),
  safe_enrichments: z.object({
    company:               z.string().nullable(),
    job_title:             z.string().nullable(),
    school:                z.string().nullable(),
    industry:              z.string().nullable(),
    professional_location: z.string().nullable(),
    public_profile_url:    z.string().nullable(),
    company_website:       z.string().nullable(),
  }),
  sources:             z.array(SourceSchema),
  user_facing_message: z.string(),
})

export type UnlockEnrichmentResult = z.infer<typeof UnlockEnrichmentSchema>

export interface UnlockEnrichInput {
  prenom:          string
  nom:             string
  // Localisation
  ville?:          string | null
  adresse?:        string | null
  code_postal?:    string | null
  // Identité (signaux privés Supabase — ne jamais exposer dans la réponse)
  date_naissance?: string | null
  lieu_naissance?: string | null
  sexe?:           string | null
  // Entreprise
  entreprise?:     string | null
  siret?:          string | null
  siren?:          string | null
  code_naf?:       string | null
  activite?:       string | null
  site_web?:       string | null
  pseudo?:         string | null
  // Contacts masqués (pour contexte uniquement)
  email_masque?:   string | null
  tel_masque?:     string | null
  // Données brutes supplémentaires du champ raw_data
  raw_extra?:      string | null
}

// ─── Helper : extrait le JSON de la réponse texte ────────────────────────────

function extractJson(text: string): unknown {
  // Cherche un bloc ```json ... ``` ou du JSON brut
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1].trim() : text.trim()
  // Extrait le premier objet JSON valide
  const start = raw.indexOf('{')
  const end   = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Aucun JSON trouvé dans la réponse')
  return JSON.parse(raw.slice(start, end + 1))
}

// ─── Modèle : Groq Compound-mini ─────────────────────────────────────────────

const model = groq('groq/compound-mini')

// ─── Mode 1 ───────────────────────────────────────────────────────────────────

export async function enrichBackground(input: BackgroundEnrichInput): Promise<BackgroundEnrichmentResult> {
  const loc = input.ville ? ` situé à ${input.ville}` : ''

  const { text } = await generateText({
    model,
    prompt: `Tu es un agent d'enrichissement B2B. Recherche des informations professionnelles publiques sur : ${input.prenom} ${input.nom}${loc}. Effectue une recherche web et visite les pages pertinentes (LinkedIn, Societe.com, annuaires professionnels). Ne retourne que des données B2B safe. N'inclus aucune donnée privée.

Retourne UNIQUEMENT ce JSON valide (sans texte autour) :
{
  "company": "nom entreprise ou null",
  "job_title": "poste ou null",
  "school": "école ou null",
  "industry": "secteur ou null",
  "professional_location": "ville pro ou null",
  "public_profile_url": "url linkedin ou null",
  "company_website": "site entreprise ou null",
  "confidence_score": 75,
  "sources": [{"url": "https://...", "source_type": "public_profile", "confidence": 80}]
}`,
  })

  const parsed = extractJson(text)
  return BackgroundEnrichmentSchema.parse(parsed)
}

// ─── Mode 2 ───────────────────────────────────────────────────────────────────

export async function enrichOnUnlock(input: UnlockEnrichInput): Promise<UnlockEnrichmentResult> {
  const signals = [
    `Nom complet : ${input.prenom} ${input.nom}`,
    // Localisation
    input.ville        && `Ville : ${input.ville}`,
    input.code_postal  && `Code postal : ${input.code_postal}`,
    input.adresse      && `Adresse partielle : ${input.adresse}`,
    // Identité — signaux forts pour lever les homonymes
    input.date_naissance  && `Date de naissance : ${input.date_naissance}`,
    input.lieu_naissance  && `Lieu de naissance : ${input.lieu_naissance}`,
    input.sexe            && `Sexe : ${input.sexe}`,
    // Entreprise
    input.entreprise && `Entreprise : ${input.entreprise}`,
    input.siret      && `SIRET : ${input.siret}`,
    input.siren      && `SIREN : ${input.siren}`,
    input.code_naf   && `Code NAF : ${input.code_naf}`,
    input.activite   && `Activité : ${input.activite}`,
    input.site_web   && `Site web connu : ${input.site_web}`,
    input.pseudo     && `Pseudo/alias : ${input.pseudo}`,
    // Contacts masqués (contexte uniquement)
    input.email_masque && `Email (masqué) : ${input.email_masque}`,
    input.tel_masque   && `Téléphone (masqué) : ${input.tel_masque}`,
    // Données brutes supplémentaires
    input.raw_extra && `Données complémentaires : ${input.raw_extra}`,
  ].filter(Boolean).join('\n- ')

  const { text } = await generateText({
    model,
    prompt: `Tu es un agent d'enrichissement et de désambiguïsation B2B. Avant de révéler un contact privé, confirme l'identité professionnelle de cette personne.

Signaux disponibles :
- ${signals}

Effectue une recherche web ciblée et visite les pages trouvées (LinkedIn, Societe.com, Infogreffe, annuaires professionnels). Si plusieurs homonymes existent, indique "possible_homonym" et liste les différences. Utilise uniquement des sources publiques. N'inclus jamais de données privées.

Retourne UNIQUEMENT ce JSON valide (sans texte autour) :
{
  "identity_confidence_score": 75,
  "status": "likely",
  "professional_summary": "Résumé 2-3 phrases",
  "disambiguation_signals": ["signal 1", "signal 2"],
  "conflicting_signals": [],
  "safe_enrichments": {
    "company": "entreprise ou null",
    "job_title": "poste ou null",
    "school": null,
    "industry": "secteur ou null",
    "professional_location": "ville ou null",
    "public_profile_url": "url ou null",
    "company_website": "site ou null"
  },
  "sources": [{"url": "https://...", "source_type": "public_profile", "confidence": 80}],
  "user_facing_message": "Phrase courte en français pour l'utilisateur"
}`,
  })

  const parsed = extractJson(text)
  return UnlockEnrichmentSchema.parse(parsed)
}
