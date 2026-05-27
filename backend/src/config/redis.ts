import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL   ?? '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
})

export const CACHE_TTL = 300  // 5 min

export const CACHE_KEYS = {
  search:  (hash: string) => `trouve:search:${hash}`,
  quota:   (userId: string) => `trouve:quota:${userId}`,
} as const
