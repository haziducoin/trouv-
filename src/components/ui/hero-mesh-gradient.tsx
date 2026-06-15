import { useEffect, useState } from "react"
import { MeshGradient } from "@paper-design/shaders-react"

const TROUVE_COLORS = ["#e8f0ff", "#bdd0ff", "#dbeafe", "#f0f4ff", "#c7d9ff", "#ffffff"]

export function HeroMeshGradient() {
  const [mounted, setMounted] = useState(false)
  const [size, setSize] = useState({ w: 1920, h: 1080 })

  useEffect(() => {
    setMounted(true)
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  if (!mounted) return null

  return (
    <MeshGradient
      width={size.w}
      height={size.h}
      colors={TROUVE_COLORS}
      distortion={0.5}
      swirl={0.4}
      grainMixer={0}
      grainOverlay={0}
      speed={0.28}
      offsetX={0.06}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  )
}
