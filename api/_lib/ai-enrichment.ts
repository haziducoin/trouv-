// ─── Enrichissement — Registre officiel gouv.fr + Exa + Brave + Mistral ──────
//
// Sources actives (dans l'ordre de priorité) :
//   1. recherche-entreprises.api.gouv.fr — gratuit, sans clé, déterministe → court-circuite tout le reste
//   2. Exa API (EXA_API_KEY)            — index LinkedIn récent (2024-2026)
//   3. Brave Search API (BRAVE_API_KEY) — résultats web directs
//   4. Mistral AI (MISTRAL_API_KEY)     — extraction et web search
//
// ── Brancher un nouveau provider IA ──────────────────────────────────────────
// Ajouter une fonction dans ce fichier ou dans api/_lib/<nouveau-provider>.ts :
//
//   async function searchWithNewProvider(
//     name: string, city: string, signalCtx: string, input: UnlockEnrichInput
//   ): Promise<WebProfile | null>
//
// Puis l'ajouter dans le Promise.allSettled() de enrichOnUnlock() et dans enrichBackground().
// ─────────────────────────────────────────────────────────────────────────────

import { z }                                      from 'zod'
import { enrichWithMistral, extractWithMistral }  from './mistralEnrichment.js'

// ─── Schéma commun : sources ─────────────────────────────────────────────────

const SourceSchema = z.object({
  url:         z.string().nullable().default(null),
  source_type: z.string().default('other'),
  confidence:  z.number().default(50),
})

// ─── Mode 1 : Enrichissement background ──────────────────────────────────────

export const BackgroundEnrichmentSchema = z.object({
  company:               z.string().nullable().catch(null),
  job_title:             z.string().nullable().catch(null),
  school:                z.string().nullable().catch(null),
  industry:              z.string().nullable().catch(null),
  professional_location: z.string().nullable().catch(null),
  public_profile_url:    z.string().nullable().catch(null),
  company_website:       z.string().nullable().catch(null),
  confidence_score:      z.coerce.number().transform(v => Math.min(100, Math.max(1, Math.round(v || 50)))).catch(50),
  sources:               z.array(SourceSchema).catch([]),
})

export type BackgroundEnrichmentResult = z.infer<typeof BackgroundEnrichmentSchema>

export interface BackgroundEnrichInput {
  prenom:          string
  nom:             string
  ville:           string | null
  date_naissance?: string | null
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

// ─── WebProfile — type intermédiaire commun à toutes les sources ──────────────

interface WebProfile {
  company:               string | null
  job_title:             string | null
  industry:              string | null
  professional_location: string | null
  public_profile_url:    string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw    = fenced ? fenced[1].trim() : text.trim()
  const start  = raw.indexOf('{')
  const end    = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('Aucun JSON trouvé dans la réponse')
  return JSON.parse(raw.slice(start, end + 1))
}

function toProperCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

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
  if (input.email_masque && !/yahoo|gmail|hotmail|outlook|laposte|orange\.fr|free\.fr|sfr\.|wanadoo/i.test(input.email_masque)) {
    parts.push(`professional email domain: ${input.email_masque.split('@')[1]}`)
  }
  return parts.join(', ')
}

const STALE_DOMAINS = ['viadeo.com', 'viadeo.journaldunet.com', 'journaldunet.com/p/']
function isStaleSource(url: string): boolean {
  return STALE_DOMAINS.some(d => url.toLowerCase().includes(d))
}

// ─── 0. Registre officiel — recherche-entreprises.api.gouv.fr ────────────────
// Gratuit, sans clé, 7 req/s. Données structurées INSEE/INPI (dirigeants).
// Déterministe → prioritaire sur tout LLM. Si match ambigu → retourne null.

async function searchOfficialRegistry(
  prenom: string, nom: string, birthYear: string | null
): Promise<WebProfile | null> {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  try {
    const params = new URLSearchParams({
      nom_personne:     nom,
      prenoms_personne: prenom,
      type_personne:    'dirigeant',
      per_page:         '25',
    })
    if (birthYear) {
      params.set('date_naissance_personne_min', `${birthYear}-01-01`)
      params.set('date_naissance_personne_max', `${birthYear}-12-31`)
    }

    const resp = await fetch(`https://recherche-entreprises.api.gouv.fr/search?${params}`, {
      headers: { 'User-Agent': 'trouve.fr enrichment contact@trouve.fr' },
      signal:  AbortSignal.timeout(8000),
    })
    if (!resp.ok) {
      if (resp.status === 429) console.warn('[enrich] registre officiel : 429 rate limit (7 req/s max)')
      return null
    }

    const data = await resp.json() as {
      total_results: number
      results: Array<{
        nom_complet: string
        siege?: { libelle_commune?: string | null }
        dirigeants?: Array<{
          nom?: string; prenoms?: string; date_de_naissance?: string | null
          qualite?: string | null; type_dirigeant?: string
        }>
      }>
    }

    // Sans année de naissance : si on n'a pas vu TOUS les résultats → impossible de juger l'ambiguïté
    if (!birthYear && (data.total_results ?? 0) > (data.results?.length ?? 0)) return null

    const nomN    = norm(nom)
    const prenomN = norm(prenom)
    const matches: Array<{ company: string; ville: string | null; qualite: string | null }> = []

    for (const r of data.results ?? []) {
      for (const d of r.dirigeants ?? []) {
        if (d.type_dirigeant !== 'personne physique') continue
        if (norm(d.nom ?? '') !== nomN) continue
        if (!(d.prenoms ?? '').split(/\s+/).some(p => norm(p) === prenomN)) continue
        if (birthYear && d.date_de_naissance && !d.date_de_naissance.startsWith(birthYear)) continue
        matches.push({ company: r.nom_complet, ville: r.siege?.libelle_commune ?? null, qualite: d.qualite ?? null })
      }
    }
    if (!matches.length) return null

    const distinctCompanies = new Set(matches.map(m => m.company))
    if (distinctCompanies.size > 1 && !birthYear) return null
    // Avec date de naissance → identité confirmée ; plusieurs sociétés = multi-gérant légitime
    const best = matches.find(m => m.qualite) ?? matches[0]
    return { company: best.company, job_title: best.qualite, industry: null, professional_location: best.ville, public_profile_url: null }
  } catch (err) {
    console.error('[enrich] registre officiel error:', String(err).slice(0, 120))
    return null
  }
}

// ─── 1. Exa API — index LinkedIn récent ──────────────────────────────────────

async function extractProfileFromSnippets(
  name: string, city: string, snippets: string
): Promise<WebProfile | null> {
  const result = await extractWithMistral(snippets, name, city)
  if (result?.company || result?.job_title) return result as WebProfile
  return null
}

async function searchViaExa(
  name: string, city: string,
  opts: { birthYear?: string | null; address?: string | null; isPersonalEmail?: boolean } = {}
): Promise<WebProfile | null> {
  const key = process.env.EXA_API_KEY
  if (!key) return null

  const domains   = opts.isPersonalEmail ? undefined : ['linkedin.com']
  const queryParts = [name, city || 'France']
  if (opts.birthYear)        queryParts.push(opts.birthYear)
  if (opts.address)          queryParts.push(opts.address)
  if (!opts.isPersonalEmail) queryParts.push('LinkedIn profil professionnel')

  const resp = await fetch('https://api.exa.ai/search', {
    method:  'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query:      queryParts.join(' '),
      numResults: 5,
      ...(domains ? { includeDomains: domains } : {}),
      type:       'neural',
      contents:   { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
    }),
    signal: AbortSignal.timeout(12000),
  })
  if (!resp.ok) { console.error('[enrich] Exa', resp.status); return null }

  const data = await resp.json() as { results: Array<{ url: string; title: string; highlights?: string[] }> }
  if (!data.results?.length) return null

  const snippets = data.results.map(r =>
    `URL: ${r.url}\nTitle: ${r.title}\n${(r.highlights ?? []).join(' ')}`
  ).join('\n---\n')
  return extractProfileFromSnippets(name, city, snippets)
}

async function searchViaExaRegistries(
  name: string, city: string,
  opts: { birthYear?: string | null } = {}
): Promise<WebProfile | null> {
  const key = process.env.EXA_API_KEY
  if (!key) return null

  const query = [name, city || 'France', 'gérant dirigeant entrepreneur société', opts.birthYear ?? ''].filter(Boolean).join(' ')
  try {
    const resp = await fetch('https://api.exa.ai/search', {
      method:  'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        numResults:     5,
        includeDomains: ['societe.com', 'pappers.fr', 'infogreffe.fr', 'societe.ninja', 'verif.com', 'manageo.fr', 'kompass.com'],
        type:           'neural',
        contents:       { highlights: { numSentences: 3, highlightsPerUrl: 2 } },
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

// ─── 2. Brave Search API ─────────────────────────────────────────────────────

async function searchViaBrave(
  name: string, city: string,
  opts: { birthYear?: string | null; address?: string | null; emailPrefix?: string | null } = {}
): Promise<WebProfile | null> {
  const key = process.env.BRAVE_API_KEY
  if (!key) return null

  const queries: string[] = [`site:linkedin.com/in "${name}" ${city || 'France'}`]
  if (opts.address)   queries.push(`"${name}" "${opts.address}" ${city}`)
  if (opts.birthYear) queries.push(`"${name}" ${city} ${opts.birthYear} professionnel`)
  queries.push(`"${name}" ${city || ''} France société entreprise`)

  const results = await Promise.allSettled(
    queries.slice(0, 3).map(q =>
      fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3&country=fr&search_lang=fr`,
        { headers: { Accept: 'application/json', 'X-Subscription-Token': key }, signal: AbortSignal.timeout(10000) }
      ).catch(() => null)
    )
  )

  const snippets: string[] = []
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value?.ok) continue
    const data = await r.value.json() as { web?: { results?: Array<{ url: string; title: string; description: string }> } }
    for (const item of data.web?.results ?? []) {
      if (!isStaleSource(item.url))
        snippets.push(`URL: ${item.url}\nTitle: ${item.title}\nDescription: ${item.description}`)
    }
  }
  if (!snippets.length) return null
  return extractProfileFromSnippets(name, city, snippets.join('\n---\n'))
}

// ─── 3. Validation des résultats (règles dures uniquement) ───────────────────
// Les checks LLM ont été retirés avec la suppression de Groq.
// À ré-activer avec le nouveau provider : validateResult appellera le nouveau modèle
// pour croiser localisation et âge.

async function validateResult(input: UnlockEnrichInput, profile: WebProfile): Promise<boolean> {
  if (!profile.company && !profile.job_title) return false

  const isPersonalEmail = input.email_masque
    ? /yahoo|gmail|hotmail|outlook\.com|laposte|orange\.fr|free\.fr|sfr\.|wanadoo/i.test(input.email_masque)
    : false

  // Email personnel + grande institution = homonyme très probable
  if (isPersonalEmail && profile.company) {
    const bigCorp = /\b(bnp|société générale|crédit agricole|axa|lvmh|total energies|orange|sanofi|capgemini|accenture|kpmg|deloitte|ernst|pwc|mckinsey|natixis|amundi|rothschild|lazard|airbus|thales|safran|renault|stellantis|michelin|danone|l.oréal|loreal)\b/i.test(profile.company)
    if (bigCorp) return false
  }

  // Société = nom de personne ≠ NOM du contact → homonyme EI
  if (profile.company) {
    const isPersonNamePattern = /^[A-ZÀ-Ÿ]{2,}(\s+[A-ZÀ-Ÿ\-]{2,}){1,3}$/.test(profile.company.trim())
    if (isPersonNamePattern) {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
      const nomNorm     = norm(input.nom ?? '')
      const companyNorm = norm(profile.company)
      if (nomNorm.length >= 3 && !companyNorm.includes(nomNorm.slice(0, Math.min(4, nomNorm.length)))) return false
    }
  }

  // SIRET (indépendant) + salarié d'un grand groupe = incohérent
  if ((input.siret || input.siren) && profile.company) {
    const bigCorp = /\b(bnp|société générale|crédit agricole|axa|lvmh|total|orange|sanofi|capgemini|accenture|kpmg|deloitte|ey|pwc|mckinsey)\b/i.test(profile.company)
    if (bigCorp) return false
  }

  // TODO: ajouter la validation croisée LLM ici (localisation, âge, secteur)
  // avec le nouveau provider IA pour réduire les faux positifs

  return true
}

// ─── Mode 1 : Background (cron 3h) ───────────────────────────────────────────

export async function enrichBackground(input: BackgroundEnrichInput): Promise<BackgroundEnrichmentResult> {
  const birthYear = String(input.date_naissance ?? '').match(/\d{4}/)?.[0] ?? null

  // Registre officiel d'abord — déterministe, pas de quota
  const official = await searchOfficialRegistry(input.prenom, input.nom, birthYear)
  if (official?.company) {
    return BackgroundEnrichmentSchema.parse({
      company:    official.company,
      job_title:  official.job_title,
      school: null, industry: official.industry,
      professional_location: official.professional_location,
      public_profile_url: null, company_website: null,
      confidence_score: 95,
      sources: [{ url: 'https://recherche-entreprises.api.gouv.fr', source_type: 'official_registry', confidence: 95 }],
    })
  }

  // Mistral en fallback (recherche web + connaissance d'entraînement)
  const loc = input.ville ? toProperCase(input.ville) : null
  try {
    const result = await enrichWithMistral(
      `${toProperCase(input.prenom)} ${toProperCase(input.nom)}`,
      birthYear,
      loc,
      undefined,
      null
    )
    if (result.company || result.job_title) {
      return BackgroundEnrichmentSchema.parse({
        company:               result.company,
        job_title:             result.job_title,
        school:                null,
        industry:              result.industry,
        professional_location: result.professional_location,
        public_profile_url:    result.public_profile_url,
        company_website:       null,
        confidence_score:      50,
        sources:               result.sources.map(u => ({ url: u, source_type: 'web_search', confidence: 50 })),
      })
    }
  } catch (err) {
    console.error('[enrich/background] Mistral:', String(err).slice(0, 120))
  }

  return BackgroundEnrichmentSchema.parse({ confidence_score: 0, sources: [] })
}

// ─── Mode 2 : On-unlock (synchrone, appelé à l'unlock d'un contact) ──────────

export async function enrichOnUnlock(input: UnlockEnrichInput): Promise<UnlockEnrichmentResult> {
  const name  = `${toProperCase(input.prenom)} ${toProperCase(input.nom)}`
  const city  = input.ville ? toProperCase(input.ville) : ''
  const cp    = input.code_postal ?? ''
  const signalCtx      = buildSignalContext(input)
  const isPersonalEmail = input.email_masque
    ? /yahoo|gmail|hotmail|outlook\.com|laposte|orange\.fr|free\.fr|sfr\.|wanadoo/i.test(input.email_masque)
    : false

  let profile: WebProfile | null = null
  let fromOfficialRegistry = false

  const birthYear = String(input.date_naissance ?? '').match(/\d{4}/)?.[0] ?? null
  const locHint   = [city, cp].filter(Boolean).join(' ') || null

  // 0. Registre officiel — court-circuite tout le reste si match net
  const official = await searchOfficialRegistry(input.prenom, input.nom, birthYear)
  if (official?.company) {
    profile = official
    fromOfficialRegistry = true
    console.log('[enrich] ✓ Registre officiel (gouv.fr):', profile.company, profile.job_title)
  }

  const exaOpts   = { birthYear, address: input.adresse ?? null, isPersonalEmail }
  const braveOpts = { birthYear, address: input.adresse ?? null, emailPrefix: input.email_masque?.split('@')[0] ?? null }

  // 1-4. Sources en parallèle (sautées si le registre officiel a déjà répondu)
  const [exaResult, exaRegistriesResult, braveResult, mistralResult] = fromOfficialRegistry
    ? [null, null, null, null].map(v => ({ status: 'fulfilled' as const, value: v }))
    : await Promise.allSettled([
        searchViaExa(name, city, exaOpts),
        searchViaExaRegistries(name, city, { birthYear }),
        searchViaBrave(name, city, braveOpts),
        enrichWithMistral(name, birthYear, locHint, signalCtx, input.adresse ?? null),
      ])

  // Convertit le résultat Mistral en WebProfile
  const mistralProfile: WebProfile | null = (() => {
    if (mistralResult.status !== 'fulfilled') return null
    const g = mistralResult.value as typeof mistralResult extends { value: infer V } ? V : never
    if (!g?.company && !(g as any)?.job_title) return null
    return {
      company:               (g as any).company,
      job_title:             (g as any).job_title,
      industry:              (g as any).industry,
      professional_location: (g as any).professional_location,
      public_profile_url:    (g as any).public_profile_url ?? (g as any).sources?.[0] ?? null,
    }
  })()

  // Valide dans l'ordre de priorité : Exa LinkedIn > Exa Registres > Brave > Mistral
  for (const result of [exaResult, exaRegistriesResult, braveResult]) {
    if (profile) break
    if (result.status !== 'fulfilled' || !result.value?.company) continue
    const valid = await validateResult(input, result.value).catch(() => false)
    if (valid) { profile = result.value; console.log('[enrich] ✓ Exa/Brave:', profile.company) }
  }

  if (!profile && mistralProfile?.company) {
    const bigCorp = /\b(bnp|société générale|crédit agricole|axa|lvmh|total|orange|sanofi|capgemini|natixis|amundi)\b/i.test(mistralProfile.company ?? '')
    if (!(isPersonalEmail && bigCorp)) {
      profile = mistralProfile
      console.log('[enrich] ✓ Mistral:', profile.company, profile.job_title)
    }
  }

  const company  = profile?.company               ?? null
  const job_title = profile?.job_title             ?? null
  const industry  = profile?.industry              ?? null
  const location  = profile?.professional_location ?? null
  const linkedin  = profile?.public_profile_url    ?? null

  const score  = fromOfficialRegistry ? 95 : company && job_title ? 80 : company || job_title ? 55 : 30
  const status = fromOfficialRegistry ? 'confirmed' : company && job_title ? 'likely' : company || job_title ? 'uncertain' : 'insufficient_data'

  return UnlockEnrichmentSchema.parse({
    identity_confidence_score: score,
    status,
    professional_summary:   company && job_title ? `${job_title} chez ${company}` : '',
    disambiguation_signals: city ? [city] : [],
    conflicting_signals:    [],
    safe_enrichments: { company, job_title, school: null, industry, professional_location: location, public_profile_url: linkedin, company_website: null },
    sources:             [],
    user_facing_message: company && job_title
      ? `${job_title} chez ${company}`
      : company ? `Travaille chez ${company}` : '',
  })
}
