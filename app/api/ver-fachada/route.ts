import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"

/**
 * Devuelve un link temporal para ver la foto de la fachada.
 *
 * La regla que hay que respetar: la ve el DUEÑO, el ADMIN y **solo el paseador
 * que ya tiene asignado ese paseo**. Un paseador que apenas está viendo el
 * paseo disponible NO la ve — si no, cualquiera del equipo tendría la foto de
 * la casa de todos los clientes.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 })

    const reservationId = req.nextUrl.searchParams.get("reservationId") ?? ""
    if (!/^[0-9a-f-]{36}$/i.test(reservationId)) {
      return NextResponse.json({ error: "Reserva inválida" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: reserva } = await admin
      .from("reservations")
      .select("user_id, walker_id, house_photo_path")
      .eq("id", reservationId)
      .maybeSingle()

    if (!reserva?.house_photo_path) {
      return NextResponse.json({ error: "Ese paseo no tiene foto de la casa." }, { status: 404 })
    }

    const esDueno = reserva.user_id === caller.id
    const esSuPaseo = reserva.walker_id === caller.id
    if (!esDueno && !esSuPaseo && !caller.isAdmin) {
      return NextResponse.json(
        { error: "Solo el paseador asignado a este paseo puede ver la foto." },
        { status: 403 },
      )
    }

    // 10 minutos: alcanza para llegar, corto para que no ande circulando
    const { data, error } = await admin.storage
      .from("fachadas")
      .createSignedUrl(reserva.house_photo_path, 600)
    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: error?.message ?? "No se pudo abrir" }, { status: 500 })
    }

    return NextResponse.json({ url: data.signedUrl })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
