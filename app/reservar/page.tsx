import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ReservarClient } from "./reservar-client"
import { preciosDe } from "@/lib/precios"
import { ciudadSegura } from "@/lib/ciudades"

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

  // El precio que ve el cliente TIENE que salir de donde sale el que se le
  // cobra: la tabla `precios` de SU ciudad, la misma que lee /api/crear-reserva.
  // Mientras esta pantalla leía la matriz del código, el día que Endy subiera
  // un precio desde su panel el cliente habría visto uno y pagado otro.
  const { data: perfil } = await supabase.from("profiles").select("city").eq("id", user.id).maybeSingle()
  const ciudad = ciudadSegura(perfil?.city)
  const tablaPrecios = await preciosDe(ciudad)

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
      tablaPrecios={tablaPrecios}
    />
  )
}
