import { GoogleGenAI } from '@google/genai'

export interface GeminiEnrichResult {
  summary: string | null          // texte brut retourné par Gemini
  company: string | null          // entreprise extraite
  job_title: string | null        // poste extrait
  industry: string | null
  professional_location: string | null
  public_profile_url: string | null
  sources: string[]               // URLs citées par Gemini (grounding)
  raw: string                     // réponse complète pour debug
}

const SYSTEM_PROMPT =
  "Tu es un expert en OSINT B2B. Recherche cette personne sur internet en croisant son nom, " +
  "son année de naissance et sa ville. Élimine les homonymes. Si tu trouves la bonne personne, " +
  "résume sa situation professionnelle (métier, entreprises, SCI). Ne retourne que des faits " +
  "vérifiables issus de ta recherche web. Si la recherche ne donne rien de concluant, dis-le."

// Extrait une valeur JSON simple depuis une réponse texte
function extractField(text: string, keys: string[]): string | null {
  for (const key of keys) {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i'))
    if (m) return m[1].trim()
  }
  return null
}

// Tente de parser le JSON de fin de réponse si Gemini en a généré un
function tryParseJson(text: string): Partial<GeminiEnrichResult> {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return {}
  try {
    return JSON.parse(m[0]) as Partial<GeminiEnrichResult>
  } catch {
    return {}
  }
}

export async function enrichProspect(
  name: string,
  birthYear: string | number | null,
  location: string | null,
  extraContext?: string,
  address?: string | null
): Promise<GeminiEnrichResult> {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey.length < 10) {
    console.warn('[gemini] GOOGLE_API_KEY absent ou invalide')
    return emptyResult('GOOGLE_API_KEY manquante')
  }

  const ai = new GoogleGenAI({ apiKey })

  // Générer des variations du nom pour une recherche plus large
  const nameParts = name.trim().split(/\s+/)
  const nameVariants = [
    name,
    nameParts.join('-'),                          // Jean-Charles Doria
    nameParts.join(' ').toLowerCase(),            // jean charles doria
    `${nameParts[nameParts.length - 1]} ${nameParts.slice(0, -1).join(' ')}`, // Doria Jean Charles
  ].filter((v, i, a) => a.indexOf(v) === i).join('", "')

  const userPrompt = [
    `Nom à rechercher (essaie ces variantes) : "${nameVariants}"`,
    birthYear ? `Année de naissance : ${birthYear}` : null,
    location   ? `Ville / région : ${location}` : null,
    address    ? `Adresse précise : ${address}` : null,
    extraContext ? `Contexte supplémentaire : ${extraContext}` : null,
    '',
    'Stratégie de recherche :',
    '1. LinkedIn, Viadeo, profils professionnels',
    '2. Societe.com, Infogreffe (si entrepreneur)',
    '3. Pages Jaunes Pro, Kompass, annuaires',
    `4. Recherche par adresse "${address ?? location}" pour trouver des activités professionnelles`,
    '5. Presse locale, mentions dans des articles',
    '',
    'IMPORTANT : si tu trouves un homonyme célèbre (ex: Jean-Charles Doria chez BNP Paribas / Head of Data Science), IGNORE-LE et cherche une autre personne du même nom.',
    '',
    'Si tu trouves des données, retourne ce JSON à la fin :',
    '{"company":"...","job_title":"...","industry":"...","professional_location":"...","public_profile_url":"..."}'
  ].filter(Boolean).join('\n')

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    })

    const raw = response.text ?? ''
    console.log('[gemini] raw response length:', raw.length)

    // Extraire les URLs de grounding
    const sources: string[] = []
    const groundingMeta = response.candidates?.[0]?.groundingMetadata
    if (groundingMeta) {
      const chunks = (groundingMeta as Record<string, unknown>).groundingChunks as { web?: { uri?: string } }[] | undefined
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          if (chunk?.web?.uri) sources.push(chunk.web.uri)
        }
      }
    }

    // Essai de parsing JSON en fin de réponse
    const parsed = tryParseJson(raw)

    return {
      summary: raw,
      company: parsed.company ?? extractField(raw, ['company', 'entreprise', 'société']) ?? null,
      job_title: parsed.job_title ?? extractField(raw, ['job_title', 'poste', 'métier', 'fonction']) ?? null,
      industry: parsed.industry ?? extractField(raw, ['industry', 'secteur']) ?? null,
      professional_location: parsed.professional_location ?? extractField(raw, ['professional_location', 'ville', 'localisation']) ?? null,
      public_profile_url: parsed.public_profile_url ?? extractField(raw, ['public_profile_url', 'linkedin', 'url']) ?? null,
      sources,
      raw,
    }
  } catch (err) {
    console.error('[gemini] error:', err)
    return emptyResult(String(err))
  }
}

function emptyResult(reason: string): GeminiEnrichResult {
  return {
    summary: null,
    company: null,
    job_title: null,
    industry: null,
    professional_location: null,
    public_profile_url: null,
    sources: [],
    raw: reason,
  }
}
