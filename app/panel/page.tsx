import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PanelClient, type Reservation } from "./panel-client"
import { AdminPanel, type AdminReservation } from "./admin-panel"
import { WalkerPanel, type WalkerReservation } from "./walker-panel"

export default async function PanelPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, commission_pct")
    .eq("id", user.id)
    .single()

  const role = profile?.role ?? "dueno"
  const isStaff = role === "paseador" || role === "admin"

  // RLS handles scoping: owners see their own, staff see all
  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, plan_name, dogs_count, price_mxn, status, notes, created_at, user_id, scheduled_at, scheduled_until, zone, pickup_address, dog_name, dog_size, walker_id, visibility, payment_status, package_id, package_index, package_total, manual_client_name, manual_client_phone",
    )
    .order("created_at", { ascending: false })

  // For staff, resolve owner names
  let ownerMap: Record<string, { name: string | null; phone: string | null }> = {}
  let walkerMap: Record<string, { name: string | null }> = {}
  if (isStaff && reservations && reservations.length > 0) {
    const ownerIds = Array.from(new Set(reservations.map((r) => r.user_id)))
    const walkerIds = Array.from(new Set(reservations.map((r) => r.walker_id).filter(Boolean) as string[]))
    const allIds = Array.from(new Set([...ownerIds, ...walkerIds]))
    const { data: people } = await supabase.from("profiles").select("id, full_name, phone").in("id", allIds)
    const peopleMap = Object.fromEntries(
      (people ?? []).map((o) => [o.id, { name: o.full_name as string | null, phone: o.phone as string | null }]),
    )
    ownerMap = Object.fromEntries(ownerIds.map((id) => [id, peopleMap[id] ?? { name: null, phone: null }]))
    walkerMap = Object.fromEntries(walkerIds.map((id) => [id, { name: peopleMap[id]?.name ?? null }]))
  }

  // Admin obtiene una vista distinta — fetch extra: lista completa de usuarios
  if (role === "admin") {
    const { data: allUsers } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, zone, banned, created_at")
      .order("created_at", { ascending: false })
    return (
      <AdminPanel
        fullName={profile?.full_name ?? null}
        email={user.email ?? ""}
        reservations={(reservations ?? []) as AdminReservation[]}
        ownerMap={ownerMap}
        walkerMap={walkerMap}
        allUsers={allUsers ?? []}
        initialAdminPct={(profile as { commission_pct?: number })?.commission_pct ?? 30}
      />
    )
  }

  // Paseador obtiene su propia vista (con ganancias, tabs, editor perfil)
  if (role === "paseador") {
    const { data: walkerProfile } = await supabase
      .from("profiles")
      .select("zone, available_hours")
      .eq("id", user.id)
      .single()
    return (
      <WalkerPanel
        fullName={profile?.full_name ?? null}
        email={user.email ?? ""}
        userId={user.id}
        reservations={(reservations ?? []) as WalkerReservation[]}
        ownerMap={ownerMap}
        initialZone={walkerProfile?.zone ?? null}
        initialAvailableHours={(walkerProfile?.available_hours ?? {}) as Record<string, boolean>}
      />
    )
  }

  // Dueño: traer nombres de paseadores asignados a sus reservas
  let ownerWalkerMap: Record<string, string> = {}
  if (reservations && reservations.length > 0) {
    const walkerIds = Array.from(new Set(reservations.map((r) => r.walker_id).filter(Boolean) as string[]))
    if (walkerIds.length > 0) {
      const { data: walkers } = await supabase.from("profiles").select("id, full_name").in("id", walkerIds)
      ownerWalkerMap = Object.fromEntries((walkers ?? []).map((w) => [w.id, w.full_name ?? "Paseador"]))
    }
  }

  return (
    <PanelClient
      role={role}
      fullName={profile?.full_name ?? null}
      email={user.email ?? ""}
      userId={user.id}
      reservations={(reservations ?? []) as Reservation[]}
      ownerMap={ownerMap}
      walkerNameMap={ownerWalkerMap}
    />
  )
}
