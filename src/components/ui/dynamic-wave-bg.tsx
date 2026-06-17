import { useEffect, useRef } from 'react'

export function DynamicWaveBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let W = 0, H = 0
    const SCALE = 4

    const buffer = document.createElement('canvas')
    let bufCtx = buffer.getContext('2d')!
    let bufData: ImageData
    let pix: Uint8ClampedArray

    const onResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      W = Math.ceil(canvas.width / SCALE)
      H = Math.ceil(canvas.height / SCALE)
      buffer.width = W
      buffer.height = H
      bufCtx = buffer.getContext('2d')!
      bufData = bufCtx.createImageData(W, H)
      pix = bufData.data
    }

    window.addEventListener('resize', onResize)
    onResize()

    const SIN = new Float32Array(1024)
    const COS = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) {
      const a = (i / 1024) * Math.PI * 2
      SIN[i] = Math.sin(a)
      COS[i] = Math.cos(a)
    }

    const fs = (x: number) => {
      const i = (((x % (Math.PI * 2)) / (Math.PI * 2)) * 1024 | 0) & 1023
      return SIN[i < 0 ? i + 1024 : i]
    }
    const fc = (x: number) => {
      const i = (((x % (Math.PI * 2)) / (Math.PI * 2)) * 1024 | 0) & 1023
      return COS[i < 0 ? i + 1024 : i]
    }

    // Brand blue #124bd2 = rgb(18, 75, 210)
    const BR = 18, BG_c = 75, BB = 210

    const t0 = Date.now()

    const render = () => {
      const t = (Date.now() - t0) * 0.001

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const ux = (2 * x - W) / H
          const uy = (2 * y - H) / H

          let a = 0, d = 0
          for (let i = 0; i < 4; i++) {
            a += fc(i - d + t * 0.5 - a * ux)
            d += fs(i * uy + a)
          }

          const wave = (fs(a) + fc(d)) * 0.5
          const wt = Math.max(0, Math.min(1, wave * 0.5 + 0.5))

          // Very subtle blue tint on white (3–13%)
          const blue = Math.max(0, Math.min(0.16,
            0.03 + 0.10 * wt + 0.02 * fc(ux + uy + t * 0.3)
          ))

          const idx = (y * W + x) * 4
          pix[idx]     = Math.round(255 - blue * (255 - BR))
          pix[idx + 1] = Math.round(255 - blue * (255 - BG_c))
          pix[idx + 2] = Math.round(255 - blue * (255 - BB))
          pix[idx + 3] = 255
        }
      }

      bufCtx.putImageData(bufData, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'medium'
      ctx.drawImage(buffer, 0, 0, canvas.width, canvas.height)

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  )
}
