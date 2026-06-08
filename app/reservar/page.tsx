import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ReservarClient } from "./reservar-client"

export type SavedDog = {
  id: string
  name: string
  breed: string | null
  age: number | null
  size: string | null
  notes: string | null
  special_needs: string | null
  behavior: string | null
  illness: string | null
  long_distance: boolean | null
}

type SearchParams = Promise<{ plan?: string; dogs?: string }>

export default async function ReservarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Si no hay sesión, lo mandamos a registrarse como dueño
  if (!user) {
    const qs = new URLSearchParams()
    if (params.plan) qs.set("plan", params.plan)
    if (params.dogs) qs.set("dogs", params.dogs)
    redirect(`/signup?role=dueno&redirectTo=/reservar${qs.toString() ? `?${qs.toString()}` : ""}`)
  }

  // Traer los perros guardados del dueño para selección rápida
  const { data: savedDogs } = await supabase
    .from("dogs")
    .select("id, name, breed, age, size, notes, special_needs, behavior, illness, long_distance")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <ReservarClient
      planId={params.plan ?? "dia"}
      initialDogs={Number(params.dogs ?? 1)}
      userEmail={user.email ?? ""}
      savedDogs={(savedDogs ?? []) as SavedDog[]}
    />
  )
}
