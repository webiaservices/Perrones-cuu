"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LogoCircle } from "@/components/logo-circle"
import { createClient } from "@/lib/supabase/client"
import { STATUS_LABELS } from "@/lib/constants"

type Reservation = {
  id: string
  status: string
  plan_name: string
  dogs_count: number
  price_mxn: number
  scheduled_at: string | null
  zone: string | null
  walker_id: string | null
  walker_name: string | null
}

export function BuscandoClient({ reservation: initial }: { reservation: Reservation }) {
  const supabase = createClient()
  const [reservation, setReservation] = useState(initial)

  // Polling cada 4s para detectar cuando un paseador acepta
  useEffect(() => {
    if (reservation.status !== "buscando_paseador") return
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("reservations")
        .select("id, status, plan_name, dogs_count, price_mxn, scheduled_at, zone, walker_id")
        .eq("id", reservation.id)
        .single()
      if (data) {
        // Si acaba de asignarse, resolvemos el nombre del paseador
        let walkerName: string | null = reservation.walker_name
        if (data.walker_id && data.walker_id !== reservation.walker_id) {
          const { data: w } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", data.walker_id)
            .single()
          walkerName = w?.full_name ?? null
        }
        setReservation({ ...(data as Reservation), walker_name: walkerName })
      }
    }, 4000)
    return () => clearInterval(t)
  }, [reservation.id, reservation.status, reservation.walker_id, reservation.walker_name, supabase])

  const confirmed = reservation.status === "confirmada" || reservation.status === "en_curso"
  const unassigned = reservation.status === "sin_asignar"

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={true} />

      <main className="flex-1 px-4 py-12 md:py-20">
        <div className="mx-auto max-w-xl">
          <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm md:p-12">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center">
              {confirmed ? (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15">
                  <CheckCircle2 className="h-12 w-12 text-primary" />
                </div>
              ) : unassigned ? (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-destructive/15">
                  <AlertTriangle className="h-12 w-12 text-destructive" />
                </div>
              ) : (
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                  <LogoCircle className="relative h-20 w-20" />
                </div>
              )}
            </div>

            {confirmed && (
              <>
                <h1 className="text-balance text-3xl font-extrabold tracking-tight">¡Paseo confirmado!</h1>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                  {reservation.walker_name
                    ? `${reservation.walker_name} aceptó tu paseo y llegará a la hora acordada.`
                    : "Un paseador de tu zona aceptó tu paseo. Lo verás en tu panel con todos los detalles."}
                </p>
                {reservation.walker_name && (
                  <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary/15 px-4 py-2 text-sm font-bold text-primary">
                    <ShieldCheck className="h-4 w-4" />
                    Paseador: {reservation.walker_name}
                  </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button asChild className="rounded-full font-bold">
                    <Link href="/panel">
                      Ir a mi panel <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </>
            )}

            {!confirmed && !unassigned && (
              <>
                <h1 className="text-balance text-3xl font-extrabold tracking-tight">
                  Estamos enlazándote con un paseador…
                </h1>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                  Una disculpa pero esto puede tardar varios días. Te pedimos de favor que reserves con tiempo de anticipación.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-bold">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Estado: {STATUS_LABELS[reservation.status] ?? reservation.status}
                </div>

                <div className="mt-8 rounded-2xl bg-accent/30 p-4 text-left text-sm">
                  <p className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Tu paseo incluye seguro mientras lo gestiones por Perrones Cuu. Si lo contratas por fuera, ese beneficio no aplica.</span>
                  </p>
                </div>

                <p className="mt-6 text-xs text-muted-foreground">
                  Puedes salir de esta pantalla — te avisaremos por WhatsApp cuando se confirme tu paseo.
                </p>
                <div className="mt-4 flex justify-center">
                  <Button asChild variant="ghost" className="rounded-full">
                    <Link href="/panel">Ir a mi panel</Link>
                  </Button>
                </div>
              </>
            )}

            {unassigned && (
              <>
                <h1 className="text-balance text-3xl font-extrabold tracking-tight">No encontramos paseador disponible</h1>
                <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
                  Notificamos al admin para que reasigne tu paseo manualmente o te proponga otro horario. Te avisamos pronto.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button asChild className="rounded-full font-bold">
                    <Link href="/panel">Ver mi panel</Link>
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
