import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const router = Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim())

const SYSTEM_PROMPT = `Tu es l'assistant support de trouvé!, un outil B2B SaaS destiné aux professionnels de l'immobilier en France.

trouvé! permet de rechercher des entreprises (agences immobilières, mandataires, etc.) dans une base de 10 millions d'entrées issues de la base officielle Sirene / Annuaire des Entreprises. Les résultats arrivent en moins de 200ms et sont exportables en CSV.

OFFRES (toutes HT) :
- Solo : 199 €/mois · 1 500 recherches · 1 compte nominatif · export PDF · historique 90j · support email
- Agence (⭐ le plus populaire) : 499 €/mois · 5 000 recherches · 3 comptes nominatifs · dashboard stats · export CSV illimité · historique 12 mois · support prioritaire · onboarding dédié
- Pro : 899 €/mois · 12 000 recherches · 7 comptes nominatifs · multi-agence · intégrations CRM · SLA 99,9% · support téléphonique
- Réseau : sur devis · utilisateurs illimités · infrastructure dédiée · SSO/SAML · CSM dédié
Remises : -15% trimestriel, -20% annuel. 14 jours d'essai gratuit sur tous les plans. Résiliation en 1 clic, sans engagement.
Add-ons : +500 recherches = 49€ (30j), siège supplémentaire = 59€/mois.
Paiement sécurisé Stripe, facture TVA automatique.

ACCÈS :
Réservé aux professionnels. Inscription avec SIREN + email pro. Validation sous 24-48h.

SÉCURITÉ & LÉGAL :
Données officielles Sirene (publiques). Comptes nominatifs. Logs d'utilisation. Anti-extraction. Pas d'export massif. Opposition/suppression possibles.

RÈGLES DE COMPORTEMENT :
- Réponds toujours en français, de façon concise et professionnelle.
- Si tu ne sais pas ou si la question dépasse ton périmètre, dis-le honnêtement.
- Si l'utilisateur exprime une frustration, un problème technique urgent, ou demande explicitement à parler à un humain, réponds avec le JSON spécial ci-dessous pour déclencher l'escalade WhatsApp.
- Ne donne jamais de fausses informations sur les prix ou les fonctionnalités.

ESCALADE : si tu dois transférer à un agent humain, termine ta réponse EXACTEMENT par ce marqueur (sur sa propre ligne) :
[[ESCALATE]]`

const MessageSchema = z.object({
  role:    z.enum(['user', 'assistant']),
  content: z.string().max(4000),
})

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(30),
})

function fallbackSupportReply(messages: Array<{ role: 'user' | 'assistant'; content: string }>) {
  const last = messages.at(-1)?.content.toLowerCase() ?? ''
  const wantsHuman = /(humain|agent|whatsapp|appel|urgent|bug|bloqu|probl[eè]me|support)/i.test(last)

  if (wantsHuman) {
    return {
      reply: "Je peux transférer votre demande à un agent. Décrivez brièvement le problème et utilisez le bouton WhatsApp pour continuer avec l'équipe.",
      escalate: true,
    }
  }

  if (/(prix|tarif|abonnement|solo|agence|pro|r[ée]seau)/i.test(last)) {
    return {
      reply: "Les offres sont : Solo à 199 €/mois, Agence à 499 €/mois, Pro à 899 €/mois, et Réseau sur devis. Chaque offre inclut un volume mensuel de recherches, des comptes nominatifs et un usage encadré.",
      escalate: false,
    }
  }

  if (/(acc[eè]s|compte|inscription|siren|email|validation)/i.test(last)) {
    return {
      reply: "L'accès est réservé aux professionnels. La demande se fait avec un SIREN, un email professionnel et une validation du compte avant l'accès complet.",
      escalate: false,
    }
  }

  if (/(donn[ée]es|rgpd|export|s[eé]curit[eé]|logs|revente)/i.test(last)) {
    return {
      reply: "trouvé! est conçu comme un outil métier : comptes nominatifs, logs d'utilisation, pas d'export massif, interdiction de revente et possibilité de suppression/opposition.",
      escalate: false,
    }
  }

  return {
    reply: "Je peux vous aider sur les offres, l'accès professionnel, les données disponibles, la sécurité ou le fonctionnement de la recherche. Pour une demande précise, indiquez votre besoin en une phrase.",
    escalate: false,
  }
}

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    route: 'POST /api/chat',
    message: "L'API support est active. Le widget du site envoie les messages ici en POST.",
    provider: hasAnthropicKey ? 'anthropic' : 'fallback',
  })
})

router.post('/', async (req: Request, res: Response) => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Payload invalide', details: parsed.error.flatten() })
    return
  }

  const { messages } = parsed.data

  if (!hasAnthropicKey) {
    res.json(fallbackSupportReply(messages))
    return
  }

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages,
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const shouldEscalate = text.includes('[[ESCALATE]]')
    const cleanText      = text.replace('[[ESCALATE]]', '').trim()

    res.json({ reply: cleanText, escalate: shouldEscalate })
  } catch (err) {
    console.error('[chat] Claude API error:', err)
    res.json(fallbackSupportReply(messages))
  }
})

export default router
