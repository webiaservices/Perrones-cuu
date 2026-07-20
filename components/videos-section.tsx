"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles } from "lucide-react"

/**
 * Sección de videos en carrusel infinito horizontal (estilo marquee).
 * Los videos van rotando de izquierda a derecha sin pausa.
 */
type VideoItem = {
  title: string
  caption?: string
  src: string
}

const VIDEOS: VideoItem[] = [
  { title: "Paseo en Chihuahua", caption: "Perrones Cuu", src: "/videos/paseo1.mp4" },
  { title: "De paseo con Perrones", caption: "Mañana feliz", src: "/videos/paseo2.mp4" },
  { title: "Aventura de tarde", caption: "Energía al máximo", src: "/videos/paseo3.mp4" },
  { title: "Camino a casa", caption: "Misión cumplida", src: "/videos/paseo4.mp4" },
  { title: "Paseo grupal", caption: "Cuu time", src: "/videos/paseo5.mp4" },
  { title: "Trote diario", caption: "Energía perfecta", src: "/videos/paseo6.mp4" },
  { title: "Última vuelta", caption: "Antes de dormir", src: "/videos/paseo7.mp4" },
]

export function VideosSection() {
  // Duplicamos para que el loop infinito se vea continuo
  const loop = [...VIDEOS, ...VIDEOS]

  return (
    <section className="relative overflow-hidden bg-secondary/40 py-16 md:py-24">
      {/* Halo decorativo */}
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 animate-blob rounded-full bg-primary/10 blur-3xl" />

      <div className="relative">
        <div className="mx-auto mb-12 max-w-2xl px-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
            <Sparkles className="h-3 w-3" />
            En vivo
          </span>
          <h2 className="mt-3 font-display text-pretty text-3xl font-extrabold tracking-tight md:text-4xl">
            Míralo en acción
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Videos reales de nuestros perritos disfrutando sus paseos por Chihuahua.
          </p>
        </div>

        {/* Carrusel infinito horizontal */}
        <div className="relative">
          {/* Fades en los bordes para suavizar */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-secondary/60 to-transparent md:w-32" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-secondary/60 to-transparent md:w-32" />

          <div className="flex w-max gap-5 px-5 [animation:marquee_80s_linear_infinite] hover:[animation-play-state:paused]">
            {loop.map((v, i) => (
              <VideoCard key={i} video={v} />
            ))}
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          💚 Pasa el cursor para pausar · Los videos los suben los paseadores tras cada paseo.
        </p>
      </div>

      <style jsx global>{`
        @keyframes marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </section>
  )
}

function VideoCard({ video }: { video: VideoItem }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [active, setActive] = useState(false)

  // Solo carga/reproduce cuando la tarjeta está (casi) en pantalla.
  // Así los 16MB de video no se descargan de golpe al abrir la página.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => setActive(entry.isIntersecting),
      { rootMargin: "300px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (active) {
      if (!v.src) v.src = video.src // descarga solo al entrar a la vista
      v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [active, video.src])

  return (
    <div
      ref={boxRef}
      className="hover-lift group relative aspect-[9/16] w-52 shrink-0 overflow-hidden rounded-3xl border border-border bg-secondary shadow-md md:w-60"
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        loop
        muted
        playsInline
        preload="none"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
        <p className="text-sm font-extrabold text-white">{video.title}</p>
        {video.caption && <p className="text-xs text-white/80">{video.caption}</p>}
      </div>
    </div>
  )
}
