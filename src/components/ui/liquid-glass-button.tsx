"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const liquidbuttonVariants = cva(
  "inline-flex items-center transition-colors justify-center cursor-pointer gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 outline-none",
  {
    variants: {
      variant: {
        default: "bg-transparent hover:scale-105 duration-300 transition text-[#070f22]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:  "h-8 text-xs px-4",
        lg:  "h-12 px-8 text-base",
        xl:  "h-14 px-10 text-lg",
        xxl: "h-16 px-12 text-xl",
        xxxl: "h-20 px-16 text-2xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "xxl",
    },
  }
)

function GlassFilter() {
  return (
    <svg className="hidden">
      <defs>
        <filter id="container-glass" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.05 0.05" numOctaves="1" seed="1" result="turbulence" />
          <feGaussianBlur in="turbulence" stdDeviation="2" result="blurredNoise" />
          <feDisplacementMap in="SourceGraphic" in2="blurredNoise" scale="70" xChannelSelector="R" yChannelSelector="B" result="displaced" />
          <feGaussianBlur in="displaced" stdDeviation="4" result="finalBlur" />
          <feComposite in="finalBlur" in2="finalBlur" operator="over" />
        </filter>
      </defs>
    </svg>
  )
}

export function LiquidButton({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof liquidbuttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn("relative", liquidbuttonVariants({ variant, size, className }))}
      {...props}
    >
      {/* Liquid glass shell */}
      <div className="absolute inset-0 z-0 h-full w-full rounded-full shadow-[0_0_6px_rgba(18,75,210,0.06),0_2px_6px_rgba(18,75,210,0.12),inset_3px_3px_0.5px_-3px_rgba(18,75,210,0.6),inset_-3px_-3px_0.5px_-3px_rgba(18,75,210,0.55),inset_1px_1px_1px_-0.5px_rgba(18,75,210,0.35),inset_-1px_-1px_1px_-0.5px_rgba(18,75,210,0.35),inset_0_0_6px_6px_rgba(18,75,210,0.1),inset_0_0_2px_2px_rgba(18,75,210,0.06),0_0_12px_rgba(255,255,255,0.15)] transition-all" />
      {/* Backdrop blur distortion */}
      <div
        className="absolute inset-0 isolate -z-10 h-full w-full overflow-hidden rounded-full"
        style={{ backdropFilter: 'url("#container-glass")' }}
      />
      <span className="pointer-events-none relative z-10 font-bold">
        {children}
      </span>
      <GlassFilter />
    </Comp>
  )
}
