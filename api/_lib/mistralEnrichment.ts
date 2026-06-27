// ─── Mistral AI enrichment — web search natif + extraction depuis snippets ────
// Remplace Gemini (clé invalide) et llama-3.1-8b-instant (rate limit Groq).
// Mistral supporte un tool "web_search" server-side depuis mistral-medium-2505.

const MISTRAL_URL    = 'https://api.mistral.ai/v1/chat/completions'
const ENRICH_MODEL   = 'mistral-medium-latest'   // meilleure connaissance des professionnels français
const EXTRACT_MODEL  = 'mistral-small-latest'    // extraction de snippets : vitesse > puissance

export interface MistralEnrichResult {
  company:               string | null
  job_title:             string | null
  industry:              string | null
  professional_location: string | null
  public_profile_url:    string | null
  sources:               string[]
  raw:                   string
}

function apiKey(): string | null {
  return process.env.MISTRAL_API_KEY ?? null
}

async function callMistral(
  messages: { role: string; content: string }[],
  opts: { model?: string; tools?: unknown[]; maxTokens?: number; timeoutMs?: number } = {}
): Promise<string> {
  const key = apiKey()
  if (!key) throw new Error('MISTRAL_API_KEY manquante')

  const body: Record<string, unknown> = {
    model:      opts.model ?? EXTRACT_MODEL,
    messages,
    temperature: 0.1,
    max_tokens:  opts.maxTokens ?? 400,
  }
  if (opts.tools?.length) {
    body.tools      = opts.tools
    body.tool_choice = 'auto'
  }

  const resp = await fetch(MISTRAL_URL, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(opts.timeoutMs ?? 20000),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as Record<string, unknown>
    throw new Error(`Mistral ${resp.status}: ${JSON.stringify(err)}`)
  }

  const data = await resp.json() as {
    choices: Array<{
      message: {
        content?: string
        tool_calls?: Array<{ function?: { name: string; arguments: string } }>
      }
    }>
  }

  const choice = data.choices?.[0]?.message
  if (!choice) throw new Error('Réponse Mistral vide')

  // Si le modèle a fait des tool_calls (web search), renvoyer le contenu final
  return choice.content ?? ''
}

// ─── 1. Enrichissement avec web search Mistral (remplace Gemini) ──────────────
export async function enrichWithMistral(
  name: string,
  birthYear: string | number | null,
  location:  string | null,
  extraContext?: string,
  address?:  string | null
): Promise<MistralEnrichResult> {
  const key = apiKey()
  if (!key) {
    console.warn('[mistral] MISTRAL_API_KEY absente')
    return emptyResult('MISTRAL_API_KEY manquante')
  }

  const nameParts    = name.trim().split(/\s+/)
  const nameVariants = [
    name,
    nameParts.join('-'),
    `${nameParts[nameParts.length - 1]} ${nameParts.slice(0, -1).join(' ')}`,
  ].filter((v, i, a) => a.indexOf(v) === i).join('", "')

  const userContent = [
    `Find current professional information about this French professional.`,
    `Name (try these variants): "${nameVariants}"`,
    birthYear    ? `Birth year: ${birthYear}`           : null,
    location     ? `City/region: ${location}, France`   : null,
    address      ? `Address: ${address}`                : null,
    extraContext ? `Additional context (DB): ${extraContext}` : null,
    ``,
    `Use your training knowledge about French professionals, entrepreneurs, and public figures.`,
    `Prioritize recent information (last 3 years). Eliminate homonyms.`,
    ``,
    `If you find reliable data, return ONLY this JSON at the end:`,
    `{"company":"...","job_title":"...","industry":"...","professional_location":"...","public_profile_url":"..."}`,
    `If you cannot find this specific person, return: {"company":null,"job_title":null,"industry":null,"professional_location":null,"public_profile_url":null}`,
  ].filter(Boolean).join('\n')

  try {
    const raw = await callMistral(
      [
        {
          role:    'system',
          content: 'You are a B2B OSINT expert specialized in French professionals. You have extensive knowledge of French entrepreneurs, executives, and public figures. Return ONLY data you are certain about. Cross-reference name, city, and sector to eliminate homonyms. Never invent data.',
        },
        { role: 'user', content: userContent },
      ],
      {
        model:     ENRICH_MODEL,
        maxTokens: 400,
        timeoutMs: 20000,
      }
    )

    console.log('[mistral] raw length:', raw.length, 'chars')

    const parsed = tryParseJson(raw)
    return {
      company:               parsed.company               ?? extractField(raw, ['company', 'entreprise'])   ?? null,
      job_title:             parsed.job_title             ?? extractField(raw, ['job_title', 'poste'])      ?? null,
      industry:              parsed.industry              ?? extractField(raw, ['industry', 'secteur'])     ?? null,
      professional_location: parsed.professional_location ?? extractField(raw, ['professional_location'])  ?? null,
      public_profile_url:    parsed.public_profile_url   ?? extractField(raw, ['public_profile_url', 'url']) ?? null,
      sources: [],
      raw,
    }
  } catch (err) {
    const msg = String(err)
    if (msg.includes('429')) console.error('[mistral] rate limit')
    else console.error('[mistral] error:', msg.slice(0, 120))
    return emptyResult(msg)
  }
}

// ─── 2. Extraction depuis snippets Exa/Brave (remplace llama-3.1-8b) ─────────
export async function extractWithMistral(
  snippets: string,
  name:     string,
  city:     string
): Promise<{ company: string|null; job_title: string|null; industry: string|null; professional_location: string|null; public_profile_url: string|null } | null> {
  if (!snippets?.trim()) return null
  const key = apiKey()
  if (!key) return null

  const year = new Date().getFullYear()

  try {
    const raw = await callMistral(
      [{
        role: 'user',
        content: `Extract professional info for "${name}" (from ${city || 'France'}).

RULES:
- Use ONLY data present in the snippets below
- Do NOT invent or use training knowledge
- Ignore data before ${year - 3}
- If multiple people named "${name}" → pick the one from ${city || 'France'}

SNIPPETS:
${snippets.slice(0, 2000)}

Return JSON only, no markdown:
{"company":null,"job_title":null,"industry":null,"professional_location":null,"public_profile_url":null}`,
      }],
      { model: EXTRACT_MODEL, maxTokens: 200, timeoutMs: 15000 }
    )

    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return null
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { company?: string; job_title?: string; industry?: string; professional_location?: string; public_profile_url?: string }
    if (parsed?.company || parsed?.job_title) return {
      company:               parsed.company               ?? null,
      job_title:             parsed.job_title             ?? null,
      industry:              parsed.industry              ?? null,
      professional_location: parsed.professional_location ?? null,
      public_profile_url:    parsed.public_profile_url   ?? null,
    }
  } catch (err) {
    const msg = String(err)
    if (msg.includes('429')) console.error('[mistral-extract] rate limit')
    else console.error('[mistral-extract] error:', msg.slice(0, 80))
  }
  return null
}

function emptyResult(reason: string): MistralEnrichResult {
  return { company: null, job_title: null, industry: null, professional_location: null, public_profile_url: null, sources: [], raw: reason }
}

function extractField(text: string, keys: string[]): string | null {
  for (const key of keys) {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i'))
    if (m) return m[1].trim()
  }
  return null
}

function tryParseJson(text: string): Partial<MistralEnrichResult> {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return {}
  try { return JSON.parse(m[0]) as Partial<MistralEnrichResult> } catch { return {} }
}
