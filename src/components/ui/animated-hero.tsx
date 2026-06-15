import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowRight, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"

interface HeroProps {
  onGetStarted?: () => void
  onContactSales?: () => void
}

function Hero({ onGetStarted, onContactSales }: HeroProps) {
  const [titleNumber, setTitleNumber] = useState(0)
  const titles = useMemo(
    () => ["rapide", "fiable", "précis", "complet", "légal"],
    []
  )

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setTitleNumber((prev) => (prev === titles.length - 1 ? 0 : prev + 1))
    }, 2000)
    return () => clearTimeout(timeoutId)
  }, [titleNumber, titles])

  return (
    <div className="relative w-full overflow-hidden">
      {/* Glow background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-6rem] h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-blue-200/30 blur-[90px]" />
        <div className="absolute left-1/4 top-[10rem] h-[16rem] w-[20rem] rounded-full bg-indigo-200/20 blur-[70px]" />
      </div>

      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-center gap-8 py-24 lg:py-36">

          {/* Badge */}
          <div>
            <Button variant="secondary" size="sm" className="gap-2 rounded-full px-4 text-xs font-semibold tracking-wide">
              Moteur de contacts immobiliers
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Headline */}
          <div className="flex flex-col items-center gap-5">
            <h1 className="max-w-2xl text-center text-5xl font-bold tracking-tight text-slate-900 md:text-7xl">
              <span className="text-slate-800">Trouvez le bon contact.</span>
              <span className="relative mt-2 flex h-[1.2em] w-full items-center justify-center overflow-hidden text-center">
                &nbsp;
                {titles.map((title, index) => (
                  <motion.span
                    key={index}
                    className="absolute font-extrabold text-[#1B54FF]"
                    initial={{ opacity: 0, y: -60 }}
                    transition={{ type: "spring", stiffness: 60, damping: 14 }}
                    animate={
                      titleNumber === index
                        ? { y: 0, opacity: 1 }
                        : { y: titleNumber > index ? -100 : 100, opacity: 0 }
                    }
                  >
                    {title}.
                  </motion.span>
                ))}
              </span>
            </h1>

            <p className="max-w-xl text-center text-base leading-relaxed text-slate-500 md:text-lg">
              trouvé! croise nom, ville, téléphone et réseau public pour vous livrer le contact exact —
              avec niveau de confiance et conformité RGPD intégrés.
            </p>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="gap-3 rounded-full px-8"
              onClick={onGetStarted}
            >
              Essayer gratuitement
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="gap-3 rounded-full px-8"
              onClick={onContactSales}
            >
              <Phone className="h-4 w-4" />
              Parler à un expert
            </Button>
          </div>

          {/* Social proof strip */}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Données 100 % professionnelles
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1B54FF]" />
              Comptes nominatifs vérifiés
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
              RGPD & conformité stricte
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export { Hero }
