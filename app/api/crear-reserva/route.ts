import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { PLANS, priceForDogs } from "@/lib/constants"

/**
 * Crea la reserva del lado del SERVIDOR.
 * El precio se calcula aquí con la matriz oficial de planes — antes el
 * navegador mandaba el precio directo a la base y cualquier cliente podía
 * insertarse un "Paseo VIP" a $1 desde la consola del navegador.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const planId = String(body.planId ?? "")
    const dogIds: unknown = body.dogIds
    const slots: unknown = body.slots
    const zone = String(body.zone ?? "").trim()
    const pickupAddress = String(body.pickupAddress ?? "").trim()
    const tripNotes = String(body.tripNotes ?? "").trim()
    const acceptedResponsibility = body.acceptedResponsibility === true

    // 1. Autenticación por cookies de sesión
    const supa = await createClient()
    const {
      data: { user },
    } = await supa.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, { status: 401 })
    }

    // 2. Validaciones de negocio
    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) return NextResponse.json({ error: "Plan inválido" }, { status: 400 })

    if (!Array.isArray(dogIds) || dogIds.length < 1) {
      return NextResponse.json({ error: "Selecciona al menos un perro para el paseo." }, { status: 400 })
    }
    if (dogIds.length > 3) {
      return NextResponse.json({ error: "Máximo 3 perritos por paseo. Para más, contáctanos por WhatsApp." }, { status: 400 })
    }
    if (!acceptedResponsibility) {
      return NextResponse.json({ error: "Confirma que entiendes la garantía de Perrones Cuu." }, { status: 400 })
    }
    if (!zone || !pickupAddress) {
      return NextResponse.json({ error: "Llena zona y dirección de recogida." }, { status: 400 })
    }

    const walksCount = Math.max(1, plan.walksCount ?? 1)
    if (!Array.isArray(slots) || slots.length !== walksCount) {
      return NextResponse.json({ error: `Este plan necesita ${walksCount} fecha(s) de paseo.` }, { status: 400 })
    }
    const seenDates = new Set<string>()
    for (const s of slots as { date?: unknown; startHour?: unknown }[]) {
      const date = String(s?.date ?? "")
      const hour = String(s?.startHour ?? "")
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hour)) {
        return NextResponse.json({ error: "Fecha u hora inválida." }, { status: 400 })
      }
      const h = parseInt(hour.slice(0, 2), 10)
      if (h < 7 || h > 20) {
        return NextResponse.json({ error: "Los paseos son entre 07:00 y 20:00." }, { status: 400 })
      }
      if (seenDates.has(date)) {
        return NextResponse.json({ error: "Elegiste la misma fecha dos veces — cada paseo va en un día distinto." }, { status: 400 })
      }
      seenDates.add(date)
    }

    // 3. Los perros deben ser del usuario (RLS del cliente lo garantiza)
    const { data: dogs } = await supa
      .from("dogs")
      .select("id, name, size, special_needs")
      .in("id", dogIds as string[])
    if (!dogs || dogs.length !== (dogIds as string[]).length) {
      return NextResponse.json({ error: "Uno de los perros seleccionados no existe. Recarga la página." }, { status: 400 })
    }

    // 4. Precio OFICIAL calculado en el servidor
    const price = priceForDogs(plan, dogs.length)

    const dogNames = dogs.map((d) => d.name).join(", ")
    const dogSizes = dogs.map((d) => d.size).filter(Boolean).join("/")
    const dogSpecialNeeds = dogs.map((d) => d.special_needs).filter(Boolean).join(". ")
    const baseNotes = `${dogs.length === 1 ? "Perro" : "Perros"}: ${dogNames}${dogSpecialNeeds ? `. ${dogSpecialNeeds}` : ""}`
    const notes = tripNotes ? `${baseNotes}. Notas del paseo: ${tripNotes}` : baseNotes

    // 5. Timestamps: el server corre en UTC — la fecha/hora que eligió el
    // cliente es hora de Chihuahua (UTC-6 fijo, sin horario de verano)
    const typedSlots = slots as { date: string; startHour: string }[]
    const ordered = [...typedSlots].sort(
      (a, b) =>
        new Date(`${a.date}T${a.startHour}:00-06:00`).getTime() -
        new Date(`${b.date}T${b.startHour}:00-06:00`).getTime(),
    )
    const nowMs = Date.now()
    for (const s of ordered) {
      if (new Date(`${s.date}T${s.startHour}:00-06:00`).getTime() < nowMs - 5 * 60 * 1000) {
        return NextResponse.json({ error: `La fecha ${s.date} a las ${s.startHour} ya pasó. Elige una fecha futura.` }, { status: 400 })
      }
    }

    const packageId = walksCount > 1 ? crypto.randomUUID() : null
    const rows = ordered.map((slot, i) => {
      const at = new Date(`${slot.date}T${slot.startHour}:00-06:00`)
      const until = new Date(at.getTime() + 60 * 60 * 1000)
      return {
        user_id: user.id,
        plan_name: plan.name,
        dogs_count: dogs.length,
        price_mxn: i === 0 ? price : 0,
        status: "buscando_paseador",
        notes: i === 0 ? notes : `${notes}${notes ? " · " : ""}Paseo ${i + 1} de ${walksCount} del paquete "${plan.name}"`,
        scheduled_at: at.toISOString(),
        scheduled_until: until.toISOString(),
        zone,
        pickup_address: pickupAddress,
        dog_name: dogNames,
        dog_size: dogSizes,
        dog_notes: dogSpecialNeeds,
        dog_id: dogs[0]?.id ?? null,
        visibility: "public",
        payment_status: "pendiente",
        responsibility_accepted: true,
        admin_fee_mxn: null, // null = comisión 30% automática
        package_id: packageId,
        package_index: walksCount > 1 ? i + 1 : null,
        package_total: walksCount > 1 ? walksCount : null,
      }
    })

    // 6. Insert con service role (el insert directo del navegador queda cerrado por RLS)
    const admin = createAdminClient()
    const { data, error } = await admin.from("reservations").insert(rows).select("id")
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No se creó la reserva" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, ids: data.map((r) => r.id), firstId: data[0].id })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 })
  }
}
