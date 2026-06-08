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

  const submit = async () => {
    setError(null)
    if (rating < 1) return setError("Selecciona al menos 1 estrella")
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.from("reviews").insert({
      reservation_id: reservation.id,
      owner_id: reservation.user_id,
      walker_id: reservation.walker_id ?? reservation.user_id, // fallback si no hay walker
      rating,
      comment: comment.trim() || null,
    })
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved?.()
    onOpenChange(false)
    setRating(5)
    setComment("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">¿Cómo estuvo el paseo?</DialogTitle>
          <DialogDescription>
            Cuéntanos sobre el paseo de <b>{reservation.dog_name ?? "tu perrito"}</b>. Tu reseña ayuda a otros dueños.
          </DialogDescription>
        </DialogHeader>

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
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-full">
              Cancelar
            </Button>
            <Button onClick={submit} disabled={loading} className="rounded-full font-bold">
              {loading ? "Enviando..." : "Publicar reseña"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
