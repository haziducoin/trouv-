import hubspotLogo    from "@/assets/integrations/HUBSPOT.svg"
import salesforceLogo from "@/assets/integrations/Salesforce.com_logo.svg_clean.png"
import pipedriveLogo  from "@/assets/integrations/pipedrive-logo_clean.png"
import zohoLogo       from "@/assets/integrations/zoho-logo_clean.png"
import brevoLogo      from "@/assets/integrations/Brevo_clean.png"
import lemlistLogo    from "@/assets/integrations/logo-lemlist_clean.png"
import zapierLogo     from "@/assets/integrations/zapier-logo_clean.png"
import ringoverLogo   from "@/assets/integrations/ringover_clean.png"
import aircallLogo    from "@/assets/integrations/LOGO-aircall_clean.png"

const LOGOS = [
  { id: "hubspot",    src: hubspotLogo,    alt: "HubSpot",    height: 32 },
  { id: "salesforce", src: salesforceLogo, alt: "Salesforce", height: 80 },
  { id: "pipedrive",  src: pipedriveLogo,  alt: "Pipedrive",  height: 100 },
  { id: "zoho",       src: zohoLogo,       alt: "Zoho",       height: 100 },
  { id: "brevo",      src: brevoLogo,      alt: "Brevo",      height: 80 },
  { id: "lemlist",    src: lemlistLogo,    alt: "Lemlist",    height: 80 },
  { id: "zapier",     src: zapierLogo,     alt: "Zapier",     height: 80 },
  { id: "ringover",   src: ringoverLogo,   alt: "Ringover",   height: 130 },
  { id: "aircall",    src: aircallLogo,    alt: "Aircall",    height: 80 },
]

export function IntegrationsStrip() {
  return (
    <section className="relative py-14">
      <style>{`
        @keyframes logo-slide {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .logo-track {
          animation: logo-slide 35s linear infinite;
          display: flex;
          align-items: center;
          width: max-content;
          gap: 96px;
        }
      `}</style>

      {/* Header */}
      <div className="mb-8 text-center">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-[#124bd2]">Intégrations</p>
        <p className="text-base text-slate-500">
          Connectez trouvé! à vos outils de prospection préférés
        </p>
      </div>

      {/* Slider */}
      <div
        className="relative overflow-hidden"
        style={{
          maskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >

        <div className="logo-track">
          {/* 2× les logos pour le loop infini */}
          {[...LOGOS, ...LOGOS].map(({ id, src, alt, height }, i) => (
            <img
              key={`${id}-${i}`}
              src={src}
              alt={alt}
              style={{ height: `${height}px`, width: "auto", flexShrink: 0 }}
              className="object-contain opacity-60 hover:opacity-100 transition-opacity"
            />
          ))}
        </div>
      </div>
    </section>
  )
}
