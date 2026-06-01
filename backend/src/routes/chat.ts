import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

const router = Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim())

const SYSTEM_PROMPT = `Tu es l'assistant support de trouvé!, un outil B2B SaaS destiné aux professionnels de l'immobilier en France.

trouvé! permet aux professionnels vérifiés d'identifier plus vite les bons contacts B2B. Le parcours commercial est : aperçu gratuit masqué, validation professionnelle, puis accès complet selon l'offre.

NIVEAUX D'ACCÈS :
- Aperçu : 5 recherches de démonstration, coordonnées masquées, sans compte complet.
- Accès en attente : 10 recherches masquées pendant la validation du compte.
- Accès complet : coordonnées complètes, favoris, historique, exports maîtrisés et quotas selon l'offre.

OFFRES (toutes HT) :
- Solo : 199 €/mois · accès complet après validation · 1 500 recherches · 1 compte nominatif · coordonnées complètes · historique 90j · export PDF maîtrisé
- Agence (le plus populaire) : 499 €/mois · accès complet équipe · 5 000 recherches · 3 comptes nominatifs · dashboard agence · exports CSV encadrés · historique 12 mois · logs d'utilisation · support prioritaire
- Pro : 899 €/mois · accès complet multi-équipe · 12 000 recherches · 7 comptes nominatifs · rôles agence/admin · API disponible sur validation · intégrations CRM · audit d'usage avancé
- Réseau : sur devis · multi-agences · volume personnalisé · infrastructure adaptée · SSO/SAML · contrat dédié · accompagnement CSM
Remises : -15% trimestriel, -20% annuel. Aperçu gratuit disponible avant inscription. Résiliation en 1 clic, sans engagement.
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
      reply: "Les offres débloquent l'accès complet après validation : Solo à 199 €/mois, Agence à 499 €/mois, Pro à 899 €/mois, et Réseau sur devis. Avant inscription, l'aperçu gratuit permet 5 recherches avec coordonnées masquées.",
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
