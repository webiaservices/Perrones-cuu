import { Star } from "lucide-react"

type Review = {
  id: string
  rating: number
  comment: string | null
  author: string
}

const PLACEHOLDERS: Review[] = [
  {
    id: "p1",
    rating: 5,
    comment: "Mi Rocky regresa feliz y cansado. Me encanta recibir la foto al terminar el paseo.",
    author: "María G.",
  },
  {
    id: "p2",
    rating: 5,
    comment: "Súper confiables. Agendar fue facilísimo y siempre llegan puntuales por mi Luna.",
    author: "Carlos R.",
  },
  {
    id: "p3",
    rating: 5,
    comment: "El mejor servicio de paseadores en Chihuahua. Mi perro ya los reconoce y se emociona.",
    author: "Ana L.",
  },
]

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5 estrellas`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={i < rating ? "h-4 w-4 fill-accent text-accent" : "h-4 w-4 text-muted-foreground/30"}
        />
      ))}
    </div>
  )
}

export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const list = reviews.length > 0 ? reviews : PLACEHOLDERS

  return (
    <section id="resenas" className="px-4 py-16 md:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 className="text-pretty text-3xl font-extrabold tracking-tight md:text-4xl">
            Dueños tranquilos lo dicen mejor
          </h2>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Familias de Chihuahua que ya confían en Perrones Cuu.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {list.map((r) => (
            <figure key={r.id} className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-sm">
              <Stars rating={r.rating} />
              <blockquote className="mt-4 flex-1 text-pretty leading-relaxed">
                {r.comment ? `"${r.comment}"` : "Excelente servicio."}
              </blockquote>
              <figcaption className="mt-4 font-bold text-muted-foreground">— {r.author}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
