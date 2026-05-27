import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { createHash } from 'crypto'
import { clickhouse } from '../config/clickhouse.js'
import { redis, CACHE_KEYS, CACHE_TTL } from '../config/redis.js'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const SearchSchema = z.object({
  query:  z.string().min(2).max(200),
  filters: z.object({
    city:     z.string().max(100).optional(),
    country:  z.string().length(2).optional(),
    type:     z.string().max(50).optional(),
  }).optional(),
  page:  z.number().int().positive().max(500).default(1),
  limit: z.number().int().positive().max(100).default(20),
})

router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = SearchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.flatten() })
    return
  }

  const { query, filters, page, limit } = parsed.data
  const offset = (page - 1) * limit

  // Vérifier le quota via Supabase
  const { error: quotaError } = await supabase.rpc('record_search', {
    p_query_label:  query,
    p_filters:      filters ?? {},
    p_result_count: 0,
  })

  if (quotaError) {
    if (quotaError.message.includes('Quota mensuel atteint')) {
      res.status(429).json({ error: 'Quota mensuel de recherches atteint', code: 'QUOTA_EXCEEDED' })
      return
    }
    res.status(403).json({ error: quotaError.message })
    return
  }

  // Cache Redis
  const cacheKey = CACHE_KEYS.search(
    createHash('sha256').update(JSON.stringify({ query, filters, page, limit })).digest('hex').slice(0, 16)
  )
  const cached = await redis.get(cacheKey)
  if (cached) { res.setHeader('X-Cache', 'HIT'); res.json(cached); return }

  try {
    // Requête ClickHouse
    const conditions: string[] = [`(
      name ILIKE {q: String}
      OR email ILIKE {q: String}
      OR phone LIKE {q_exact: String}
    )`]
    const params: Record<string, unknown> = {
      q:       `%${query.replace(/[%_]/g, '\\$&')}%`,
      q_exact: query,
      limit,
      offset,
    }

    if (filters?.city)    { conditions.push('city ILIKE {city: String}');       params['city']    = `%${filters.city}%` }
    if (filters?.country) { conditions.push('country = {country: String}');     params['country'] = filters.country.toUpperCase() }

    const where = conditions.join(' AND ')
    const start = Date.now()

    const [rs, countRs] = await Promise.all([
      clickhouse.query({ query: `SELECT id, name, city, country, phone, email, type, source_name FROM records WHERE ${where} ORDER BY name LIMIT {limit: UInt32} OFFSET {offset: UInt32}`, query_params: params, format: 'JSONEachRow', clickhouse_settings: { max_execution_time: 10, readonly: '1' } }),
      clickhouse.query({ query: `SELECT count() AS total FROM records WHERE ${where}`, query_params: Object.fromEntries(Object.entries(params).filter(([k]) => !['limit','offset'].includes(k))), format: 'JSON', clickhouse_settings: { max_execution_time: 10, readonly: '1' } }),
    ])

    const data  = await rs.json()
    const count = await countRs.json() as any
    const total = parseInt(count.data?.[0]?.total ?? '0', 10)

    const response = {
      data,
      meta: { total, page, limit, pages: Math.ceil(total / limit), duration_ms: Date.now() - start },
    }

    await redis.setex(cacheKey, CACHE_TTL, response)
    res.setHeader('X-Cache', 'MISS')
    res.json(response)
  } catch (err: any) {
    console.error('[search]', err.message)
    res.status(500).json({ error: 'Erreur de recherche' })
  }
})

export default router
