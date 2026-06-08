"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { PawPrint, Clock, ShieldCheck, ArrowLeft, ArrowRight, Check, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { SiteHeader } from "@/components/site-header"
import { SiteFooter } from "@/components/site-footer"
import { LogoCircle } from "@/components/logo-circle"
import { createClient } from "@/lib/supabase/client"
import { PLANS, ZONES, DOG_SIZES, priceForDogs } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { SavedDog } from "./page"

type Step = 1 | 2 | 3

const HOURS = Array.from({ length: 14 }, (_, i) => {
  const h = 7 + i // 7am a 8pm
  const label = `${h.toString().padStart(2, "0")}:00`
  return { value: label, label }
})

export function ReservarClient({
  planId,
  initialDogs,
  userEmail,
  savedDogs,
}: {
  planId: string
  initialDogs: number
  userEmail: string
  savedDogs: SavedDog[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const initialPlan = PLANS.find((p) => p.id === planId) ?? PLANS[0]

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Paso 1 — Datos del perro
  // Lista de IDs de perros seleccionados (de la tabla dogs)
  const [allDogs, setAllDogs] = useState<SavedDog[]>(savedDogs)
  const [selectedDogIds, setSelectedDogIds] = useState<string[]>(
    savedDogs.length > 0 ? [savedDogs[0].id] : [],
  )

  // Modal/form para agregar nuevo perro
  const [showAddDog, setShowAddDog] = useState(false)
  const [newDog, setNewDog] = useState({
    name: "", breed: "", size: "mediano", special_needs: "",
    behavior: "", illness: "", long_distance: false,
  })
  const [savingNewDog, setSavingNewDog] = useState(false)

  // Notas adicionales sobre ESTE paseo (opcional)
  const [tripNotes, setTripNotes] = useState("")
  // Aviso de responsabilidad (obligatorio antes de confirmar)
  const [acceptedResponsibility, setAcceptedResponsibility] = useState(false)

  const dogsCount = selectedDogIds.length

  const toggleDog = (id: string) => {
    setSelectedDogIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const saveNewDog = async () => {
    if (!newDog.name.trim()) return alert("Pon el nombre del perro")
    setSavingNewDog(true)
    const { data, error: err } = await supabase
      .from("dogs")
      .insert({
        owner_id: (await supabase.auth.getUser()).data.user!.id,
        name: newDog.name.trim(),
        breed: newDog.breed.trim() || null,
        size: newDog.size,
        special_needs: newDog.special_needs.trim() || null,
        behavior: newDog.behavior.trim() || null,
        illness: newDog.illness.trim() || null,
        long_distance: newDog.long_distance,
      })
      .select()
      .single()
    setSavingNewDog(false)
    if (err) return alert(err.message)
    const dog = data as SavedDog
    setAllDogs((prev) => [dog, ...prev])
    setSelectedDogIds((prev) => [...prev, dog.id])
    setNewDog({ name: "", breed: "", size: "mediano", special_needs: "", behavior: "", illness: "", long_distance: false })
    setShowAddDog(false)
  }

  // Paso 2 — Hora y lugar
  const [date, setDate] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split("T")[0]
  })
  const [startHour, setStartHour] = useState("09:00")
  const [zone, setZone] = useState("")
  const [pickupAddress, setPickupAddress] = useState("")

  const price = priceForDogs(initialPlan, dogsCount)

  const canAdvance1 = selectedDogIds.length > 0
  const canAdvance2 = date && startHour && zone && pickupAddress.trim().length > 0

  const goNext = () => {
    setError(null)
    if (step === 1 && !canAdvance1) return setError("Selecciona al menos un perro para el paseo.")
    if (step === 2 && !canAdvance2) return setError("Llena fecha, horario, zona y dirección de recogida.")
    setStep((s) => (s === 3 ? 3 : ((s + 1) as Step)))
  }
  const goBack = () => {
    setError(null)
    setStep((s) => (s === 1 ? 1 : ((s - 1) as Step)))
  }

  const handleConfirm = async () => {
    setError(null)
    if (!acceptedResponsibility) {
      setError("Confirma que entiendes la garantía de Perrones Cuu para continuar.")
      return
    }
    setLoading(true)
    try {
      const scheduledAt = new Date(`${date}T${startHour}:00`).toISOString()
      // El paseo dura ~1 hora por defecto. El paseador puede cambiar duración después.
      const scheduledUntil = new Date(new Date(scheduledAt).getTime() + 60 * 60 * 1000).toISOString()

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.")

      const selectedDogs = allDogs.filter((d) => selectedDogIds.includes(d.id))
      const dogNames = selectedDogs.map((d) => d.name).join(", ")
      const dogSizes = selectedDogs.map((d) => d.size).filter(Boolean).join("/")
      const dogSpecialNeeds = selectedDogs.map((d) => d.special_needs).filter(Boolean).join(". ")
      const baseNotes = `${selectedDogs.length === 1 ? "Perro" : "Perros"}: ${dogNames}${dogSpecialNeeds ? `. ${dogSpecialNeeds}` : ""}`
      const notes = tripNotes ? `${baseNotes}. Notas del paseo: ${tripNotes}` : baseNotes
      const firstDogId = selectedDogs[0]?.id ?? null

      // Genera N paseos según el plan (1, 3 o 5), en días consecutivos
      // a partir de la fecha elegida. Cada paseo a la misma hora del día.
      // El precio total se asigna al PRIMER paseo (los demás $0) para no contabilizar dos veces.
      const walks = Math.max(1, initialPlan.walksCount ?? 1)
      const startDate = new Date(scheduledAt)
      const rows = []
      for (let i = 0; i < walks; i++) {
        const at = new Date(startDate)
        at.setDate(at.getDate() + i)
        const until = new Date(at.getTime() + 60 * 60 * 1000)
        rows.push({
          user_id: user.id,
          plan_name: initialPlan.name,
          dogs_count: dogsCount,
          // Solo el primero lleva el precio total; los demás $0 (parte del mismo paquete)
          price_mxn: i === 0 ? price : 0,
          status: "buscando_paseador",
          notes: i === 0 ? notes : `${notes}${notes ? " · " : ""}Paseo ${i + 1} de ${walks} del paquete "${initialPlan.name}"`,
          scheduled_at: at.toISOString(),
          scheduled_until: until.toISOString(),
          zone,
          pickup_address: pickupAddress,
          dog_name: dogNames,
          dog_size: dogSizes,
          dog_notes: dogSpecialNeeds,
          dog_id: firstDogId,
          // Las reservas nacen pendientes de aprobación admin
          visibility: "pending_admin",
          payment_status: "pendiente",
          responsibility_accepted: true,
        })
      }

      const { data, error: insErr } = await supabase
        .from("reservations")
        .insert(rows)
        .select("id")

      if (insErr) throw insErr
      if (!data || data.length === 0) throw new Error("No se creó la reserva")

      // Tomamos el primer ID para la pantalla de "buscando"
      const firstId = data[0].id

      // Notifica por correo a los paseadores de la zona para cada reserva
      data.forEach((r) => {
        fetch("/api/notify-paseadores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: r.id }),
        }).catch((err) => console.warn("Notify paseadores failed:", err))
      })

      // Confirmación al cliente de que la reserva quedó registrada (un solo correo, el primero)
      fetch("/api/notify-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: firstId, kind: "reservada" }),
      }).catch((err) => console.warn("Notify cliente failed:", err))

      router.push(`/reservar/buscando/${firstId}`)
      router.refresh()
    } catch (e: unknown) {
      // Extrae el mensaje real ya sea de Error o de un objeto tipo PostgrestError
      let msg = "No pudimos guardar tu reserva"
      if (e instanceof Error) msg = e.message
      else if (typeof e === "object" && e !== null && "message" in e) {
        msg = String((e as { message: unknown }).message)
        if ("details" in e && (e as { details: unknown }).details) {
          msg += ` — ${String((e as { details: unknown }).details)}`
        }
        if ("hint" in e && (e as { hint: unknown }).hint) {
          msg += ` (${String((e as { hint: unknown }).hint)})`
        }
      }
      console.error("Reserva error:", e)
      setError(msg)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader isLoggedIn={true} />

      <main className="flex-1 px-4 py-10 md:py-16">
        <div className="mx-auto max-w-3xl">
          {/* Stepper */}
          <div className="mb-8 flex items-center justify-center gap-2 md:gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-2 md:gap-4">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold transition-all",
                    step >= n ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {step > n ? <Check className="h-5 w-5" /> : n}
                </div>
                {n < 3 && (
                  <div className={cn("h-1 w-10 rounded-full md:w-16", step > n ? "bg-primary" : "bg-secondary")} />
                )}
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm md:p-10">
            {/* Paso 1 */}
            {step === 1 && (
              <div className="space-y-6">
                <header className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/40">
                    <PawPrint className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">¿Quién va a pasear?</h1>
                    <p className="text-sm text-muted-foreground">Plan seleccionado: {initialPlan.name}</p>
                  </div>
                </header>

                {/* Cards de perros para seleccionar */}
                {allDogs.length > 0 && (
                  <div className="space-y-3">
                    <Label className="font-bold">
                      Selecciona los perritos para este paseo
                      {selectedDogIds.length > 0 && (
                        <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                          {selectedDogIds.length} {selectedDogIds.length === 1 ? "seleccionado" : "seleccionados"}
                        </span>
                      )}
                    </Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {allDogs.map((d) => {
                        const selected = selectedDogIds.includes(d.id)
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => toggleDog(d.id)}
                            className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                              selected
                                ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                                : "border-border bg-card hover:border-primary/40"
                            }`}
                          >
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>
                              <PawPrint className="h-6 w-6" />
                            </div>
                            <div className="flex-1 overflow-hidden">
                              <p className="truncate font-extrabold">{d.name}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {d.breed ?? "—"}{d.size ? ` · ${d.size}` : ""}
                              </p>
                            </div>
                            {selected && <Check className="h-5 w-5 shrink-0 text-primary" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Agregar perro nuevo inline */}
                {!showAddDog ? (
                  <button
                    type="button"
                    onClick={() => setShowAddDog(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 py-4 text-sm font-bold text-primary hover:bg-primary/10"
                  >
                    <PawPrint className="h-4 w-4" />
                    Agregar un perro nuevo
                  </button>
                ) : (
                  <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
                    <p className="font-bold">Nuevo perrito</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="newName">Nombre *</Label>
                        <Input id="newName" value={newDog.name} onChange={(e) => setNewDog({ ...newDog, name: e.target.value })} placeholder="Toby" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="newBreed">Raza</Label>
                        <Input id="newBreed" value={newDog.breed} onChange={(e) => setNewDog({ ...newDog, breed: e.target.value })} placeholder="Golden Retriever" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="newSize">Tamaño</Label>
                        <Select value={newDog.size} onValueChange={(v) => setNewDog({ ...newDog, size: v })}>
                          <SelectTrigger id="newSize"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {DOG_SIZES.map((s) => (<SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="newNeeds">Necesidades especiales</Label>
                        <Input id="newNeeds" value={newDog.special_needs} onChange={(e) => setNewDog({ ...newDog, special_needs: e.target.value })} placeholder="Toma medicamento, no le gustan los grandes…" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="newBehavior">Comportamiento</Label>
                        <Input id="newBehavior" value={newDog.behavior} onChange={(e) => setNewDog({ ...newDog, behavior: e.target.value })} placeholder="Juguetón, sociable, le ladra a las bicis…" />
                      </div>
                      <div className="space-y-1 md:col-span-2">
                        <Label htmlFor="newIllness">Enfermedades</Label>
                        <Input id="newIllness" value={newDog.illness} onChange={(e) => setNewDog({ ...newDog, illness: e.target.value })} placeholder="Alergias, condiciones, etc." />
                      </div>
                      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-background px-3 py-2 md:col-span-2">
                        <input type="checkbox" checked={newDog.long_distance} onChange={(e) => setNewDog({ ...newDog, long_distance: e.target.checked })} className="h-5 w-5" />
                        <span className="text-sm font-semibold">Puede pasear distancias largas</span>
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { setShowAddDog(false); setNewDog({ name: "", breed: "", size: "mediano", special_needs: "", behavior: "", illness: "", long_distance: false }) }} disabled={savingNewDog} className="rounded-full">
                        Cancelar
                      </Button>
                      <Button onClick={saveNewDog} disabled={savingNewDog} className="rounded-full font-bold">
                        {savingNewDog ? "Guardando..." : "Guardar y seleccionar"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Vacío total */}
                {allDogs.length === 0 && !showAddDog && (
                  <p className="text-center text-sm text-muted-foreground">
                    Aún no tienes perritos guardados. Agrega uno arriba para empezar.
                  </p>
                )}

                {/* Notas opcionales para ESTE paseo */}
                <div className="space-y-2">
                  <Label htmlFor="tripNotes">Notas para este paseo (opcional)</Label>
                  <Textarea
                    id="tripNotes"
                    value={tripNotes}
                    onChange={(e) => setTripNotes(e.target.value)}
                    placeholder="Algo específico de hoy: viene de bañarse, está nervioso, etc."
                    className="min-h-20"
                  />
                  <p className="text-xs text-muted-foreground">
                    Los datos del perro se editan en <a href="/mis-perros" className="font-bold text-primary underline">Mis perros</a>.
                  </p>
                </div>
              </div>
            )}

            {/* Paso 2 */}
            {step === 2 && (
              <div className="space-y-6">
                <header className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/40">
                    <Clock className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Agenda hora y lugar</h1>
                    <p className="text-sm text-muted-foreground">
                      ¿Cuándo y dónde recogemos a{" "}
                      {allDogs.filter((d) => selectedDogIds.includes(d.id)).map((d) => d.name).join(", ") || "tu perrito"}?
                    </p>
                  </div>
                </header>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Fecha *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start rounded-md text-left font-normal",
                            !date && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {date
                            ? new Date(date + "T00:00:00").toLocaleDateString("es-MX", {
                                weekday: "long", day: "numeric", month: "long",
                              })
                            : "Selecciona una fecha"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={date ? new Date(date + "T00:00:00") : undefined}
                          onSelect={(d) => {
                            if (d) {
                              // Guardar como YYYY-MM-DD sin zona
                              const y = d.getFullYear()
                              const m = String(d.getMonth() + 1).padStart(2, "0")
                              const day = String(d.getDate()).padStart(2, "0")
                              setDate(`${y}-${m}-${day}`)
                            }
                          }}
                          disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startHour">Hora de recogida *</Label>
                    <Select value={startHour} onValueChange={setStartHour}>
                      <SelectTrigger id="startHour"><SelectValue placeholder="¿A qué hora?" /></SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (<SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="zone">Zona *</Label>
                    <Select value={zone} onValueChange={setZone}>
                      <SelectTrigger id="zone"><SelectValue placeholder="Selecciona tu zona" /></SelectTrigger>
                      <SelectContent>
                        {ZONES.map((z) => (<SelectItem key={z} value={z}>{z}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="pickupAddress">Dirección donde recogemos a tu perro *</Label>
                    <Input
                      id="pickupAddress"
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                      placeholder="Calle Ejemplo #123, entre X y Y, color de portón..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Paso 3 */}
            {step === 3 && (
              <div className="space-y-6">
                <header className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/40">
                    <ShieldCheck className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-extrabold tracking-tight">Te enlazamos con un paseador</h1>
                    <p className="text-sm text-muted-foreground">Revisa tu reserva y confirma.</p>
                  </div>
                </header>

                <div className="rounded-2xl bg-secondary/40 p-5">
                  <div className="flex items-center gap-3">
                    <LogoCircle className="h-12 w-12" />
                    <div>
                      <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Plan</p>
                      <p className="text-lg font-extrabold">{initialPlan.name} · {dogsCount} {dogsCount === 1 ? "perro" : "perros"}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Total</p>
                      <p className="text-2xl font-extrabold">MX${price.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                <ul className="space-y-3 text-sm">
                  <li className="flex items-start gap-3">
                    <PawPrint className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      <b>
                        {allDogs.filter((d) => selectedDogIds.includes(d.id)).map((d) => d.name).join(", ") || "Sin perros"}
                      </b>
                      {" · "}
                      {selectedDogIds.length} {selectedDogIds.length === 1 ? "perrito" : "perritos"}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>
                      {new Date(date).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })} · recogemos a las {startHour}
                      {(initialPlan.walksCount ?? 1) > 1 && (
                        <> · <b>{initialPlan.walksCount} paseos</b> en días consecutivos</>
                      )}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{zone} · {pickupAddress}</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>Seguro para tu perrito incluido durante el paseo gestionado por la plataforma.</span>
                  </li>
                </ul>

                {/* AVISO grande de pago */}
                <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
                  <p className="text-sm font-bold uppercase tracking-wide text-primary">💳 Pago al final del servicio</p>
                  <p className="mt-2 text-base font-bold leading-relaxed">
                    El pago se realiza al terminar el paseo, <u>únicamente por transferencia</u>.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Te enviaremos los datos de la cuenta cuando el paseador acepte tu paseo.
                  </p>
                </div>

                {/* Aviso: Perrones se hace responsable mientras el paseo esté dentro de la plataforma */}
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
                  <input
                    type="checkbox"
                    checked={acceptedResponsibility}
                    onChange={(e) => setAcceptedResponsibility(e.target.checked)}
                    className="mt-1 h-6 w-6 rounded border-2 border-primary"
                  />
                  <div>
                    <p className="text-base font-extrabold">🛡️ Perrones Cuu se hace responsable de tu perrito</p>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/80">
                      Mientras agendes tu paseo dentro de la plataforma, <b>nosotros nos hacemos responsables</b> de tu perrito durante el servicio:
                      paseadores verificados, seguro incluido y atención al cliente.
                    </p>
                    <p className="mt-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold leading-relaxed text-primary">
                      ⚠️ Importante: si contratas un paseador por fuera, pierdes el seguro y nuestra garantía. La plataforma deja de responder.
                    </p>
                  </div>
                </label>

                <p className="rounded-2xl bg-accent/30 p-4 text-sm text-accent-foreground">
                  Al confirmar, el administrador revisará tu reserva y la abrirá a paseadores de tu zona.
                  En cuanto alguien acepte, te avisaremos por correo y WhatsApp.
                </p>
              </div>
            )}

            {error && (
              <p className="mt-6 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{error}</p>
            )}

            {/* Botones */}
            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {step > 1 ? (
                <Button variant="outline" onClick={goBack} className="rounded-full" disabled={loading}>
                  <ArrowLeft className="h-4 w-4" />
                  Atrás
                </Button>
              ) : (
                <Button asChild variant="ghost" className="rounded-full">
                  <Link href="/">Cancelar</Link>
                </Button>
              )}

              {step < 3 ? (
                <Button onClick={goNext} className="rounded-full font-bold">
                  Siguiente
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleConfirm} disabled={loading || (step === 3 && !acceptedResponsibility)} className="rounded-full font-bold">
                  {loading ? "Confirmando..." : "Confirmar paseo"}
                </Button>
              )}
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Reservas hechas como <b>{userEmail}</b>.
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
