// ─── Enrichissement IA — Groq compound-beta + Mistral web search ─────────────
//
// GROQ_API_KEY    : Vercel env var — Groq compound-beta (LinkedIn, web search)
// MISTRAL_API_KEY : Vercel env var — Mistral web search + extraction snippets

import { groq }         from '@ai-sdk/groq'
import { generateText } from 'ai'
import { z }            from 'zod'
import { enrichWithMistral, extractWithMistral } from './mistralEnrichment.js'

// ─── Schéma commun : sources ─────────────────────────────────────────────────

const SourceSchema = z.object({
  url:         z.string().nullable().default(null),
  source_type: z.string().default('other'),
  confidence:  z.number().default(50),
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

const statusEnum = z.enum(['confirmed','likely','uncertain','possible_homonym','insufficient_data'])

export const UnlockEnrichmentSchema = z.object({
  identity_confidence_score: z.coerce.number().transform(v => Math.min(100, Math.max(0, Math.round(v)))).catch(50),
  status:                    statusEnum.catch('uncertain'),
  professional_summary:      z.string().nullable().catch('').transform(v => v ?? ''),
  disambiguation_signals:    z.array(z.string()).catch([]),
  conflicting_signals:       z.array(z.string()).catch([]),
  safe_enrichments: z.object({
    company:               z.string().nullable().catch(null),
    job_title:             z.string().nullable().catch(null),
    school:                z.string().nullable().catch(null),
    industry:              z.string().nullable().catch(null),
    professional_location: z.string().nullable().catch(null),
    public_profile_url:    z.string().nullable().catch(null),
    company_website:       z.string().nullable().catch(null),
  }).catch({ company: null, job_title: null, school: null, industry: null, professional_location: null, public_profile_url: null, company_website: null }),
  sources:             z.array(SourceSchema).catch([]),
  user_facing_message: z.string().nullable().catch('').transform(v => v ?? ''),
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

// ─── Modèle : Groq Compound-beta (web search intégré, version full) ──────────

const model = groq('compound-beta')

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

// ─── Mode 2 : Recherche web multi-source → extraction llama ─────────────────
//
// Priorité : 1. Exa API (EXA_API_KEY)  2. Brave Search API (BRAVE_API_KEY)
// Les deux APIs sont gratuites (1000-2000 req/mois) et indexent LinkedIn.
// Sans ces clés, compound-mini est utilisé mais reste non-déterministe.

interface WebProfile {
  company:               string | null
  job_title:             string | null
  industry:              string | null
  professional_location: string | null
  public_profile_url:    string | null
}

// extractProfileFromSnippets utilise Mistral directement (pas Groq) — voir ci-dessous

// Extrait le profil professionnel depuis des snippets de recherche bruts
async function extractProfileFromSnippets(
  name: string, city: string, snippets: string
): Promise<WebProfile | null> {
  // Utilise Mistral pour l'extraction — pas de rate limit Groq
  const result = await extractWithMistral(snippets, name, city)
  if (result?.company || result?.job_title) return result as WebProfile
  return null
}

// 1. Exa API — index LinkedIn récent (2024-2026), clé gratuite sur exa.ai
async function searchViaExa(
  name: string, city: string,
  opts: { birthYear?: string | null; address?: string | null; isPersonalEmail?: boolean } = {}
): Promise<WebProfile | null> {
  const key = process.env.EXA_API_KEY
  if (!key) return null

  // Pour email perso, éviter LinkedIn seul → chercher aussi annuaires et societe.com
  const domains = opts.isPersonalEmail
    ? undefined   // cherche partout (linkedin, societe.com, kompass, pagesjaunes…)
    : ['linkedin.com']

  const queryParts = [name, city || 'France']
  if (opts.birthYear)  queryParts.push(opts.birthYear)
  if (opts.address)    queryParts.push(opts.address)
  if (!opts.isPersonalEmail) queryParts.push('LinkedIn profil professionnel')

  const resp = await fetch('https://api.exa.ai/search', {
    method:  'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:          queryParts.join(' '),
      numResults:     5,
      ...(domains ? { includeDomains: domains } : {}),
      type:           'neural',
      contents:       { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
    }),
    signal: AbortSignal.timeout(12000),
  })
  if (!resp.ok) { console.error('[enrich] Exa', resp.status); return null }

  const data = await resp.json() as {
    results: Array<{ url: string; title: string; highlights?: string[] }>
  }
  if (!data.results?.length) return null

  const snippets = data.results.map(r =>
    `URL: ${r.url}\nTitle: ${r.title}\n${(r.highlights ?? []).join(' ')}`
  ).join('\n---\n')

  return extractProfileFromSnippets(name, city, snippets)
}

// 1b. Exa — registres d'entreprises français (societe.com, pappers, infogreffe…)
async function searchViaExaRegistries(
  name: string, city: string,
  opts: { birthYear?: string | null } = {}
): Promise<WebProfile | null> {
  const key = process.env.EXA_API_KEY
  if (!key) return null

  const query = [
    name, city || 'France',
    'gérant dirigeant entrepreneur société entreprise',
    opts.birthYear ?? '',
  ].filter(Boolean).join(' ')

  try {
    const resp = await fetch('https://api.exa.ai/search', {
      method:  'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults: 5,
        includeDomains: ['societe.com', 'pappers.fr', 'infogreffe.fr', 'societe.ninja', 'verif.com', 'manageo.fr', 'kompass.com'],
        type: 'neural',
        contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return null
    const data = await resp.json() as { results: Array<{ url: string; title: string; highlights?: string[] }> }
    if (!data.results?.length) return null
    const snippets = data.results.map(r =>
      `URL: ${r.url}\nTitle: ${r.title}\n${(r.highlights ?? []).join(' ')}`
    ).join('\n---\n')
    return extractProfileFromSnippets(name, city, snippets)
  } catch { return null }
}

// 2. Brave Search API — résultats web directs
async function searchViaBrave(
  name: string, city: string,
  opts: { birthYear?: string | null; address?: string | null; emailPrefix?: string | null } = {}
): Promise<WebProfile | null> {
  const key = process.env.BRAVE_API_KEY
  if (!key) return null

  // Requêtes adaptées aux signaux disponibles
  const queries: string[] = [
    `site:linkedin.com/in "${name}" ${city || 'France'}`,
  ]
  // Recherche par adresse précise (évite le homonym BNP qui n'est pas à cette adresse)
  if (opts.address) {
    queries.push(`"${name}" "${opts.address}" ${city}`)
  }
  // Recherche par année de naissance (discriminant fort)
  if (opts.birthYear) {
    queries.push(`"${name}" ${city} ${opts.birthYear} professionnel métier`)
  }
  // Recherche large
  queries.push(`"${name}" ${city || ''} France société entreprise poste`)

  const results = await Promise.allSettled(
    queries.slice(0, 3).map(q =>
      fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3&country=fr&search_lang=fr`,
        { headers: { 'Accept': 'application/json', 'X-Subscription-Token': key }, signal: AbortSignal.timeout(10000) }
      ).catch(() => null)
    )
  )

  const snippets: string[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value?.ok) continue
    const data = await r.value.json() as {
      web?: { results?: Array<{ url: string; title: string; description: string }> }
    }
    for (const item of data.web?.results ?? []) {
      snippets.push(`URL: ${item.url}\nTitle: ${item.title}\nDescription: ${item.description}`)
    }
  }

  if (!snippets.length) return null
  return extractProfileFromSnippets(name, city, snippets.join('\n---\n'))
}

// Viadeo est une source morte (archivée depuis 2016) — ses données sont forcément obsolètes
const STALE_DOMAINS = ['viadeo.com', 'viadeo.journaldunet.com', 'journaldunet.com/p/']
function isStaleSource(url: string): boolean {
  return STALE_DOMAINS.some(d => url.toLowerCase().includes(d))
}

// Génère les variantes de slug LinkedIn les plus probables pour un nom français
function generateLinkedInSlugs(prenom: string, nom: string, ville: string | null): string[] {
  const normalize = (s: string) => s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // supprimer accents
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const p = normalize(prenom)  // ex: "jean charles" → "jean-charles"
  const n = normalize(nom)     // ex: "doria"

  // La ville dans l'URL est généralement "paris" même pour Neuilly (zone Paris)
  const citySlug = ville
    ? normalize(ville).replace('neuilly-sur-seine', 'paris').split('-')[0]
    : 'paris'

  // Formats les plus courants sur LinkedIn France
  const slugs = [
    `${p}-${n}-${citySlug}`,   // jean-charles-doria-paris ← le plus courant
    `${p}-${n}`,                // jean-charles-doria
    `${p}${n}`,                 // jeancharles-doria ou jeancharles-doria
    `${p}-${n}-1`,              // jean-charles-doria-1
    `${p}-${n}-france`,         // jean-charles-doria-france
    `${p}-${n}-2`,              // jean-charles-doria-2
  ]

  // Pour les prénoms composés (ex: "jean-charles"), ajouter aussi la version sans tiret
  if (p.includes('-')) {
    const pFlat = p.replace(/-/g, '')  // "jeancharlesdoria"
    slugs.push(`${pFlat}-${n}`, `${pFlat}-${n}-${citySlug}`, `${pFlat}${n}`)
  }

  return slugs
}

// 3. compound-beta-mini — multi-round avec exclusion des sources obsolètes
async function searchViaCompoundMini(
  name: string, city: string, cp: string, activite: string | null
): Promise<WebProfile | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  const year = new Date().getFullYear()

  const callMini = async (prompt: string, tokens = 250): Promise<string> => {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:       'compound-beta-mini',
        messages:    [{ role: 'user', content: prompt }],
        temperature:  0,
        max_tokens:  tokens,
      }),
      signal: AbortSignal.timeout(12000),
    })
    if (!resp.ok) throw new Error(`${resp.status}`)
    const d = await resp.json() as { choices: { message: { content: string } }[] }
    return d.choices[0]?.message?.content ?? ''
  }

  const locSignal = [city, cp].filter(Boolean).join(' ')

  // ── Étape A : slug LinkedIn + lecture de l'Activity (publique même si Experience est privée)
  // L'Activity LinkedIn (likes, partages) révèle l'employeur même si Experience est cachée.
  const [prenom = '', ...rest] = name.split(' ')
  const nom = rest.join(' ')
  const slugCandidates = generateLinkedInSlugs(prenom, nom, city)

  for (const slug of slugCandidates.slice(0, 3)) {
    const url = `https://www.linkedin.com/in/${slug}`
    try {
      const profileRaw = await callMini(
        `Visit this LinkedIn profile: ${url}\n` +
        `This person is "${name}" from ${locSignal || 'France'}.\n\n` +
        `IMPORTANT: Their Experience section may be private. That is OK.\n` +
        `Look instead at their ACTIVITY FEED — the posts they liked, shared, or commented on.\n` +
        `If they consistently interact with posts from a specific COMPANY (same company appearing multiple times), that company is likely their employer.\n\n` +
        `Extract from this profile:\n` +
        `1. Current job from Experience (if visible)\n` +
        `2. If Experience is hidden: which company appears most often in their recent Activity?\n\n` +
        `Return JSON only: {"company":null,"job_title":null,"professional_location":null,"inference":"activity" or "experience"}`,
        250
      )
      console.log('[enrich] slug', slug, ':', profileRaw.slice(0, 150))
      try {
        const parsed = extractJson(profileRaw) as WebProfile & { inference?: string }
        if (parsed?.company) {
          console.log('[enrich] slug match:', slug, parsed.company, '(via', (parsed as any).inference, ')')
          return { ...parsed, public_profile_url: url }
        }
      } catch {}
    } catch {}
  }

  // ── Étape B : recherche web avec exclusion Viadeo + filtre années récentes
  try {
    const urlRaw = await callMini(
      `Search: site:linkedin.com/in "${name}" ${city || 'France'}\n` +
      `IMPORTANT: Ignore any result from Viadeo or journaldunet — those are dead networks.\n` +
      `Return ONLY a LinkedIn URL (https://www.linkedin.com/in/...). Nothing else.`,
      80
    )
    if (!isStaleSource(urlRaw)) {
      const m = urlRaw.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/([\w-]+)/i)
      if (m) {
        const linkedinUrl = `https://www.linkedin.com/in/${m[1]}`
        const profileRaw = await callMini(
          `Visit ${linkedinUrl}\nRead the CURRENT job (first Experience entry).\n` +
          `Return JSON: {"company":null,"job_title":null,"professional_location":null}`,
          200
        )
        const parsed = extractJson(profileRaw) as WebProfile
        if (parsed?.company) return { ...parsed, public_profile_url: linkedinUrl }
      }
    }
  } catch {}

  // ── Étape C : stratégie "exclusion dernier employeur connu"
  // 1. Trouver le dernier employeur connu (Viadeo, anciens profils, etc.)
  // 2. Chercher l'employeur ACTUEL en excluant les anciens
  try {
    const pastRaw = await callMini(
      `Search web for any professional profile of "${name}" from ${locSignal || 'France'}.\n` +
      `Even old profiles (Viadeo, archived pages) are OK for this step.\n` +
      `What company did "${name}" work for in France? Return the company name only (one line).`,
      60
    )
    const pastCompany = pastRaw.trim().replace(/["""*]/g, '').split('\n')[0].trim()
    console.log('[enrich] past company:', pastCompany)

    if (pastCompany && pastCompany.length > 2 && pastCompany.length < 80) {
      // Chercher l'employeur ACTUEL en excluant le passé
      const currentRaw = await callMini(
        `"${name}" works in marketing or communication in ${locSignal || 'France'}.\n` +
        `They used to work at "${pastCompany}" but that was years ago.\n` +
        `Search web: where does "${name}" work NOW in ${year - 1} or ${year}?\n` +
        `Exclude any result mentioning "${pastCompany}" or Viadeo.\n` +
        `Return JSON only: {"company":null,"job_title":null,"professional_location":null}`,
        180
      )
      const parsed = extractJson(currentRaw) as WebProfile
      if (parsed?.company && parsed.company !== pastCompany) {
        console.log('[enrich] stepC past-exclusion found:', parsed.company)
        return parsed
      }
    }
  } catch (e: any) {
    console.error('[enrich] stepC past-exclusion failed:', e?.message)
  }

  // ── Étape D : compound-beta FULL (plus puissant, dernier recours)
  try {
    const { text } = await generateText({
      model: groq('compound-beta'),
      prompt:
        `Find the CURRENT employer of "${name}" from ${locSignal || 'France'} as of ${year}.\n` +
        `Search web. Prioritize LinkedIn, company sites, recent press.\n` +
        `IGNORE Viadeo, journaldunet, results before ${year - 3}.\n` +
        `Return JSON only: {"company":null,"job_title":null,"professional_location":null,"public_profile_url":null}`,
    })
    const parsed = extractJson(text) as WebProfile
    if (parsed?.company) {
      console.log('[enrich] stepD compound-beta found:', parsed.company)
      return parsed
    }
  } catch (e: any) {
    console.error('[enrich] stepD compound-beta failed:', e?.message)
  }

  return null
}

// 4. llama training knowledge — pour les profils indexés avant déc 2024
async function searchViaLlamaKnowledge(
  name: string, city: string, linkedinSlug: string | null
): Promise<WebProfile | null> {
  const prompts: string[] = []

  if (linkedinSlug) {
    prompts.push(
      `Based on your training data (up to December 2024): ` +
      `The LinkedIn profile at linkedin.com/in/${linkedinSlug} belongs to a person named "${name}" from ${city || 'France'}. ` +
      `What company and job title are shown on that profile? ` +
      `Return JSON only: {"company":null,"job_title":null,"professional_location":null}`
    )
  }

  prompts.push(
    `Based on your training data (up to December 2024): ` +
    `What company does "${name}" from ${city || 'France'} work for? ` +
    `They are a professional in the Paris region. ` +
    `Return JSON only if you have specific knowledge: {"company":null,"job_title":null} ` +
    `If you don't know this specific person, return {"company":null,"job_title":null}`
  )

  for (const prompt of prompts) {
    try {
      const { text } = await generateText({
        model: groq('llama-3.3-70b-versatile'),
        prompt,
      })
      const parsed = extractJson(text) as WebProfile
      if (parsed?.company && parsed.company.toLowerCase() !== 'unknown' && parsed.company !== 'null') {
        console.log('[enrich] llama knowledge:', parsed.company, parsed.job_title)
        return parsed
      }
    } catch {}
  }
  return null
}

// Valide qu'un résultat web correspond bien à la bonne personne
async function validateResult(
  input: UnlockEnrichInput, profile: WebProfile
): Promise<boolean> {
  if (!profile.company && !profile.job_title) return false

  const isPersonalEmail = input.email_masque
    ? /yahoo|gmail|hotmail|outlook\.com|laposte|orange\.fr|free\.fr|sfr\.|wanadoo/i.test(input.email_masque)
    : false

  // Signal dur : email personnel + grande institution = homonyme très probable
  if (isPersonalEmail && profile.company) {
    const bigCorp = /\b(bnp|société générale|crédit agricole|axa|lvmh|total energies|orange|sanofi|capgemini|accenture|kpmg|deloitte|ernst|pwc|mckinsey|natixis|amundi|rothschild|lazard|airbus|thales|safran|renault|stellantis|michelin|danone|l.oréal|loreal)\b/i.test(profile.company)
    if (bigCorp) {
      console.log('[enrich] ✗ validation: personal email + big corp = likely homonym')
      return false
    }
  }

  // Signal dur : société = nom de personne ≠ NOM du contact → homonyme SIRET/EI
  if (profile.company) {
    const isPersonNamePattern = /^[A-ZÀ-Ÿ]{2,}(\s+[A-ZÀ-Ÿ\-]{2,}){1,3}$/.test(profile.company.trim())
    if (isPersonNamePattern) {
      const norm = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
      const nomNorm = norm(input.nom ?? '')
      const companyNorm = norm(profile.company)
      if (nomNorm.length >= 3 && !companyNorm.includes(nomNorm.slice(0, Math.min(4, nomNorm.length)))) {
        console.log('[enrich] ✗ validation: société-personne NOM incorrect', profile.company, '≠', input.nom)
        return false
      }
    }
  }

  // Signal dur : activité déclarée incompatible
  if (input.activite) {
    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt: `Person: "${input.prenom} ${input.nom}", declared activity: "${input.activite}".
Web result: company="${profile.company}", job="${profile.job_title}".
Is this job consistent with the declared activity? Reply ONLY "yes" or "no".`,
    })
    if (text.trim().toLowerCase().startsWith('no')) {
      console.log('[enrich] ✗ validation: sector mismatch')
      return false
    }
  }

  // Signal dur : SIRET (indépendant) + salarié d'un grand groupe
  if ((input.siret || input.siren) && profile.company) {
    const bigCorp = /\b(bnp|société générale|crédit agricole|axa|lvmh|total|orange|sanofi|capgemini|accenture|kpmg|deloitte|ey|pwc|mckinsey)\b/i.test(profile.company)
    if (bigCorp) {
      console.log('[enrich] ✗ validation: SIRET + big corp conflict')
      return false
    }
  }

  // Validation croisée par LLM (signaux mous : localisation, âge)
  const birthYear = String(input.date_naissance ?? '').match(/\d{4}/)?.[0] ?? ''
  const { text } = await generateText({
    model: groq('llama-3.3-70b-versatile'),
    prompt: `Verify if this web result matches the EXACT person in the database.

Person in database: "${input.prenom} ${input.nom}"
City/postal code: ${input.ville ?? '?'} ${input.code_postal ?? ''}
${birthYear ? `Born: ${birthYear}` : ''}
${input.entreprise ? `Known company in DB: ${input.entreprise}` : ''}
Email type: ${isPersonalEmail ? 'personal (Yahoo/Gmail)' : 'professional or unknown'}

Web result found: company="${profile.company}", job="${profile.job_title}", location="${profile.professional_location ?? 'unknown'}"

Rules:
- REJECT if the web result location is a different city or département than the DB city (e.g. Sannois 95 ≠ Neuilly-sur-Seine 92)
- REJECT if company matches a different person's name (e.g. "DUPONT JEAN" for someone named "DURANT")
- ACCEPT only if location is clearly consistent AND name/company plausibly matches
- Reply ONLY: "confirmed", "likely", or "uncertain"`,
  })

  const verdict = text.trim().toLowerCase()
  console.log('[enrich] validation:', verdict, '→', profile.company, '|', profile.job_title)
  return verdict.startsWith('confirmed') || verdict.startsWith('likely')
}

function toProperCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// Construit un contexte de signaux privés pour guider la recherche web
function buildSignalContext(input: UnlockEnrichInput): string {
  const parts: string[] = []
  if (input.date_naissance) {
    const year = String(input.date_naissance).match(/\d{4}/)?.[0]
    if (year) parts.push(`born ${year}`)
  }
  if (input.adresse)    parts.push(`address: ${input.adresse}`)
  if (input.siret)      parts.push(`SIRET: ${input.siret} (self-employed or business owner)`)
  if (input.entreprise) parts.push(`known company in DB: ${input.entreprise}`)
  if (input.activite)   parts.push(`declared activity: ${input.activite}`)
  if (input.code_naf)   parts.push(`NAF code: ${input.code_naf}`)
  if (input.email_masque && !input.email_masque.includes('yahoo') && !input.email_masque.includes('gmail') && !input.email_masque.includes('hotmail')) {
    parts.push(`professional email domain: ${input.email_masque.split('@')[1]}`)
  }
  return parts.join(', ')
}

// Recherche LinkedIn prioritaire via compound-beta-mini (lit le profil directement)
async function searchLinkedInDirect(
  name: string, city: string, cp: string, signalCtx: string, isPersonalEmail = false
): Promise<WebProfile | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null

  const callMini = async (prompt: string, tokens = 300): Promise<string> => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'compound-beta-mini', messages: [{ role: 'user', content: prompt }], temperature: 0, max_tokens: tokens }),
      signal: AbortSignal.timeout(12000),
    })
    if (!r.ok) throw new Error(`${r.status}`)
    const d = await r.json() as { choices: { message: { content: string } }[] }
    return d.choices[0]?.message?.content ?? ''
  }

  const emailHint = isPersonalEmail
    ? ' This person uses a personal email (Yahoo/Gmail), so they are NOT a senior executive at a major bank or CAC40 company. Avoid high-profile homonyms.'
    : ''

  // Étape 1 : trouver l'URL LinkedIn avec des signaux de désambiguïsation
  const locHint = [city, cp].filter(Boolean).join(' ')
  const ctxHint = signalCtx ? ` Context: ${signalCtx}.` : ''
  let linkedinUrl: string | null = null

  try {
    const urlRaw = await callMini(
      `Search LinkedIn for: "${name}" from ${locHint || 'France'}.${ctxHint}${emailHint}\n` +
      `Find the correct LinkedIn profile URL (not a homonym).\n` +
      `Return ONLY the full LinkedIn URL (https://www.linkedin.com/in/...). Nothing else.`,
      80
    )
    const m = urlRaw.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/([\w-]+)/i)
    if (m) linkedinUrl = `https://www.linkedin.com/in/${m[1]}`
    console.log('[enrich] LinkedIn URL found:', linkedinUrl)
  } catch {}

  // Étape 2 : lire le profil LinkedIn trouvé
  if (linkedinUrl) {
    try {
      const profileRaw = await callMini(
        `Visit this LinkedIn profile: ${linkedinUrl}\n` +
        `Person: "${name}" from ${locHint || 'France'}.${ctxHint}\n` +
        `Extract their CURRENT job (first Experience entry) and company.\n` +
        `If Experience is hidden, infer from their Activity feed (posts they liked/shared).\n` +
        `Return JSON only: {"company":null,"job_title":null,"industry":null,"professional_location":null,"public_profile_url":"${linkedinUrl}"}`,
        300
      )
      const parsed = extractJson(profileRaw) as WebProfile
      if (parsed?.company || parsed?.job_title) {
        console.log('[enrich] LinkedIn direct read:', parsed.company, parsed.job_title)
        return { ...parsed, public_profile_url: linkedinUrl }
      }
    } catch {}
  }

  // Étape 3 : si pas d'URL trouvée, essai par slugs générés localement
  const [prenom = '', ...rest] = name.split(' ')
  const nom = rest.join(' ')
  const slugCandidates = generateLinkedInSlugs(prenom, nom, city)
  for (const slug of slugCandidates.slice(0, 2)) {
    const url = `https://www.linkedin.com/in/${slug}`
    try {
      const raw = await callMini(
        `Visit ${url}. Is this "${name}" from ${locHint || 'France'}?${ctxHint}\n` +
        `If yes, extract current job. If wrong person, return {"company":null,"job_title":null}.\n` +
        `JSON only: {"company":null,"job_title":null,"professional_location":null,"public_profile_url":null}`,
        250
      )
      const parsed = extractJson(raw) as WebProfile
      if (parsed?.company) return { ...parsed, public_profile_url: url }
    } catch {}
  }

  return null
}

// Recherche web intelligente (fallback si pas de LinkedIn)
async function searchWebIntelligent(
  name: string, city: string, cp: string, signalCtx: string, input: UnlockEnrichInput
): Promise<WebProfile | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  const year = new Date().getFullYear()

  const callFull = async (prompt: string): Promise<string> => {
    try {
      const { text } = await generateText({ model: groq('compound-beta'), prompt })
      return text
    } catch (err) {
      const msg = String(err)
      if (msg.includes('429') || msg.includes('rate_limit')) console.error('[enrich] GROQ 429 — compound-beta tokens épuisés')
      else console.error('[enrich] compound-beta error:', msg.slice(0, 100))
      return ''
    }
  }

  const locHint = [city, cp].filter(Boolean).join(' ')

  // Si SIRET → chercher sur Societe.com/Infogreffe (données officielles = pas d'homonyme possible)
  if (input.siren || input.siret) {
    const id = input.siren ?? input.siret!.slice(0, 9)
    try {
      const raw = await callFull(
        `Search Societe.com or Infogreffe for SIREN "${id}" in France.\n` +
        `This belongs to "${name}" from ${locHint}.\n` +
        `Extract: company name, job title (gérant, directeur, etc.), activity.\n` +
        `Return JSON only: {"company":null,"job_title":null,"industry":null,"professional_location":null}`
      )
      const parsed = extractJson(raw) as WebProfile
      if (parsed?.company) { console.log('[enrich] SIREN lookup:', parsed.company); return parsed }
    } catch {}
  }

  // Recherche web large avec tous les signaux disponibles
  try {
    const raw = await callFull(
      `Find current professional information for "${name}" from ${locHint || 'France'} as of ${year}.\n` +
      `Context: ${signalCtx || 'no additional context'}.\n` +
      `Search these sources in order:\n` +
      `1. LinkedIn (exact name + city)\n` +
      `2. Pages Jaunes Pro (pagesjaunes.fr/pros)\n` +
      `3. Kompass annuaire (fr.kompass.com)\n` +
      `4. Societe.com / Infogreffe (if business)\n` +
      `5. Local press ${locHint} or regional news\n` +
      `6. Any professional or association membership\n` +
      `IMPORTANT: if multiple homonyms exist, match strictly on location "${locHint}".\n` +
      `Return JSON only: {"company":null,"job_title":null,"industry":null,"professional_location":null,"public_profile_url":null}`
    )
    const parsed = extractJson(raw) as WebProfile
    if (parsed?.company || parsed?.job_title) {
      console.log('[enrich] web intelligent:', parsed.company, parsed.job_title)
      return parsed
    }
  } catch {}

  return null
}

export async function enrichOnUnlock(input: UnlockEnrichInput): Promise<UnlockEnrichmentResult> {
  const name = `${toProperCase(input.prenom)} ${toProperCase(input.nom)}`
  const city = input.ville ? toProperCase(input.ville) : ''
  const cp   = input.code_postal ?? ''
  const signalCtx = buildSignalContext(input)
  const isPersonalEmail = input.email_masque
    ? /yahoo|gmail|hotmail|outlook\.com|laposte|orange\.fr|free\.fr|sfr\.|wanadoo/i.test(input.email_masque)
    : false

  let profile: WebProfile | null = null

  const birthYear = String(input.date_naissance ?? '').match(/\d{4}/)?.[0] ?? null
  const locHint   = [city, cp].filter(Boolean).join(' ') || null

  const exaOpts  = { birthYear, address: input.adresse ?? null, isPersonalEmail }
  const braveOpts = { birthYear, address: input.adresse ?? null, emailPrefix: input.email_masque?.split('@')[0] ?? null }

  // ── Toutes les sources en PARALLÈLE (max ~20s total)
  const [linkedinResult, exaResult, exaRegistriesResult, braveResult, mistralResult] = await Promise.allSettled([
    searchLinkedInDirect(name, city, cp, signalCtx, isPersonalEmail),
    searchViaExa(name, city, exaOpts),
    searchViaExaRegistries(name, city, { birthYear }),
    searchViaBrave(name, city, braveOpts),
    enrichWithMistral(name, birthYear, locHint, signalCtx, input.adresse ?? null),
  ])

  // Convertit le résultat Mistral en WebProfile
  const mistralProfile: WebProfile | null = (() => {
    if (mistralResult.status !== 'fulfilled') return null
    const g = mistralResult.value
    if (!g?.company && !g?.job_title) return null
    return {
      company:               g.company,
      job_title:             g.job_title,
      industry:              g.industry,
      professional_location: g.professional_location,
      public_profile_url:    g.public_profile_url ?? g.sources?.[0] ?? null,
    }
  })()

  // Valide dans l'ordre de priorité : LinkedIn > Exa > ExaRegistries > Brave > Mistral
  for (const result of [linkedinResult, exaResult, exaRegistriesResult, braveResult]) {
    if (profile) break
    if (result.status !== 'fulfilled' || !result.value?.company) continue
    const valid = await validateResult(input, result.value).catch(() => false)
    if (valid) { profile = result.value; console.log('[enrich] ✓ Groq/Exa/Brave:', profile.company) }
  }

  // Mistral web search — validation simplifiée (seule règle dure : email perso + grand groupe)
  if (!profile && mistralProfile?.company) {
    const bigCorp = /\b(bnp|société générale|crédit agricole|axa|lvmh|total|orange|sanofi|capgemini|natixis|amundi)\b/i.test(mistralProfile.company ?? '')
    const rejected = isPersonalEmail && bigCorp
    if (rejected) {
      console.log('[enrich] ✗ Mistral: homonyme rejeté (email perso + grand groupe):', mistralProfile.company)
    } else {
      profile = mistralProfile
      console.log('[enrich] ✓ Mistral web search:', profile.company, profile.job_title)
    }
  }

  // Dernier recours : web intelligent Groq compound-beta (si disponible)
  if (!profile) {
    const candidate = await searchWebIntelligent(name, city, cp, signalCtx, input).catch(() => null)
    if (candidate?.company || candidate?.job_title) {
      const valid = await validateResult(input, candidate).catch(() => false)
      if (valid) { profile = candidate; console.log('[enrich] ✓ Web intelligent:', profile?.company) }
    }
  }

  const company   = profile?.company               ?? null
  const job_title = profile?.job_title             ?? null
  const industry  = profile?.industry              ?? null
  const location  = profile?.professional_location ?? null
  const linkedin  = profile?.public_profile_url    ?? null

  const score  = company && job_title ? 80 : company || job_title ? 55 : 30
  const status = company && job_title ? 'likely' : company || job_title ? 'uncertain' : 'insufficient_data'

  return UnlockEnrichmentSchema.parse({
    identity_confidence_score: score,
    status,
    professional_summary: company && job_title ? `${job_title} chez ${company}` : '',
    disambiguation_signals: city ? [city] : [],
    conflicting_signals:    [],
    safe_enrichments: { company, job_title, school: null, industry, professional_location: location, public_profile_url: linkedin, company_website: null },
    sources:             [],
    user_facing_message: company && job_title
      ? `${job_title} chez ${company}`
      : company ? `Travaille chez ${company}` : '',
  })
}
