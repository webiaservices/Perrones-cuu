"use client"

const DOGS = [
  { src: "/dogs/dog1.jpg", name: "Toby", breed: "Golden Retriever" },
  { src: "/dogs/dog2.jpg", name: "Nala", breed: "Chihuahua" },
  { src: "/dogs/dog3.jpg", name: "Rocky", breed: "Labrador" },
  { src: "/dogs/dog4.jpg", name: "Lola", breed: "Bulldog Francés" },
  { src: "/dogs/dog5.jpg", name: "Max", breed: "Border Collie" },
  { src: "/dogs/dog6.jpg", name: "Coco", breed: "Beagle" },
  { src: "/dogs/dog7.jpg", name: "Luna", breed: "Pastor Australiano" },
  { src: "/dogs/dog8.jpg", name: "Pelusa", breed: "Corgi" },
]

export function DogCarousel() {
  const loop = [...DOGS, ...DOGS]

  return (
    <section className="relative overflow-hidden bg-secondary/40 py-16 md:py-20">
      <div className="mx-auto mb-10 max-w-6xl px-4 text-center">
        <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-primary">
          Nuestros clientes favoritos
        </p>
        <h2 className="font-display text-pretty text-3xl font-extrabold tracking-tight md:text-4xl">
          Cientos de paseos felices en Chihuahua
        </h2>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-secondary/60 to-transparent md:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-secondary/60 to-transparent md:w-32" />

        <div className="flex w-max gap-5 px-5 [animation:marquee_40s_linear_infinite] hover:[animation-play-state:paused]">
          {loop.map((dog, i) => (
            <div
              key={i}
              className="group relative h-64 w-52 flex-shrink-0 overflow-hidden rounded-3xl border border-border shadow-md md:h-72 md:w-60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={dog.src || "/placeholder.svg"}
                alt={`${dog.name}, un ${dog.breed} feliz tras su paseo`}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/85 to-transparent p-4">
                <p className="text-lg font-extrabold leading-tight text-background">{dog.name}</p>
                <p className="text-xs font-semibold text-background/80">{dog.breed}</p>
              </div>
            </div>
          ))}
        </div>
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
