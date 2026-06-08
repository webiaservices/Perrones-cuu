"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type RevealProps = {
  children: ReactNode
  delay?: number
  from?: "bottom" | "left" | "right" | "scale"
  className?: string
}

/**
 * Anima sus hijos cuando entran al viewport.
 * - `from`: dirección desde la que aparece
 * - `delay`: ms antes de animar (para escalonar varios)
 */
export function Reveal({ children, delay = 0, from = "bottom", className }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Respeta prefers-reduced-motion
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true)
            obs.disconnect()
            break
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const initial = {
    bottom: "translate-y-8",
    left: "-translate-x-8",
    right: "translate-x-8",
    scale: "scale-95",
  }[from]

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible ? "translate-x-0 translate-y-0 scale-100 opacity-100 blur-0" : `${initial} opacity-0 blur-[2px]`,
        className,
      )}
    >
      {children}
    </div>
  )
}
