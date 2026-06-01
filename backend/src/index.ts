import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import stripeRouter from './routes/stripe.js'
import searchRouter from './routes/search.js'
import prospectsRouter from './routes/prospects.js'
import chatRouter   from './routes/chat.js'
import { pingClickHouse } from './config/clickhouse.js'

const app  = express()
const PORT = parseInt(process.env.PORT ?? '4000', 10)

// ─── Sécurité ─────────────────────────────────────────────────────────────────
app.use(helmet())

app.use(cors({
  origin: [
    process.env.FRONTEND_URL ?? 'http://localhost:3000',
    'https://www.xn--trouv-fsa.fr',
    'https://xn--trouv-fsa.fr',
    'https://app.trouve.fr',
    'https://trouve.fr',
  ],
  credentials: true,
}))

// ─── IMPORTANT : le webhook Stripe doit recevoir le body RAW (avant JSON.parse)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))

// JSON pour toutes les autres routes
app.use(express.json({ limit: '10kb' }))

// ─── Rate limiting ─────────────────────────────────────────────────────────────
app.use(rateLimit({
  windowMs: 60_000,
  max:      60,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Trop de requêtes', code: 'RATE_LIMITED' },
}))

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/stripe',  stripeRouter)
app.use('/api/search',  searchRouter)
app.use('/api/prospects', prospectsRouter)
app.use('/api/chat',    chatRouter)

app.get('/health', async (_req, res) => {
  const ch = await pingClickHouse()
  res.status(ch ? 200 : 503).json({
    status:    ch ? 'ok' : 'degraded',
    clickhouse: ch,
    uptime:    process.uptime(),
    ts:        new Date().toISOString(),
  })
})

app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }))

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🚀 trouvé! API → http://localhost:${PORT}`)
  console.log(`   Stripe webhook  → POST /api/stripe/webhook`)
  console.log(`   Stripe checkout → POST /api/stripe/checkout`)
  console.log(`   Search API      → POST /api/search\n`)
  const ch = await pingClickHouse()
  console.log(ch ? '✅ ClickHouse OK' : '⚠️  ClickHouse non configuré')
})
