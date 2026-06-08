import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BuscandoClient } from "./buscando-client"

export default async function BuscandoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect("/auth/login")

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, status, plan_name, dogs_count, price_mxn, scheduled_at, zone, walker_id")
    .eq("id", id)
    .single()

  if (!reservation) redirect("/panel")

  // Si ya está asignado, resuelve el nombre del paseador
  let walkerName: string | null = null
  if (reservation.walker_id) {
    const { data: walker } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", reservation.walker_id)
      .single()
    walkerName = walker?.full_name ?? null
  }

  return <BuscandoClient reservation={{ ...reservation, walker_name: walkerName }} />
}
