"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Edit, Trash2, Dog as DogIcon, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { createClient } from "@/lib/supabase/client"
import { DOG_SIZES } from "@/lib/constants"

export type Dog = {
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
  created_at: string
}

const EMPTY_DRAFT = {
  id: "",
  name: "",
  breed: "",
  age: "",
  size: "mediano",
  notes: "",
  special_needs: "",
  behavior: "",
  illness: "",
  long_distance: false,
}

export function MisPerrosClient({ dogs: initial, userId }: { dogs: Dog[]; userId: string }) {
  const [dogs, setDogs] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startNew = () => {
    setEditingId("new")
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  const startEdit = (d: Dog) => {
    setEditingId(d.id)
    setDraft({
      id: d.id,
      name: d.name,
      breed: d.breed ?? "",
      age: d.age != null ? String(d.age) : "",
      size: d.size ?? "mediano",
      notes: d.notes ?? "",
      special_needs: d.special_needs ?? "",
      behavior: d.behavior ?? "",
      illness: d.illness ?? "",
      long_distance: !!d.long_distance,
    })
    setError(null)
  }

  const cancel = () => {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  const save = async () => {
    setError(null)
    if (!draft.name.trim()) return setError("Pon al menos el nombre del perro.")
    setSaving(true)
    const supabase = createClient()
    const payload = {
      owner_id: userId,
      name: draft.name.trim(),
      breed: draft.breed.trim() || null,
      age: draft.age ? Number(draft.age) : null,
      size: draft.size,
      notes: draft.notes.trim() || null,
      special_needs: draft.special_needs.trim() || null,
      behavior: draft.behavior.trim() || null,
      illness: draft.illness.trim() || null,
      long_distance: draft.long_distance,
    }
    if (editingId === "new") {
      const { data, error: err } = await supabase.from("dogs").insert(payload).select().single()
      setSaving(false)
      if (err) return setError(err.message)
      setDogs((prev) => [data as Dog, ...prev])
      cancel()
    } else {
      const { data, error: err } = await supabase
        .from("dogs")
        .update(payload)
        .eq("id", editingId!)
        .select()
        .single()
      setSaving(false)
      if (err) return setError(err.message)
      setDogs((prev) => prev.map((d) => (d.id === editingId ? (data as Dog) : d)))
      cancel()
    }
  }

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este perrito de tu lista?")) return
    const supabase = createClient()
    const { error: err } = await supabase.from("dogs").delete().eq("id", id)
    if (err) return alert(err.message)
    setDogs((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={true} />
      <main className="flex-1 px-4 py-10 md:py-16">
        <div className="mx-auto max-w-3xl">
          <Link href="/panel" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Volver al panel
          </Link>

          <div className="mb-8 flex items-end justify-between">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">Mis perros</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Guarda los datos de tus perritos. Al reservar solo eliges cuál llevamos a pasear.
              </p>
            </div>
            {editingId === null && (
              <Button onClick={startNew} className="rounded-full font-bold">
                <Plus className="h-4 w-4" />
                Agregar perro
              </Button>
            )}
          </div>

          {/* Formulario nuevo/edit */}
          {editingId && (
            <div className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-display text-xl font-extrabold">
                {editingId === "new" ? "Nuevo perrito" : "Editar perrito"}
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input id="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Toby" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="breed">Raza</Label>
                  <Input id="breed" value={draft.breed} onChange={(e) => setDraft({ ...draft, breed: e.target.value })} placeholder="Golden Retriever" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Edad (años)</Label>
                  <Input id="age" type="number" min="0" max="30" value={draft.age} onChange={(e) => setDraft({ ...draft, age: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="size">Tamaño</Label>
                  <Select value={draft.size} onValueChange={(v) => setDraft({ ...draft, size: v })}>
                    <SelectTrigger id="size"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOG_SIZES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea id="notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Es juguetón, le encantan los parques." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="special_needs">Necesidades especiales</Label>
                  <Textarea id="special_needs" value={draft.special_needs} onChange={(e) => setDraft({ ...draft, special_needs: e.target.value })} placeholder="Toma medicamento a las 3pm, no le gustan los perros grandes." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="behavior">Comportamiento</Label>
                  <Textarea id="behavior" value={draft.behavior} onChange={(e) => setDraft({ ...draft, behavior: e.target.value })} placeholder="Es muy juguetón, sociable, le ladra a las bicis…" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="illness">Enfermedades o condiciones</Label>
                  <Textarea id="illness" value={draft.illness} onChange={(e) => setDraft({ ...draft, illness: e.target.value })} placeholder="Displasia leve, alergia a ciertos pastos, etc." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={draft.long_distance}
                      onChange={(e) => setDraft({ ...draft, long_distance: e.target.checked })}
                      className="h-5 w-5 rounded border-border"
                    />
                    <div>
                      <p className="font-bold">Puede pasear distancias largas</p>
                      <p className="text-xs text-muted-foreground">Marca esto si tu perro está en forma para paseos largos (más de 1 hora).</p>
                    </div>
                  </label>
                </div>
              </div>
              {error && <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">{error}</p>}
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" onClick={cancel} disabled={saving} className="rounded-full"><X className="h-4 w-4" /> Cancelar</Button>
                <Button onClick={save} disabled={saving} className="rounded-full font-bold">
                  <Save className="h-4 w-4" />
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
          )}

          {/* Lista de perros */}
          {dogs.length === 0 && editingId === null ? (
            <div className="rounded-3xl border border-border bg-card p-12 text-center shadow-sm">
              <DogIcon className="mx-auto mb-4 h-10 w-10 text-primary" />
              <h3 className="font-display text-xl font-extrabold">Aún no tienes perritos guardados.</h3>
              <p className="mt-1 text-sm text-muted-foreground">Agrega uno para reservar paseos rápido.</p>
              <Button onClick={startNew} className="mt-6 rounded-full font-bold">
                <Plus className="h-4 w-4" />
                Agregar mi primer perrito
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {dogs.map((d) => (
                <div key={d.id} className="hover-lift flex items-start gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15">
                    <DogIcon className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-xl font-extrabold">{d.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {d.breed ?? "Raza no especificada"}
                      {d.age != null && ` · ${d.age} años`}
                      {d.size && ` · ${d.size}`}
                    </p>
                    {d.notes && <p className="mt-2 text-sm italic text-muted-foreground">{d.notes}</p>}
                    {d.special_needs && (
                      <p className="mt-2 rounded-xl bg-accent/30 px-3 py-1.5 text-sm">
                        <b>Necesidades:</b> {d.special_needs}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(d)} className="rounded-full">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(d.id)} className="rounded-full text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
