import { Hero } from "@/components/ui/animated-hero"
import { Button } from "@/components/ui/button"
import { ArrowRight, Phone, Search, Sparkles } from "lucide-react"

export default function PreviewPage() {
  return (
    <div className="min-h-screen bg-[#f5f8ff] font-sans">

      {/* ── Section 1 : Animated Hero ─────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#1B54FF]">
            Preview — animated-hero.tsx
          </span>
        </div>
        <Hero
          onGetStarted={() => alert("→ onGetStarted")}
          onContactSales={() => alert("→ onContactSales")}
        />
      </section>

      {/* ── Section 2 : Button variants ────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="mb-8">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#1B54FF]">
            Preview — button.tsx
          </span>
        </div>

        <div className="grid gap-8">

          {/* Variants */}
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">Variants</p>
            <div className="flex flex-wrap gap-3">
              <Button variant="default" className="gap-2">
                <Sparkles className="h-4 w-4" /> Default
              </Button>
              <Button variant="outline" className="gap-2">
                <Search className="h-4 w-4" /> Outline
              </Button>
              <Button variant="secondary" className="gap-2">
                Secondary
              </Button>
              <Button variant="ghost" className="gap-2">
                Ghost
              </Button>
              <Button variant="link" className="gap-2">
                Link
              </Button>
              <Button variant="destructive">Destructive</Button>
            </div>
          </div>

          {/* Sizes */}
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">Sizes</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg" className="gap-2">
                Large <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Real CTAs */}
          <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
            <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">CTAs trouvé!</p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="gap-3 rounded-full px-8">
                Essayer gratuitement <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-3 rounded-full px-8">
                <Phone className="h-4 w-4" /> Parler à un expert
              </Button>
            </div>
          </div>

        </div>
      </section>
    </div>
  )
}
