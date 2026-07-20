import Link from "next/link"
import {
  PawPrint,
  CalendarHeart,
  MapPin,
  ArrowRight,
  MessageCircle,
  ShieldCheck,
  Camera,
  Navigation,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LogoCircle } from "@/components/logo-circle"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { PricingSection } from "@/components/pricing-section"
import { VideosSection } from "@/components/videos-section"
import { BRAND } from "@/lib/constants"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Reveal } from "@/components/reveal"

const STEPS = [
  {
    icon: PawPrint,
    title: "Registra a tu perro",
    text: "Cuéntanos su nombre, raza y tamaño. Si tiene alguna necesidad especial, la anotamos.",
  },
  {
    icon: CalendarHeart,
    title: "Elige día y horario",
    text: "Tú decides cuándo y dónde recogemos a tu perrito. Agenda en segundos desde tu teléfono.",
  },
  {
    icon: MapPin,
    title: "Te enlazamos con un paseador",
    text: "Te asignamos un operador verificado de tu zona. Recibes foto y reporte al terminar.",
  },
]

// Testimonios de respaldo si la DB todavía no tiene reseñas reales
const FALLBACK_TESTIMONIOS = [
  {
    text: "Bruno llega a casa agotado y feliz cada vez. El reporte con fotos me encanta.",
    name: "Lorena M.",
    dog: "Bruno (Labrador, 3 años)",
  },
  {
    text: "Pensé que Nala era muy nerviosa para los paseos. La tienen como embajadora del grupo.",
    name: "Rodrigo V.",
    dog: "Nala (Chihuahua, 5 años)",
  },
  {
    text: "Dos perros y ningún problema. Los manejan como si fueran suyos. 100% recomendados.",
    name: "Fernanda Q.",
    dog: "Max & Luna (Golden Retrievers)",
  },
]

async function getRealReviews() {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("reviews")
      .select("rating, comment, reviewer_name, dog_name, profiles:owner_id(full_name), reservations:reservation_id(dog_name)")
      .eq("approved", true) // solo las que el admin ya aprobó
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      .limit(3)
    return (data ?? [])
      .filter((r: { comment: string | null }) => r.comment && r.comment.length > 5)
      .map((r) => {
        const profile = r.profiles as unknown as { full_name: string | null } | null
        const reservation = r.reservations as unknown as { dog_name: string | null } | null
        return {
          text: r.comment ?? "",
          // nombre/perro escritos en la reseña; si no, del perfil/paseo
          name: (r.reviewer_name as string | null) ?? profile?.full_name ?? "Cliente",
          dog: (r.dog_name as string | null) ?? reservation?.dog_name ?? "",
        }
      })
  } catch {
    return []
  }
}

export default async function HomePage() {
  const realReviews = await getRealReviews()
  // Mezclamos: primero las reales, después fallback hasta completar 3
  const TESTIMONIOS = realReviews.length >= 3
    ? realReviews
    : [...realReviews, ...FALLBACK_TESTIMONIOS].slice(0, 3)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={!!user} />

      <main className="flex-1">
        {/* Hero */}
        <section className="paw-bg relative overflow-hidden px-4 pb-16 pt-12 md:pt-20">
          {/* Halos suaves de fondo */}
          <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 animate-blob rounded-full bg-accent/30 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute top-40 -right-32 h-[28rem] w-[28rem] animate-blob rounded-full bg-primary/15 blur-3xl" style={{ animationDelay: "3s" }} />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 md:grid-cols-2">
            <Reveal from="left">
              <span className="inline-flex items-center gap-2 rounded-full bg-accent/60 px-4 py-1.5 text-sm font-bold text-accent-foreground transition-transform hover:scale-105">
                <MapPin className="h-4 w-4" />
                {BRAND.city}
              </span>
              <h1 className="mt-6 font-display text-balance text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">
                <span className="block text-foreground">Perros felices,</span>
                <span className="block text-primary">dueños tranquilos.</span>
              </h1>
              <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
                Paseadores certificados que aman los perros tanto como tú. En Chihuahua, a un mensaje de distancia.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center md:justify-start">
                <Button asChild size="lg" className="shine group h-12 rounded-full px-7 text-base font-bold transition-transform hover:scale-[1.03] active:scale-[0.97]">
                  <Link href="/reservar">
                    Agenda tu paseo
                    <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="h-12 rounded-full border-primary/40 bg-transparent px-7 text-base font-bold text-primary transition-all hover:scale-[1.03] hover:bg-primary/5 active:scale-[0.97]"
                >
                  <Link href="/signup?role=paseador">Únete al equipo</Link>
                </Button>
              </div>

              {/* Stats */}
              <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center md:justify-start">
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-amber-400 text-amber-400 transition-transform hover:scale-125"
                        style={{ transitionDelay: `${i * 30}ms` }}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold">
                    4.9 <span className="font-normal text-muted-foreground">(248 reseñas)</span>
                  </span>
                </div>
                <div className="hidden h-4 w-px bg-border sm:block" />
                <div className="flex items-center gap-2 text-sm font-bold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Paseadores verificados
                </div>
              </div>
            </Reveal>

            <Reveal from="right" delay={120}>
              <div className="relative mx-auto flex aspect-square w-full max-w-[520px] items-center justify-center">
                {/* Anillos dashed concéntricos */}
                <div aria-hidden className="absolute inset-0 rounded-full border-2 border-dashed border-primary/30 ring-rotate" />
                <div aria-hidden className="absolute inset-[8%] rounded-full border-2 border-dashed border-primary/20 ring-rotate-reverse" />
                <div aria-hidden className="absolute inset-[18%] rounded-full border border-dashed border-primary/15 ring-rotate" />

                {/* Logo gigante con float sutil */}
                <div className="relative z-10 animate-soft-float">
                  <LogoCircle className="h-[280px] w-[280px] md:h-[360px] md:w-[360px]" />
                </div>

                {/* Tarjeta flotante GPS — arriba derecha */}
                <div className="hover-lift absolute right-0 top-[10%] z-20 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl md:right-[-5%]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                    <Navigation className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-extrabold leading-tight">GPS en tiempo real</p>
                    <p className="text-xs text-muted-foreground">Siempre ubicado</p>
                  </div>
                </div>

                {/* Tarjeta flotante Foto — abajo izquierda */}
                <div className="hover-lift absolute bottom-[12%] left-0 z-20 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xl md:left-[-5%]">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15">
                    <Camera className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-extrabold leading-tight">Foto al terminar</p>
                    <p className="text-xs text-muted-foreground">Siempre sonriendo</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Marquee */}
        <section className="overflow-hidden border-y border-border/60 bg-secondary/40 py-4">
          <div className="flex animate-marquee whitespace-nowrap gap-10 text-sm font-bold text-muted-foreground">
            {Array.from({ length: 2 }).map((_, k) => (
              <div key={k} className="flex shrink-0 items-center gap-10">
                <span>Perros felices, dueños tranquilos</span>
                <span>·</span>
                <span>Paseos seguros</span>
                <span>·</span>
                <span>4.9 estrellas</span>
                <span>·</span>
                <span>Paseadores verificados</span>
                <span>·</span>
                <span>Foto y reporte al terminar</span>
                <span>·</span>
                <span>GPS en tiempo real</span>
                <span>·</span>
                <span>Razas de todo tipo</span>
                <span>·</span>
              </div>
            ))}
          </div>
        </section>

        {/* Videos reales (placeholders por ahora — el cliente sube los videos) */}
        <Reveal>
          <VideosSection />
        </Reveal>

        {/* Cómo funciona */}
        <section id="como-funciona" className="px-4 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <div className="mx-auto mb-12 max-w-2xl text-center">
                <span className="inline-block rounded-full bg-accent/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                  Así de fácil
                </span>
                <h2 className="mt-3 font-display text-pretty text-3xl font-extrabold tracking-tight md:text-4xl">
                  Reservar un paseo toma <em className="not-italic gradient-text">menos de un minuto.</em>
                </h2>
              </div>
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <Reveal key={step.title} delay={i * 140}>
                  <div className="hover-lift group relative flex h-full flex-col items-center rounded-3xl border border-border bg-card p-7 text-center shadow-sm">
                    <span className="absolute -top-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground transition-transform group-hover:scale-110">
                      0{i + 1}
                    </span>
                    <div className="mt-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/40 transition-all duration-500 group-hover:bg-accent group-hover:rotate-6">
                      <step.icon className="h-7 w-7 text-primary transition-transform duration-500 group-hover:scale-110" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <PricingSection />

        {/* Testimonios */}
        <section id="resenas" className="bg-secondary/40 px-4 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <div className="mx-auto mb-12 max-w-2xl text-center">
                <span className="inline-block rounded-full bg-accent/40 px-3 py-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                  Lo que dicen
                </span>
                <h2 className="mt-3 font-display text-pretty text-3xl font-extrabold tracking-tight md:text-4xl">
                  Sus perros lo dirían <em className="not-italic gradient-text">por ellos si pudieran.</em>
                </h2>
              </div>
            </Reveal>
            <div className="grid gap-6 md:grid-cols-3">
              {TESTIMONIOS.map((t, i) => (
                <Reveal key={t.name} delay={i * 140} from="scale">
                  <div className="hover-lift group flex h-full flex-col rounded-3xl border border-border bg-card p-6 shadow-sm">
                    <div className="mb-3 flex">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <Star
                          key={i}
                          className="h-4 w-4 fill-primary text-primary transition-transform group-hover:scale-110"
                          style={{ transitionDelay: `${i * 40}ms` }}
                        />
                      ))}
                    </div>
                    <p className="text-pretty leading-relaxed">&ldquo;{t.text}&rdquo;</p>
                    <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/40 text-sm font-extrabold text-accent-foreground transition-transform group-hover:scale-110">
                        {t.name
                          .split(" ")
                          .map((s) => s[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="text-sm leading-tight">
                        <p className="font-bold">{t.name}</p>
                        <p className="text-muted-foreground">{t.dog}</p>
                      </div>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="mt-10 text-center">
              <p className="mb-3 text-sm text-muted-foreground">¿Ya paseaste con nosotros?</p>
              <Button asChild variant="outline" className="rounded-full font-bold">
                <Link href="/opinar">Deja tu reseña ⭐</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="px-4 py-16 md:py-24">
          <Reveal from="scale">
            <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] bg-primary px-6 py-14 text-center text-primary-foreground shadow-lg">
              {/* Blobs decorativos dentro del CTA */}
              <div aria-hidden className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 animate-blob rounded-full bg-primary-foreground/10 blur-3xl" />
              <div aria-hidden className="pointer-events-none absolute -bottom-20 -right-20 h-80 w-80 animate-blob rounded-full bg-accent/20 blur-3xl" style={{ animationDelay: "2s" }} />

              <div className="relative">
                <h2 className="text-balance text-3xl font-extrabold tracking-tight md:text-4xl">
                  Tu perro ya quiere salir.
                </h2>
                <p className="mt-3 text-pretty text-lg leading-relaxed text-primary-foreground/90">
                  Únete a más de 300 dueños en Chihuahua que confían en Perrones para mantener a sus perritos activos y
                  felices.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Button
                    asChild
                    size="lg"
                    variant="secondary"
                    className="shine h-12 rounded-full px-7 text-base font-bold transition-transform hover:scale-105 active:scale-95"
                  >
                    <Link href="/signup">Registrarme gratis</Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 rounded-full border-primary-foreground/40 bg-transparent px-7 text-base font-bold text-primary-foreground transition-all hover:scale-105 hover:bg-primary-foreground/10 hover:text-primary-foreground active:scale-95"
                  >
                    <a href={BRAND.whatsappLink} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-5 w-5" />
                      Hablar por WhatsApp
                    </a>
                  </Button>
                </div>
                <p className="mt-6 text-sm text-primary-foreground/80">WhatsApp directo: +52 614 594 8513</p>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
