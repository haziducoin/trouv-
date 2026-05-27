import { createClient } from '@clickhouse/client'

export const clickhouse = createClient({
  url:      process.env.CLICKHOUSE_HOST  ?? 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER  ?? 'default',
  password: process.env.CLICKHOUSE_PASSWORD ?? '',
  database: process.env.CLICKHOUSE_DATABASE ?? 'trouve',
  compression: { request: true, response: true },
  request_timeout: 30_000,
  keep_alive: { enabled: true, idle_socket_ttl: 2500 },
})

export async function pingClickHouse(): Promise<boolean> {
  try { await clickhouse.ping(); return true } catch { return false }
}
