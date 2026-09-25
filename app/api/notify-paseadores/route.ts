import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"
import { anunciarVacante } from "@/lib/vacantes"

/**
 * Anuncia una vacante a los paseadores (ola 1). Lo llama el botón
 * "Hacer público" del admin. Toda la lógica —quién, por qué canal, oleadas y
 * candados— vive en lib/vacantes.ts.
 *
 * Solo el admin. Antes también podía llamarla el dueño de la reserva, sin
 * límite: cada llamada eran ~62 WhatsApp pagados. Hoy las reservas del sitio
 * nacen privadas, así que el dueño nunca la necesita.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { reservationId } = await req.json().catch(() => ({}))
    if (!reservationId) {
      return NextResponse.json({ error: "reservationId requerido" }, { status: 400 })
    }
    if (!caller.isAdmin) {
      // Sin error visible para el cliente: su reserva sigue su curso normal
      return NextResponse.json({ notified: 0, reason: "solo el admin anuncia vacantes" })
    }

    const admin = createAdminClient()
    const resumen = await anunciarVacante(admin, reservationId, "publicar")
    return NextResponse.json({
      ...resumen,
      // Compatibilidad con quien leía estos nombres
      notified: resumen.push + resumen.whatsapp + resumen.correo,
      reason: resumen.motivo,
    })
  } catch (e: unknown) {
    console.error("notify-paseadores error:", e)
    const msg = e instanceof Error ? e.message : "Error desconocido"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
