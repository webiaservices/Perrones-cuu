"use client"

import { useState } from "react"
import { Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { createClient } from "@/lib/supabase/client"

export function ReviewModal({
  open,
  onOpenChange,
  reservation,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  reservation: { id: string; dog_name: string | null; user_id: string; walker_id: string | null }
  onSaved?: () => void
}) {
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Ya se mandó: se enseña el acuse en vez de cerrar de golpe. */
  const [enviada, setEnviada] = useState(false)

  const submit = async () => {
    setError(null)
    if (rating < 1) return setError("Selecciona al menos 1 estrella")
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.from("reviews").insert({
      reservation_id: reservation.id,
      owner_id: reservation.user_id,
      rating,
      comment: comment.trim() || null,
    })
    setLoading(false)
    if (err) {
      // El mensaje de Postgres viene en inglés y con jerga ("new row violates
      // row-level security policy"): a un dueño no le dice nada.
      setError(
        /row-level security|permission denied|JWT/i.test(err.message)
          ? "Su sesión ya venció. Vuelva a entrar y publique su reseña otra vez."
          : /duplicate key/i.test(err.message)
            ? "Ya había dejado una reseña de este paseo. ¡Gracias!"
            : "No se pudo publicar. Revise su internet e inténtelo otra vez.",
      )
      return
    }
    // Las reseñas nacen con approved = false y Endy las aprueba desde su panel.
    // Antes el modal se cerraba en silencio, el dueño no veía su reseña en
    // ningún lado y creía que se había perdido.
    setEnviada(true)
    onSaved?.()
  }

  const cerrar = () => {
    onOpenChange(false)
    setEnviada(false)
    setRating(5)
    setComment("")
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : cerrar())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">¿Cómo estuvo el paseo?</DialogTitle>
          <DialogDescription>
            Cuéntanos sobre el paseo de <b>{reservation.dog_name ?? "tu perrito"}</b>. Tu reseña ayuda a otros dueños.
          </DialogDescription>
        </DialogHeader>

        {enviada ? (
          /* Acuse. Sin esto el dueño publicaba, el modal se cerraba y su reseña
             no aparecía en ningún lado — porque falta que Endy la apruebe. */
          <div className="space-y-4 py-4 text-center">
            <p className="text-4xl">⭐</p>
            <p className="font-display text-xl font-extrabold">¡Gracias por su reseña!</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ya nos llegó. La revisamos antes de publicarla en la página, así que tarda un poco en aparecer. No
              tiene que volver a mandarla.
            </p>
            <Button onClick={cerrar} className="rounded-full font-bold">
              Cerrar
            </Button>
          </div>
        ) : (
        <div className="space-y-5 py-2">
          {/* Estrellas */}
          <div className="flex items-center justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-10 w-10 ${
                    n <= (hover || rating)
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground"
                  }`}
                />
              </button>
            ))}
          </div>

          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Qué tal el paseador? ¿Cómo trataron a tu perrito? (opcional)"
            className="min-h-24"
          />

          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={cerrar} disabled={loading} className="rounded-full">
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading} className="rounded-full font-bold">
              {loading ? "Enviando..." : "Publicar reseña"}
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
