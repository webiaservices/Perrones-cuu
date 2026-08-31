import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCaller } from "@/lib/api-auth"

/**
 * Guarda la foto de la fachada del domicilio de una reserva.
 *
 * Es información privada: sirve para que el paseador encuentre la casa, nada
 * más. Va a un bucket PRIVADO y solo la puede ver el paseador que YA tiene
 * asignado ese paseo (ver /api/ver-fachada), nunca el resto del equipo.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller()
    if (!caller) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 })

    const form = await req.formData()
    const reservationId = String(form.get("reservationId") ?? "")
    const file = form.get("file")

    if (!reservationId || !(file instanceof File)) {
      return NextResponse.json({ error: "Falta la reserva o la foto" }, { status: 400 })
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "La foto pesa más de 5 MB. Toma una más ligera." }, { status: 400 })
    }
    if (!/^image\//.test(file.type)) {
      return NextResponse.json({ error: "Tiene que ser una foto." }, { status: 400 })
    }

    const admin = createAdminClient()

    // Solo el dueño de la reserva (o el admin) puede subirle foto
    const { data: reserva } = await admin
      .from("reservations")
      .select("id, user_id, package_id")
      .eq("id", reservationId)
      .maybeSingle()
    if (!reserva) return NextResponse.json({ error: "Esa reserva no existe" }, { status: 404 })
    if (reserva.user_id !== caller.id && !caller.isAdmin) {
      return NextResponse.json({ error: "Esa reserva no es tuya" }, { status: 403 })
    }

    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "")
    const ruta = `${reserva.user_id}/${reservationId}.${ext}`
    const { error: upErr } = await admin.storage
      .from("fachadas")
      .upload(ruta, file, { upsert: true, contentType: file.type })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    // Si es paquete, la misma foto vale para todos los días
    const query = admin.from("reservations").update({ house_photo_path: ruta })
    const { error: dbErr } = reserva.package_id
      ? await query.eq("package_id", reserva.package_id)
      : await query.eq("id", reservationId)
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
