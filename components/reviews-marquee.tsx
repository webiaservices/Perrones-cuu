"use client"

import { Star } from "lucide-react"

type Testimonio = { text: string; name: string; dog: string }

/**
 * Reseñas rotando en carrusel horizontal continuo (estilo Google/marquee).
 * Se muestran TODAS las aprobadas, girando de derecha a izquierda; se pausa
 * al pasar el cursor. Si hay pocas, igual se ve lleno porque duplicamos.
 */
export function ReviewsMarquee({ reviews }: { reviews: Testimonio[] }) {
  // Duplicamos para que el loop se vea continuo (sin huecos)
  const loop = [...reviews, ...reviews]
  // Un poco más rápido entre menos tarjetas haya; tope para que no vuele
  const durationS = Math.min(60, Math.max(24, reviews.length * 7))

  return (
    <div className="relative">
      {/* Difuminado en los bordes */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-secondary/60 to-transparent md:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-secondary/60 to-transparent md:w-28" />

      {/* Sin padding ni gap en el nodo animado: el espacio va como margin-right
          en cada tarjeta (incluida la última) para que el -50% cierre exacto y
          el loop no dé brinquitos */}
      <div
        className="flex w-max hover:[animation-play-state:paused]"
        style={{ animation: `reviews-marquee ${durationS}s linear infinite` }}
      >
        {loop.map((t, i) => (
          <figure
            key={i}
            className="mr-6 flex h-full w-[300px] shrink-0 flex-col rounded-3xl border border-border bg-card p-6 shadow-sm md:w-[340px]"
          >
            <div className="mb-3 flex">
              {[0, 1, 2, 3, 4].map((s) => (
                <Star key={s} className="h-4 w-4 fill-primary text-primary" />
              ))}
            </div>
            <blockquote className="flex-1 text-pretty leading-relaxed">&ldquo;{t.text}&rdquo;</blockquote>
            <figcaption className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/40 text-sm font-extrabold text-accent-foreground">
                {t.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
              </div>
              <div className="text-sm leading-tight">
                <p className="font-bold">{t.name}</p>
                {t.dog && <p className="text-muted-foreground">{t.dog}</p>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      <style jsx global>{`
        @keyframes reviews-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  )
}
