import { useRef, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
// @ts-ignore
import DottedMap from "dotted-map"
import { Globe } from "lucide-react"

// DottedMap with countries:['FRA'] generates viewBox="0 0 60 60"
// Projection derived empirically: x = 4.22*lng + 19.5 | y = -6.19*lat + 317.6
const project = (lat: number, lng: number) => ({
  x: 4.22 * lng + 19.5,
  y: -6.19 * lat + 317.6,
})

interface FranceDot {
  start: { lat: number; lng: number; label?: string }
  end:   { lat: number; lng: number; label?: string }
}

export function FranceMap({
  dots = [],
  lineColor = "#124bd2",
}: {
  dots?: FranceDot[]
  lineColor?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const bgSvg = useMemo(() => {
    const map = new DottedMap({ height: 60, grid: "diagonal", countries: ["FRA"] })
    return map.getSVG({
      radius: 0.32,
      color: "#124bd2",
      shape: "circle",
      backgroundColor: "transparent",
    })
  }, [])

  const arc = (s: { x: number; y: number }, e: { x: number; y: number }) => {
    const mx = (s.x + e.x) / 2
    const my = Math.min(s.y, e.y) - 6
    return `M ${s.x} ${s.y} Q ${mx} ${my} ${e.x} ${e.y}`
  }

  const stagger = 0.5
  const dur     = 2
  const total   = dots.length * stagger + dur
  const cycle   = total + 2.5

  // Deduplicate city labels so each city dot appears once
  const cities = useMemo(() => {
    const seen = new Set<string>()
    const result: { pt: { x: number; y: number }; label: string }[] = []
    for (const dot of dots) {
      for (const { lat, lng, label } of [dot.start, dot.end]) {
        const key = `${lat},${lng}`
        if (!seen.has(key)) {
          seen.add(key)
          result.push({ pt: project(lat, lng), label: label ?? "" })
        }
      }
    }
    return result
  }, [dots])

  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm"
      style={{ aspectRatio: "1 / 1" }}
    >
      {/* Background — France territory dots only (inset 8% to add breathing room) */}
      <img
        src={`data:image/svg+xml;utf8,${encodeURIComponent(bgSvg)}`}
        className="absolute pointer-events-none select-none"
        style={{ inset: "8%", width: "84%", height: "84%", objectFit: "fill", opacity: 0.18 }}
        alt=""
        aria-hidden
      />

      {/* Edge fades — subtle, only at the card edges */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.4) 0%, transparent 8%, transparent 92%, rgba(255,255,255,0.4) 100%)",
        }}
      />

      {/* SVG overlay — same 60×60 space, inset to match background */}
      <svg
        ref={svgRef}
        viewBox="0 0 60 60"
        className="absolute"
        style={{ inset: "8%", width: "84%", height: "84%" }}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="fr-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="white"     stopOpacity="0" />
            <stop offset="10%"  stopColor={lineColor} stopOpacity="1" />
            <stop offset="90%"  stopColor={lineColor} stopOpacity="1" />
            <stop offset="100%" stopColor="white"     stopOpacity="0" />
          </linearGradient>
          <filter id="fr-glow">
            <feGaussianBlur stdDeviation="0.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Animated arcs */}
        {dots.map((dot, i) => {
          const s    = project(dot.start.lat, dot.start.lng)
          const e    = project(dot.end.lat,   dot.end.lng)
          const path = arc(s, e)
          const t0   = (i * stagger) / cycle
          const t1   = (i * stagger + dur) / cycle
          const tr   = total / cycle

          return (
            <g key={`arc-${i}`}>
              <motion.path
                d={path}
                fill="none"
                stroke="url(#fr-line)"
                strokeWidth="0.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 0, 1, 1, 0] }}
                transition={{ duration: cycle, times: [0, t0, t1, tr, 1], ease: "easeInOut", repeat: Infinity }}
              />
              <motion.circle
                r="1.2"
                fill={lineColor}
                initial={{ opacity: 0 }}
                animate={{
                  offsetDistance: [null, "0%", "100%", "100%", "100%"],
                  opacity: [0, 0, 1, 0, 0],
                }}
                transition={{ duration: cycle, times: [0, t0, t1, tr, 1], ease: "easeInOut", repeat: Infinity }}
                style={{ offsetPath: `path('${path}')` }}
              />
            </g>
          )
        })}

        {/* City dots (deduplicated) */}
        {cities.map(({ pt, label }, i) => (
          <motion.g
            key={`city-${i}`}
            onHoverStart={() => label && setHovered(label)}
            onHoverEnd={() => setHovered(null)}
            whileHover={{ scale: 1.4 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="cursor-pointer"
          >
            <circle cx={pt.x} cy={pt.y} r="0.9" fill={lineColor} filter="url(#fr-glow)" />
            <circle cx={pt.x} cy={pt.y} r="0.9" fill={lineColor} opacity="0.35">
              <animate attributeName="r"       from="0.9" to="4"  dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.5" to="0"  dur="2s" repeatCount="indefinite" />
            </circle>
            {label && (
              <text
                x={pt.x}
                y={pt.y - 2}
                textAnchor="middle"
                fontSize="2.4"
                fontFamily="system-ui, sans-serif"
                fontWeight="700"
                fill="#1e293b"
                style={{ userSelect: "none", pointerEvents: "none" }}
              >
                {label}
              </text>
            )}
          </motion.g>
        ))}
      </svg>

      {/* Europe coming soon badge */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-blue-100 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm"
      >
        <Globe className="h-3 w-3 text-[#124bd2]" />
        Europe — Bientôt disponible
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
      </motion.div>

      {/* Hover tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-4 left-4 rounded-lg border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm"
          >
            {hovered}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
