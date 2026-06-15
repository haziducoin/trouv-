import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Quote, Star } from "lucide-react"
import { motion, useAnimation, useInView, type Variants } from "framer-motion"
import { useEffect, useRef, useState } from "react"

export interface Testimonial {
  id: number
  name: string
  role: string
  company: string
  content: string
  rating: number
  avatar: string
  initials: string
}

export interface AnimatedTestimonialsProps {
  title?: string
  subtitle?: string
  badgeText?: string
  testimonials?: Testimonial[]
  autoRotateInterval?: number
  trustedCompanies?: string[]
  trustedCompaniesTitle?: string
  ratingStrip?: { score: string; count: string; renewal: string } | null
  className?: string
}

export function AnimatedTestimonials({
  title = "Ce que disent nos clients",
  subtitle = "Plus de 2 400 professionnels de l'immobilier font confiance à trouvé! chaque mois.",
  badgeText = "Ils nous font confiance",
  testimonials = [],
  autoRotateInterval = 5000,
  trustedCompanies = [],
  trustedCompaniesTitle = "Utilisé par les meilleurs réseaux immobiliers",
  ratingStrip = null,
  className,
}: AnimatedTestimonialsProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const sectionRef = useRef(null)
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 })
  const controls = useAnimation()

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  }

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  }

  useEffect(() => {
    if (isInView) controls.start("visible")
  }, [isInView, controls])

  useEffect(() => {
    if (autoRotateInterval <= 0 || testimonials.length <= 1) return
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % testimonials.length)
    }, autoRotateInterval)
    return () => clearInterval(interval)
  }, [autoRotateInterval, testimonials.length])

  if (testimonials.length === 0) return null

  return (
    <section
      ref={sectionRef}
      id="temoignages"
      className={`overflow-hidden bg-slate-50/60 py-20 md:py-28 ${className ?? ""}`}
    >
      <div className="mx-auto max-w-6xl px-5">
        <motion.div
          initial="hidden"
          animate={controls}
          variants={containerVariants}
          className="grid grid-cols-1 gap-16 md:grid-cols-2 lg:gap-24"
        >
          {/* Gauche : titre + navigation */}
          <motion.div variants={itemVariants} className="flex flex-col justify-center">
            <div className="space-y-6">
              {badgeText && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-[#124bd2] ring-1 ring-blue-100">
                  <Star className="h-3.5 w-3.5 fill-[#124bd2]" />
                  {badgeText}
                </div>
              )}

              <h2 className="text-3xl font-bold tracking-tight text-[#070f22] sm:text-4xl md:text-5xl">
                {title}
              </h2>

              <p className="max-w-[520px] text-lg leading-relaxed text-slate-500">
                {subtitle}
              </p>

              {/* Dots navigation */}
              <div className="flex items-center gap-3 pt-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveIndex(index)}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      activeIndex === index
                        ? "w-10 bg-[#124bd2]"
                        : "w-2.5 bg-slate-200 hover:bg-slate-300"
                    }`}
                    aria-label={`Témoignage ${index + 1}`}
                  />
                ))}
              </div>

              {/* Rating strip */}
              {ratingStrip && (
                <div className="flex flex-wrap items-center gap-4 pt-2 text-sm text-slate-500">
                  <span className="flex items-center gap-2 font-semibold text-slate-700">
                    <span className="text-2xl font-bold text-[#124bd2]">{ratingStrip.score}</span>
                    <span>/ 5</span>
                    <div className="flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span>{ratingStrip.count} professionnels actifs</span>
                  <span className="text-slate-300">·</span>
                  <span>{ratingStrip.renewal} de renouvellement</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Droite : carte animée */}
          <motion.div variants={itemVariants} className="relative min-h-[340px] md:min-h-[420px]">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.id}
                className="absolute inset-0"
                initial={{ opacity: 0, x: 80 }}
                animate={{
                  opacity: activeIndex === index ? 1 : 0,
                  x: activeIndex === index ? 0 : 80,
                  scale: activeIndex === index ? 1 : 0.95,
                }}
                transition={{ duration: 0.45, ease: "easeInOut" }}
                style={{ zIndex: activeIndex === index ? 10 : 0 }}
              >
                <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_8px_32px_-8px_rgba(15,23,42,0.12)]">
                  {/* Stars */}
                  <div className="mb-5 flex gap-1">
                    {Array(testimonial.rating).fill(0).map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>

                  {/* Quote */}
                  <div className="mb-6 flex-1">
                    <Quote className="mb-3 h-6 w-6 text-[#124bd2]/20" />
                    <p className="text-lg font-medium leading-relaxed text-slate-700">
                      {testimonial.content}
                    </p>
                  </div>

                  <Separator className="my-4" />

                  {/* Author */}
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 shadow-sm">
                      <AvatarFallback delayMs={0} className="bg-gradient-to-br from-[#1B54FF] to-[#124bd2] text-white font-bold text-sm tracking-wide">
                        {testimonial.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold text-[#070f22]">{testimonial.name}</p>
                      <p className="text-sm text-slate-400">
                        {testimonial.role} · {testimonial.company}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Déco blobs */}
            <div className="absolute -bottom-5 -left-5 h-20 w-20 rounded-2xl bg-[#1B54FF]/5" />
            <div className="absolute -right-5 -top-5 h-20 w-20 rounded-2xl bg-[#1B54FF]/5" />
          </motion.div>
        </motion.div>

        {/* Logo cloud */}
        {trustedCompanies.length > 0 && (
          <motion.div
            variants={itemVariants}
            initial="hidden"
            animate={controls}
            className="mt-20 text-center"
          >
            <p className="mb-7 text-xs font-bold uppercase tracking-widest text-slate-400">
              {trustedCompaniesTitle}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
              {trustedCompanies.map((company) => (
                <span
                  key={company}
                  className="text-lg font-bold text-slate-300 transition hover:text-slate-400"
                >
                  {company}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  )
}
