import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

const WORDS = [
  "Voir la démo",
  "5 recherches offertes",
]

interface AnimatedDemoButtonProps {
  onClick?: () => void
  className?: string
}

export function AnimatedDemoButton({ onClick, className }: AnimatedDemoButtonProps) {
  const [index, setIndex] = useState(0)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    const id = setInterval(() => {
      setAnimating(true)
      setTimeout(() => {
        setIndex(prev => (prev + 1) % WORDS.length)
        setAnimating(false)
      }, 380)
    }, 3200)
    return () => clearInterval(id)
  }, [])

  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      transition={{ layout: { duration: 0.3 } }}
      className={cn(
        "relative overflow-hidden rounded-2xl bg-[#124bd2] px-8 h-14",
        "text-white font-bold cursor-pointer",
        "shadow-[0_22px_44px_-22px_rgba(18,75,210,0.85)]",
        "transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0f3fc7] hover:shadow-[0_28px_54px_-22px_rgba(18,75,210,0.95)]",
        className
      )}
    >
      {/* Shimmer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <motion.div
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear", repeatDelay: 0.5 }}
          className="absolute inset-0 h-full w-full bg-gradient-to-r from-transparent via-white/15 to-transparent"
          style={{ transform: "skewX(-20deg)" }}
        />
      </div>

      {/* Glow pulse on transition */}
      <motion.div
        animate={{
          scale: animating ? [1, 1.06, 1] : 1,
          opacity: animating ? [0.5, 0.9, 0.5] : 0.5,
        }}
        transition={{ duration: 0.38 }}
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[#1B54FF]/50 blur-xl"
      />

      {/* Coin décoratifs */}
      <div className="pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 rounded-tl border-l-2 border-t-2 border-white/25" />
      <div className="pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 rounded-tr border-r-2 border-t-2 border-white/25" />
      <div className="pointer-events-none absolute bottom-2 left-2 h-2.5 w-2.5 rounded-bl border-b-2 border-l-2 border-white/25" />
      <div className="pointer-events-none absolute bottom-2 right-2 h-2.5 w-2.5 rounded-br border-b-2 border-r-2 border-white/25" />

      {/* Texte animé lettre par lettre */}
      <div className="relative z-10 flex items-center justify-center gap-2.5">
        <AnimatePresence mode="wait">
          <motion.span
            key={WORDS[index]}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)", scale: 0.92 }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: 0, y: -14, filter: "blur(6px)", scale: 1.06 }}
            transition={{ duration: 0.36, ease: [0.25, 0.25, 0, 1] }}
            className="text-base font-bold tracking-tight whitespace-nowrap"
          >
            {WORDS[index].split("").map((letter, i) => (
              <motion.span
                key={`${WORDS[index]}-${i}`}
                initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ delay: i * 0.025, duration: 0.3, ease: "easeOut" }}
                className="inline-block"
              >
                {letter === " " ? " " : letter}
              </motion.span>
            ))}
          </motion.span>
        </AnimatePresence>
        <ArrowRight className="h-4 w-4 shrink-0 opacity-90" />
      </div>
    </motion.button>
  )
}
