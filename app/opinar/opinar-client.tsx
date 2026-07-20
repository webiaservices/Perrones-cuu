"use client"

import { useState } from "react"
import Link from "next/link"
import { Star, PawPrint, Check, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { createClient } from "@/lib/supabase/client"

export function OpinarClient({ defaultName }: { defaultName: string }) {
  const supabase = createClient()
  const [name, setName] = useState(defaultName)
  const [dog, setDog] = useState("")
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  // Honeypot anti-bots: si se llena, ignoramos el envío en silencio
  const [website, setWebsite] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async () => {
    setError(null)
    if (website) { setDone(true); return } // bot: fingimos éxito y no guardamos
    if (!name.trim()) return setError("Pon tu nombre para la reseña.")
    if (rating < 1) return setError("Selecciona al menos 1 estrella.")
    if (comment.trim().length < 10) return setError("Escribe un poco más en tu comentario (mínimo 10 letras).")

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return setError("Tu sesión expiró. Vuelve a iniciar sesión.")
    }
    const { error: err } = await supabase.from("reviews").insert({
      owner_id: user.id,
      reviewer_name: name.trim(),
      dog_name: dog.trim() || null,
      rating,
      comment: comment.trim(),
      approved: false, // el admin la revisa antes de que aparezca en la página
    })
    setLoading(false)
    if (err) return setError(err.message)
    setDone(true)
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={true} />
      <main className="flex-1 px-4 py-10 md:py-16">
        <div className="mx-auto max-w-xl">
          {done ? (
            <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm md:p-12">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15">
                <Check className="h-10 w-10 text-primary" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight">¡Gracias por tu reseña! 🐶</h1>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                La revisamos rapidito y en cuanto la aprobemos aparecerá en la página. ¡Se agradece un montón!
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button asChild className="rounded-full font-bold">
                  <Link href="/panel">Ir a mi panel</Link>
                </Button>
                <Button asChild variant="ghost" className="rounded-full">
                  <Link href="/">Volver al inicio</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-10">
              <header className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/40">
                  <PawPrint className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight">Deja tu reseña</h1>
                  <p className="text-sm text-muted-foreground">Cuéntanos cómo te fue con Perrones Cuu.</p>
                </div>
              </header>

              <div className="space-y-5">
                {/* Estrellas */}
                <div className="space-y-1.5">
                  <Label>¿Qué tal estuvo? *</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRating(n)}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        className="transition-transform hover:scale-110"
                        aria-label={`${n} estrellas`}
                      >
                        <Star className={`h-9 w-9 ${n <= (hover || rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Tu nombre *</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. María G." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dog">Nombre de tu perrito (opcional)</Label>
                    <Input id="dog" value={dog} onChange={(e) => setDog(e.target.value)} placeholder="Ej. Rocky" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="comment">Tu comentario *</Label>
                  <Textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="¿Cómo trataron a tu perrito? ¿Qué te gustó del servicio?"
                    className="min-h-28"
                  />
                </div>

                {/* Honeypot invisible para bots */}
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="hidden"
                  aria-hidden="true"
                />

                {error && (
                  <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>
                )}

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                  <Button asChild variant="ghost" className="rounded-full">
                    <Link href="/panel"><ArrowLeft className="h-4 w-4" /> Volver</Link>
                  </Button>
                  <Button onClick={submit} disabled={loading} className="rounded-full font-bold">
                    {loading ? "Enviando..." : "Publicar reseña"}
                  </Button>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Tu reseña aparece en la página después de que la aprobemos.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
