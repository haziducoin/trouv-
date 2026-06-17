import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, HelpCircle } from "lucide-react"
import { useId, useState } from "react"

const faqs = [
  {
    question: "trouvé! est-il légal et conforme RGPD ?",
    answer:
      "Oui. trouvé! n'utilise que des données professionnelles publiques (nom, entreprise, téléphone pro, email pro). Chaque donnée est tracée avec sa source et sa date de collecte. La plateforme est conçue en conformité stricte avec le RGPD et les recommandations de la CNIL.",
  },
  {
    question: "Comment fonctionne l'accès aux coordonnées ?",
    answer:
      "Vous effectuez une recherche à partir des indices que vous avez (nom, ville, entreprise…). trouvé! croise les sources et vous présente les résultats avec un score de confiance. Les coordonnées complètes (06/07, email direct) sont débloquées selon votre quota de crédits.",
  },
  {
    question: "Qu'est-ce qu'un crédit téléphone (unlock) ?",
    answer:
      "Un crédit téléphone permet de déverrouiller le numéro mobile direct (06/07) d'un contact. Les plans Solo et Agence incluent un quota mensuel d'unlocks. Au-delà du quota, chaque unlock supplémentaire est facturé à l'unité.",
  },
  {
    question: "Puis-je essayer avant de m'abonner ?",
    answer:
      "Oui, la démo gratuite vous donne accès à 5 recherches avec les coordonnées masquées pour tester la pertinence des résultats. L'accès complet est activé après validation de votre compte professionnel.",
  },
  {
    question: "Comment est validé mon compte professionnel ?",
    answer:
      "Lors de l'inscription, vous renseignez votre email professionnel et votre SIREN. Notre équipe vérifie manuellement les informations sous 24 à 48h. Les adresses email personnelles (Gmail, Hotmail…) ne sont pas acceptées.",
  },
  {
    question: "Puis-je exporter les données ?",
    answer:
      "L'export CSV est disponible sur le plan Agence et supérieur. Chaque export est journalisé (qui, quand, combien de lignes) pour garantir la traçabilité et le respect des obligations légales.",
  },
  {
    question: "Puis-je résilier à tout moment ?",
    answer:
      "Oui. Aucun engagement minimal. Vous pouvez résilier depuis votre espace compte à tout moment. La résiliation prend effet à la fin de la période en cours.",
  },
]

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const baseId = useId()

  return (
    <section className="w-full px-5 py-20 md:py-28">
      <div className="mx-auto max-w-3xl">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, type: "spring" }}
            className="mb-4 inline-flex rounded-full bg-blue-50 p-3"
          >
            <HelpCircle className="h-7 w-7 text-[#124bd2]" />
          </motion.div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#124bd2]">FAQ</p>
          <h2 className="text-3xl font-bold tracking-tight text-[#070f22] sm:text-4xl md:text-5xl">
            Questions fréquentes
          </h2>
          <p className="mt-4 text-base text-slate-500">
            Tout ce que vous devez savoir sur trouvé!
          </p>
        </motion.div>

        {/* Accordéon */}
        <div className="space-y-3">
          {faqs.map((faq, index) => {
            const questionId = `${baseId}-q-${index}`
            const answerId   = `${baseId}-a-${index}`
            const isOpen     = openIndex === index

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.07 }}
              >
                <Card className={`overflow-hidden transition-shadow duration-200 ${isOpen ? "shadow-md shadow-blue-100 border-[#124bd2]/30" : ""}`}>
                  <CardHeader className="p-0">
                    <motion.button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : index)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#124bd2]/50 focus-visible:ring-offset-2"
                      whileHover={{ x: 3 }}
                      aria-expanded={isOpen}
                      aria-controls={answerId}
                      id={questionId}
                    >
                      <span className="text-base font-semibold text-[#070f22]">
                        {faq.question}
                      </span>
                      <motion.span
                        animate={{ rotate: isOpen ? 180 : 0 }}
                        transition={{ duration: 0.25 }}
                        className="shrink-0"
                      >
                        <ChevronDown className="h-5 w-5 text-slate-400" />
                      </motion.span>
                    </motion.button>
                  </CardHeader>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: "easeInOut" }}
                        role="region"
                        id={answerId}
                        aria-labelledby={questionId}
                      >
                        <CardContent className="border-t border-slate-100 px-6 pb-5 pt-4">
                          <p className="text-sm leading-relaxed text-slate-500">
                            {faq.answer}
                          </p>
                        </CardContent>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
