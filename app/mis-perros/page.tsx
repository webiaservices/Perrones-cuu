import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MisPerrosClient, type Dog } from "./mis-perros-client"

export default async function MisPerrosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: dogs } = await supabase
    .from("dogs")
    .select("id, name, breed, age, size, notes, special_needs, behavior, illness, long_distance, created_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })

  return <MisPerrosClient dogs={(dogs ?? []) as Dog[]} userId={user.id} />
}
