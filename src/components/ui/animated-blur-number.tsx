import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"

export type AnimateNumberProps = {
  value: number
  format?: Intl.NumberFormatOptions
  locale?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  duration?: number
  className?: string
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "prefix" | "children">

function formatValue(value: number, locale: string, opts?: Intl.NumberFormatOptions) {
  try { return new Intl.NumberFormat(locale, opts).format(value) }
  catch { return String(value) }
}

function CharSlot({
  char, direction, duration,
}: { char: string; direction: number; duration: number }) {
  const dist = "0.5em"
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={char}
          style={{ display: "inline-block" }}
          initial={{
            opacity: 0,
            y: direction > 0 ? dist : `-${dist}`,
            filter: "blur(8px)",
          }}
          animate={{
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
          }}
          exit={{
            opacity: 0,
            y: direction > 0 ? `-${dist}` : dist,
            filter: "blur(8px)",
          }}
          transition={{
            duration: duration / 1000,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {char}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function AnimateNumber({
  value,
  format,
  locale = "fr-FR",
  prefix,
  suffix,
  duration = 380,
  className,
  ...rest
}: AnimateNumberProps) {
  const formatted = formatValue(value, locale, format)

  const prevRef = React.useRef(value)
  const [direction, setDirection] = React.useState(1)

  React.useEffect(() => {
    if (value !== prevRef.current) {
      setDirection(value > prevRef.current ? 1 : -1)
      prevRef.current = value
    }
  }, [value])

  const chars = formatted.split("")
  const len   = chars.length

  return (
    <span
      {...rest}
      className={className}
      style={{ display: "inline-flex", alignItems: "baseline", fontVariantNumeric: "tabular-nums", ...rest.style }}
    >
      {prefix != null && <span>{prefix}</span>}
      {chars.map((ch, i) => (
        <CharSlot
          key={len - 1 - i}
          char={ch}
          direction={direction}
          duration={duration}
        />
      ))}
      {suffix != null && <span>{suffix}</span>}
    </span>
  )
}

export default AnimateNumber
