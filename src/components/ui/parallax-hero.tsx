import { useEffect, useRef, type CSSProperties } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/** Fond parallax léger à poser en absolu dans une section position:relative overflow:hidden */
export function ParallaxBg() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const el = ref.current
    if (!el) return

    const layers = el.querySelectorAll('[data-pb-layer]')
    const speeds = [0.35, 0.22, 0.1]

    layers.forEach((layer, i) => {
      gsap.fromTo(
        layer,
        { yPercent: speeds[i] * -50 },
        {
          yPercent: speeds[i] * 50,
          ease: 'none',
          scrollTrigger: {
            trigger: el.parentElement,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      )
    })

    return () => ScrollTrigger.getAll().forEach((st) => st.kill())
  }, [])

  const img = (src: string, style: CSSProperties) => (
    <div
      style={{
        position: 'absolute',
        inset: '-30% 0',
        backgroundImage: `url(${src})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...style,
      }}
    />
  )

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      {/* skyline lointaine */}
      <div data-pb-layer="1">
        {img(
          'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1600&q=80',
          { opacity: 0.07, filter: 'saturate(0.4) blur(0.5px)' }
        )}
      </div>
      {/* immeubles verre */}
      <div data-pb-layer="2">
        {img(
          'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=80',
          { opacity: 0.05, filter: 'saturate(0.2) blur(1px)' }
        )}
      </div>
      {/* halo bleu de marque */}
      <div
        data-pb-layer="3"
        style={{
          position: 'absolute',
          inset: '-30% 0',
          background:
            'radial-gradient(ellipse 85% 50% at 50% 0%, rgba(18,75,210,0.09) 0%, transparent 70%)',
        }}
      />
    </div>
  )
}

interface ParallaxHeroProps {
  children: React.ReactNode
  /** "divider" = section de transition compacte (80vh, scroll-through).
   *  Par défaut : mode "hero" (200vh sticky). */
  mode?: 'hero' | 'divider'
}

export function ParallaxHero({ children, mode = 'hero' }: ParallaxHeroProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    const root = wrapperRef.current
    if (!root) return
    const triggerEl = root.querySelector('[data-parallax-layers]')
    if (!triggerEl) return

    if (mode === 'divider') {
      // Scroll-through classique : les couches animent pendant le passage
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerEl,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      })
      ;[
        { layer: '1', yPercent: -30 },
        { layer: '2', yPercent: -20 },
        { layer: '3', yPercent: -10 },
        { layer: '4', yPercent: -4 },
      ].forEach(({ layer, yPercent }, idx) => {
        tl.to(
          triggerEl.querySelectorAll(`[data-parallax-layer="${layer}"]`),
          { yPercent, ease: 'none' },
          idx === 0 ? undefined : '<'
        )
      })
    } else {
      // Mode hero : sticky 200vh
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: triggerEl,
          start: '0% 0%',
          end: '100% 0%',
          scrub: 0.6,
        },
      })
      ;[
        { layer: '1', yPercent: 55 },
        { layer: '2', yPercent: 40 },
        { layer: '3', yPercent: 22 },
        { layer: '4', yPercent: 8 },
      ].forEach(({ layer, yPercent }, idx) => {
        tl.to(
          triggerEl.querySelectorAll(`[data-parallax-layer="${layer}"]`),
          { yPercent, ease: 'none' },
          idx === 0 ? undefined : '<'
        )
      })
    }

    return () => {
      ScrollTrigger.getAll().forEach((st) => st.kill())
    }
  }, [mode])

  const layers = (
    <div data-parallax-layers className="ph-layers">
      <div
        data-parallax-layer="1"
        className="ph-layer"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=1600&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
          opacity: 0.12,
          filter: 'saturate(0.5) blur(0.5px)',
        }}
      />
      <div
        data-parallax-layer="2"
        className="ph-layer"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1600&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.08,
          filter: 'saturate(0.3) blur(1px)',
        }}
      />
      <div data-parallax-layer="3" className="ph-layer ph-layer--content">
        {children}
      </div>
      <div
        data-parallax-layer="4"
        className="ph-layer"
        style={{
          background:
            'radial-gradient(ellipse 90% 55% at 50% -5%, rgba(18,75,210,0.07) 0%, transparent 72%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  )

  if (mode === 'divider') {
    return (
      <div ref={wrapperRef} className="ph-divider">
        {layers}
        <div className="ph-fade" />
        <div className="ph-fade-top" />
      </div>
    )
  }

  return (
    <div ref={wrapperRef} className="ph-root">
      <div className="ph-sticky">
        {layers}
        <div className="ph-fade" />
      </div>
    </div>
  )
}
