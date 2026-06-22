"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  LogOut,
  CalendarDays,
  Clock,
  CheckCircle2,
  Inbox,
  PawPrint,
  MapPin,
  Dog,
  Check,
  X,
  Bell,
  Calendar as CalendarIcon,
  List as ListIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { LogoCircle } from "@/components/logo-circle"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { createClient } from "@/lib/supabase/client"
import { walkerPayout, ZONES, WEEKDAYS } from "@/lib/constants"

export type WalkerReservation = {
  id: string
  plan_name: string
  dogs_count: number
  price_mxn: number
  status: string
  notes: string | null
  created_at: string
  user_id: string
  scheduled_at: string | null
  scheduled_until: string | null
  zone: string | null
  pickup_address: string | null
  dog_name: string | null
  dog_size: string | null
  walker_id: string | null
  package_id?: string | null
  package_index?: number | null
  package_total?: number | null
}

type Tab = "hoy" | "semana" | "proximos" | "disponibles"

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  buscando_paseador: { bg: "#FFF3D6", color: "#9a6b00", label: "Buscando paseador" },
  confirmada: { bg: "#DCF5F1", color: "#19756b", label: "Confirmada" },
  en_curso: { bg: "#E6E6FA", color: "#5a4fcf", label: "En curso" },
  completada: { bg: "#DDEEDD", color: "#2f7a3f", label: "Completada" },
  cancelada: { bg: "#FBE0E0", color: "#b33b3b", label: "Cancelada" },
  sin_asignar: { bg: "#FBE0E0", color: "#b33b3b", label: "Sin asignar" },
}

function durationMin(start: string | null, end: string | null) {
  if (!start || !end) return 30
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function endOfWeek(d: Date) {
  const x = startOfWeek(d)
  x.setDate(x.getDate() + 7)
  return x
}

export function WalkerPanel({
  fullName,
  email,
  userId,
  reservations: initial,
  ownerMap,
  initialZone,
  initialAvailableHours,
}: {
  fullName: string | null
  email: string
  userId: string
  reservations: WalkerReservation[]
  ownerMap: Record<string, { name: string | null; phone: string | null }>
  initialZone: string | null
  initialAvailableHours: Record<string, boolean>
}) {
  const router = useRouter()
  const [reservations, setReservations] = useState(initial)
  const [tab, setTab] = useState<Tab>("disponibles")
  const [view, setView] = useState<"lista" | "calendario">("lista")
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [selectedReservation, setSelectedReservation] = useState<WalkerReservation | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  // Editor de perfil
  const initialZoneIsCustom = !!initialZone && !ZONES.includes(initialZone)
  const [zone, setZone] = useState(initialZoneIsCustom ? "Otra" : (initialZone ?? ""))
  const [zoneOther, setZoneOther] = useState(initialZoneIsCustom ? initialZone! : "")
  const [days, setDays] = useState<Record<string, boolean>>(initialAvailableHours)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  const toggleDay = (d: string) => setDays((prev) => ({ ...prev, [d]: !prev[d] }))

  const saveProfile = async () => {
    setProfileMsg(null)
    setSavingProfile(true)
    const supabase = createClient()
    const { error } = await supabase
      .from("profiles")
      .update({ zone: (zone === "Otra" ? (zoneOther || null) : (zone || null)), available_hours: days })
      .eq("id", userId)
    setSavingProfile(false)
    if (error) {
      setProfileMsg({ kind: "error", text: error.message })
    } else {
      setProfileMsg({ kind: "ok", text: "Perfil actualizado." })
      // Auto-clear el mensaje después de 3s
      setTimeout(() => setProfileMsg(null), 3000)
      router.refresh()
    }
  }

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const acceptPaseo = async (id: string) => {
    setUpdating(id)
    const supabase = createClient()
    // Si es paquete, acepta TODOS los paseos del paquete
    const target = reservations.find((r) => r.id === id)
    const query = supabase
      .from("reservations")
      .update({ status: "confirmada", walker_id: userId })
      .is("walker_id", null)
    const { data, error } = target?.package_id
      ? await query.eq("package_id", target.package_id).select("id")
      : await query.eq("id", id).select("id").single()
    setUpdating(null)
    if (error || !data) {
      alert("Otro paseador ya tomó este paseo.")
      setReservations((prev) => prev.filter((r) => r.id !== id))
      return
    }
    setReservations((prev) =>
      prev.map((r) =>
        (target?.package_id ? r.package_id === target.package_id : r.id === id)
          ? { ...r, status: "confirmada", walker_id: userId }
          : r,
      ),
    )
    // Notifica al cliente que su paseo fue aceptado
    fetch("/api/notify-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: id, kind: "asignada" }),
    }).catch(() => {})
    // Notifica al admin con toda la info del paseador que acepto
    fetch("/api/notify-admin-aceptado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: id }),
    }).catch(() => {})
  }

  const rejectPaseo = (id: string) => {
    setReservations((prev) => prev.filter((r) => r.id !== id))
  }

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    const supabase = createClient()
    const { error } = await supabase.from("reservations").update({ status }).eq("id", id)
    setUpdating(null)
    if (!error) {
      setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)))
      if (status === "completada") {
        fetch("/api/notify-pago", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: id }),
        }).catch(() => {})
      }
    }
  }

  // Mis paseos = los asignados a mí
  // Agrupar paseos recurrentes: solo el primero del paquete
  const groupedReservations = useMemo(
    () => reservations.filter((r) => !r.package_id || (r.package_index ?? 1) === 1),
    [reservations],
  )
  // Mapa: package_id → todas las fechas (ordenadas) para mostrarlas todas
  const packageDates = useMemo(() => {
    const m: Record<string, Date[]> = {}
    reservations.forEach((r) => {
      if (r.package_id && r.scheduled_at) {
        if (!m[r.package_id]) m[r.package_id] = []
        m[r.package_id].push(new Date(r.scheduled_at))
      }
    })
    Object.values(m).forEach((arr) => arr.sort((a, b) => a.getTime() - b.getTime()))
    return m
  }, [reservations])
  const myReservations = useMemo(
    () => groupedReservations.filter((r) => r.walker_id === userId),
    [groupedReservations, userId],
  )
  // Paseos disponibles para tomar
  const availableReservations = useMemo(
    () => groupedReservations.filter((r) => r.status === "buscando_paseador" && !r.walker_id),
    [groupedReservations],
  )

  // Stats
  const stats = useMemo(() => {
    const weekStart = startOfWeek(new Date())
    const weekEnd = endOfWeek(new Date())
    const inWeek = myReservations.filter((r) => {
      if (!r.scheduled_at) return false
      const d = new Date(r.scheduled_at)
      return d >= weekStart && d < weekEnd && r.status !== "cancelada"
    })
    const totalMin = inWeek.reduce((s, r) => s + durationMin(r.scheduled_at, r.scheduled_until), 0)
    const completados = inWeek.filter((r) => r.status === "completada").length
    const gananciaSemana = inWeek.reduce((s, r) => s + walkerPayout(Number(r.price_mxn)), 0)
    return {
      paseosSemana: inWeek.length,
      horasTotales: (totalMin / 60).toFixed(1),
      completados,
      disponibles: availableReservations.length,
      gananciaSemana,
    }
  }, [myReservations, availableReservations])

  // Filtrado por tab
  const visible = useMemo(() => {
    if (tab === "disponibles") return availableReservations
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekEnd = endOfWeek(new Date())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    return myReservations
      .filter((r) => {
        if (!r.scheduled_at) return tab === "proximos"
        const d = new Date(r.scheduled_at)
        if (tab === "hoy") return d >= today && d < tomorrow
        if (tab === "semana") return d >= today && d < weekEnd
        if (tab === "proximos") return d >= today
        return true
      })
      .sort((a, b) => {
        const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
        const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
        return ta - tb
      })
  }, [tab, myReservations, availableReservations])

  const firstName = fullName?.split(" ")[0] ?? "paseador"

  return (
    <main className="min-h-svh bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/" className="hidden items-center gap-2 sm:flex">
              <LogoCircle className="h-8 w-8" />
              <span className="font-display text-lg font-extrabold">Perrones Cuu · Paseador</span>
            </Link>
            <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 rounded-full font-semibold">
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        {/* Saludo */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
            Hola, <span className="text-primary">{firstName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Esta es tu agenda. Aquí ves los paseos asignados a ti.
          </p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            icon={<CalendarDays className="h-5 w-5 text-primary" />}
            title="Paseos esta semana"
            value={String(stats.paseosSemana)}
          />
          <StatCard
            icon={<Clock className="h-5 w-5 text-primary" />}
            title="Horas totales"
            value={`${stats.horasTotales} h`}
          />
          <StatCard
            icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
            title="Ganancias esta semana"
            value={`MX$${stats.gananciaSemana}`}
          />
          <StatCard
            icon={<Bell className="h-5 w-5 text-primary" />}
            title="Disponibles"
            value={String(stats.disponibles)}
            highlight={stats.disponibles > 0}
          />
        </div>

        {/* Toggle Lista / Calendario */}
        <div className="mb-5 flex items-center gap-2 rounded-full bg-background p-1.5 shadow-sm w-fit">
          <button
            onClick={() => setView("lista")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              view === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <ListIcon className="h-4 w-4" />
            Lista
          </button>
          <button
            onClick={() => setView("calendario")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              view === "calendario" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <CalendarIcon className="h-4 w-4" />
            Calendario
          </button>
        </div>

        {/* Tabs (solo en vista lista) */}
        {view === "lista" && (
        <div className="mb-5 flex flex-wrap gap-2">
          <TabPill active={tab === "hoy"} onClick={() => setTab("hoy")} label="Hoy" count={myReservations.filter((r) => {
            if (!r.scheduled_at) return false
            const t = new Date(); t.setHours(0, 0, 0, 0)
            const t2 = new Date(t); t2.setDate(t2.getDate() + 1)
            const d = new Date(r.scheduled_at)
            return d >= t && d < t2
          }).length} />
          <TabPill active={tab === "semana"} onClick={() => setTab("semana")} label="Esta semana" count={myReservations.filter((r) => {
            if (!r.scheduled_at) return false
            const t = new Date(); t.setHours(0, 0, 0, 0)
            const we = endOfWeek(new Date())
            const d = new Date(r.scheduled_at)
            return d >= t && d < we
          }).length} />
          <TabPill active={tab === "proximos"} onClick={() => setTab("proximos")} label="Próximos" count={myReservations.filter((r) => {
            if (!r.scheduled_at) return true
            return new Date(r.scheduled_at) >= new Date()
          }).length} />
          <TabPill active={tab === "disponibles"} onClick={() => setTab("disponibles")} label="Disponibles" count={availableReservations.length} highlight={availableReservations.length > 0} />
        </div>
        )}

        {/* Vista calendario */}
        {view === "calendario" && (
          <WalkerCalendar
            weekStart={weekStart}
            setWeekStart={setWeekStart}
            myReservations={myReservations}
            availableReservations={availableReservations}
            onClick={setSelectedReservation}
          />
        )}

        {/* Lista */}
        {view === "lista" && (
        visible.length === 0 ? (
          <div className="rounded-3xl border border-border bg-background p-12 text-center shadow-sm">
            <Inbox className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="font-display text-xl font-extrabold">
              {tab === "disponibles"
                ? "No hay paseos disponibles ahora."
                : tab === "hoy"
                ? "No tienes paseos hoy."
                : tab === "semana"
                ? "Nada agendado esta semana."
                : "No tienes paseos próximos. Te avisaremos cuando agenden uno."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "disponibles"
                ? "Cuando un dueño agende un paseo en tu zona aparecerá aquí."
                : "Revisa la pestaña 'Disponibles' para tomar paseos nuevos."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {visible.map((r) => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.buscando_paseador
              const isMine = r.walker_id === userId
              const isAvailable = !r.walker_id && r.status === "buscando_paseador"
              const owner = ownerMap[r.user_id]

              return (
                <div key={r.id} className="hover-lift rounded-3xl border border-border bg-background p-6 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3 className="font-display text-xl font-extrabold">{r.dog_name ?? "Paseo"}</h3>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                          style={{ background: st.bg, color: st.color }}
                        >
                          {st.label}
                        </span>
                        {isAvailable && (
                          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-bold text-primary">
                            Nuevo
                          </span>
                        )}
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2">
                        {r.dog_size && (
                          <span className="flex items-center gap-1.5">
                            <Dog className="h-4 w-4" />
                            Tamaño: {r.dog_size}
                            {r.dogs_count > 1 && ` · ${r.dogs_count} perros`}
                          </span>
                        )}
                        {r.scheduled_at && (
                          r.package_id && packageDates[r.package_id]?.length > 1 ? (
                            <div className="flex items-start gap-1.5">
                              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" />
                              <div>
                                <div className="font-bold text-foreground">{packageDates[r.package_id].length} días:</div>
                                {packageDates[r.package_id].map((d, di) => (
                                  <div key={di}>
                                    · {d.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })} a las {d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <CalendarDays className="h-4 w-4" />
                              {new Date(r.scheduled_at).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                              {new Date(r.scheduled_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                              {r.scheduled_until && `–${new Date(r.scheduled_until).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`}
                            </span>
                          )
                        )}
                        {r.zone && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-4 w-4" />
                            {r.zone}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5 font-bold text-primary">
                          <PawPrint className="h-4 w-4" />
                          Ganancia: MX${walkerPayout(Number(r.price_mxn))}
                        </span>
                      </div>

                      {isMine && r.pickup_address && (
                        <p className="mt-3 rounded-xl bg-accent/30 px-3 py-2 text-sm">
                          <b>Recoger en:</b> {r.pickup_address}
                        </p>
                      )}

                      {isMine && owner?.name && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          <b>Dueño:</b> {owner.name}
                        </p>
                      )}

                      {r.notes && (
                        <p className="mt-2 text-sm italic text-muted-foreground">{r.notes}</p>
                      )}
                    </div>

                    {/* Botones */}
                    {isAvailable && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          onClick={() => rejectPaseo(r.id)}
                          disabled={updating === r.id}
                          variant="outline"
                          className="rounded-full font-bold"
                        >
                          <X className="h-4 w-4" /> Rechazar
                        </Button>
                        <Button
                          onClick={() => acceptPaseo(r.id)}
                          disabled={updating === r.id}
                          className="rounded-full font-bold"
                        >
                          <Check className="h-4 w-4" />
                          {updating === r.id ? "Aceptando..." : "Aceptar paseo"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Cambio de estado para los que ya son míos */}
                  {isMine && (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                      {(["en_curso", "completada", "cancelada"] as const).map((s) => (
                        <button
                          key={s}
                          disabled={updating === r.id || r.status === s}
                          onClick={() => updateStatus(r.id, s)}
                          className="rounded-full border px-3 py-1.5 text-xs font-bold transition-all disabled:cursor-default"
                          style={
                            r.status === s
                              ? { background: "var(--color-primary)", color: "white", borderColor: "var(--color-primary)" }
                              : { background: "white", color: "var(--color-muted-foreground)", borderColor: "var(--color-border)" }
                          }
                        >
                          {STATUS_STYLE[s].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
        )}

        {/* Mi perfil */}
        <section className="mt-12 rounded-3xl border border-border bg-background p-6 shadow-sm md:p-8">
          <h2 className="font-display text-2xl font-extrabold tracking-tight">Mi perfil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Actualiza tu zona de trabajo y los días en los que estás disponible.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Zona donde trabajo</label>
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger><SelectValue placeholder="Selecciona tu zona" /></SelectTrigger>
                <SelectContent>
                  {ZONES.map((z) => (<SelectItem key={z} value={z}>{z}</SelectItem>))}
                </SelectContent>
              </Select>
              {zone === "Otra" && (
                <Input
                  placeholder="¿Cuál colonia?"
                  value={zoneOther}
                  onChange={(e) => setZoneOther(e.target.value)}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Solo verás paseos disponibles en esta zona.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold">Días disponibles</label>
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => (
                  <label
                    key={d.value}
                    className="flex cursor-pointer items-center gap-2 rounded-full border border-border bg-secondary/40 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-secondary"
                  >
                    <Checkbox checked={!!days[d.value]} onCheckedChange={() => toggleDay(d.value)} />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {profileMsg && (
            <p
              className={`mt-4 rounded-xl px-3 py-2 text-sm font-semibold ${
                profileMsg.kind === "ok"
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {profileMsg.text}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={saveProfile} disabled={savingProfile} className="rounded-full font-bold">
              {savingProfile ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </section>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          {fullName ?? ""} · {email}
        </p>
      </div>

      {/* Modal de detalles al click en el calendario */}
      {selectedReservation && (
        <ReservationDetailModal
          reservation={selectedReservation}
          ownerName={ownerMap[selectedReservation.user_id]?.name ?? null}
          isMine={selectedReservation.walker_id === userId}
          isAvailable={!selectedReservation.walker_id && selectedReservation.status === "buscando_paseador"}
          onClose={() => setSelectedReservation(null)}
          onAccept={() => {
            acceptPaseo(selectedReservation.id)
            setSelectedReservation(null)
          }}
          onUpdateStatus={(s) => {
            updateStatus(selectedReservation.id, s)
            setSelectedReservation((r) => (r ? { ...r, status: s } : r))
          }}
          updating={updating === selectedReservation.id}
        />
      )}
    </main>
  )
}

function WalkerCalendar({
  weekStart,
  setWeekStart,
  myReservations,
  availableReservations,
  onClick,
}: {
  weekStart: Date
  setWeekStart: (d: Date) => void
  myReservations: WalkerReservation[]
  availableReservations: WalkerReservation[]
  onClick: (r: WalkerReservation) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })
  const hours = Array.from({ length: 15 }, (_, i) => i + 6) // 06:00 a 20:00
  const dayNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6)

  // Agrupa paseos por día — los míos en teal, disponibles en ámbar
  const all = [
    ...myReservations.map((r) => ({ ...r, _mine: true as const })),
    ...availableReservations.map((r) => ({ ...r, _mine: false as const })),
  ]

  return (
    <section className="rounded-3xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { const x = new Date(weekStart); x.setDate(x.getDate() - 7); setWeekStart(x) }}
            className="rounded-full border border-border p-2 hover:bg-secondary"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-full bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Esta semana
          </button>
          <button
            onClick={() => { const x = new Date(weekStart); x.setDate(x.getDate() + 7); setWeekStart(x) }}
            className="rounded-full border border-border p-2 hover:bg-secondary"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="font-display text-lg font-bold">
          {weekStart.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} – {weekEnd.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} {weekEnd.getFullYear()}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-secondary/40 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-primary" />
          Mis paseos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          Disponibles para tomar
        </span>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="grid min-w-[800px]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div />
          {days.map((d, i) => {
            const isToday = d.toDateString() === new Date().toDateString()
            return (
              <div key={i} className="border-b border-border pb-3 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{dayNames[i]}</div>
                <div className={`font-display text-2xl font-extrabold ${isToday ? "text-primary" : ""}`}>{d.getDate()}</div>
              </div>
            )
          })}

          {hours.map((h) => (
            <FragmentRow key={h} hour={h} days={days} reservations={all} onClick={onClick} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FragmentRow({
  hour, days, reservations, onClick,
}: {
  hour: number
  days: Date[]
  reservations: (WalkerReservation & { _mine: boolean })[]
  onClick: (r: WalkerReservation) => void
}) {
  return (
    <>
      <div className="border-b border-border/40 py-2 pr-2 text-right text-xs font-semibold text-muted-foreground">
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((d, i) => {
        const items = reservations.filter((r) => {
          if (!r.scheduled_at) return false
          const dt = new Date(r.scheduled_at)
          return dt.toDateString() === d.toDateString() && dt.getHours() === hour
        })
        return (
          <div key={i} className="relative min-h-14 border-b border-border/40 border-l p-1">
            {items.map((r) => (
              <button
                key={r.id}
                onClick={() => onClick(r)}
                className={`mb-1 w-full rounded-lg px-2 py-1 text-left text-xs font-bold shadow transition-transform hover:scale-[1.02] ${
                  r._mine ? "bg-primary text-primary-foreground" : "bg-amber-400 text-amber-950"
                }`}
                title={`${r.dog_name ?? ""} · ${r.zone ?? ""}`}
              >
                {r.scheduled_at ? new Date(r.scheduled_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""} · {r.dog_name ?? "Paseo"}
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

function ReservationDetailModal({
  reservation, ownerName, isMine, isAvailable, onClose, onAccept, onUpdateStatus, updating,
}: {
  reservation: WalkerReservation
  ownerName: string | null
  isMine: boolean
  isAvailable: boolean
  onClose: () => void
  onAccept: () => void
  onUpdateStatus: (s: string) => void
  updating: boolean
}) {
  const status = reservation.status
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-3xl bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="font-display text-2xl font-extrabold">{reservation.dog_name ?? "Paseo"}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-2 text-sm">
          {reservation.dog_size && <p><b>Tamaño:</b> {reservation.dog_size}{reservation.dogs_count > 1 && ` · ${reservation.dogs_count} perros`}</p>}
          {reservation.scheduled_at && (
            <p>
              <b>Cuándo:</b>{" "}
              {new Date(reservation.scheduled_at).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}{" · "}
              {new Date(reservation.scheduled_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {reservation.zone && <p><b>Zona:</b> {reservation.zone}</p>}
          {isMine && reservation.pickup_address && (
            <p className="rounded-xl bg-accent/30 px-3 py-2"><b>Recoger en:</b> {reservation.pickup_address}</p>
          )}
          {isMine && ownerName && <p><b>Dueño:</b> {ownerName}</p>}
          {reservation.notes && <p className="italic text-muted-foreground">{reservation.notes}</p>}
          {isMine && (
            <p className="font-bold text-primary">Ganancia: MX${walkerPayout(Number(reservation.price_mxn))}</p>
          )}
        </div>

        {isAvailable && (
          <div className="mt-5">
            <Button onClick={onAccept} disabled={updating} className="w-full rounded-full font-bold">
              <Check className="h-4 w-4" />
              {updating ? "Aceptando..." : "Aceptar paseo"}
            </Button>
          </div>
        )}

        {isMine && (
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <p className="w-full text-xs font-bold uppercase tracking-wide text-muted-foreground">Cambiar estado</p>
            {(["en_curso", "completada", "cancelada"] as const).map((s) => (
              <button
                key={s}
                disabled={updating || status === s}
                onClick={() => onUpdateStatus(s)}
                className="rounded-full border px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-default"
                style={status === s ? { background: "var(--color-primary)", color: "white", borderColor: "var(--color-primary)" } : { background: "white", color: "var(--color-muted-foreground)", borderColor: "var(--color-border)" }}
              >
                {s === "en_curso" ? "En curso" : s === "completada" ? "Completada" : "Cancelada"}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon,
  title,
  value,
  highlight,
}: {
  icon: React.ReactNode
  title: string
  value: string
  highlight?: boolean
}) {
  return (
    <div
      className={`hover-lift rounded-3xl border bg-background p-5 shadow-sm ${
        highlight ? "border-primary/40 ring-2 ring-primary/20" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${highlight ? "bg-primary text-primary-foreground" : "bg-primary/15"}`}>
          {highlight ? <PawPrint className="h-5 w-5" /> : icon}
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
        </div>
      </div>
    </div>
  )
}

function TabPill({
  active,
  label,
  count,
  onClick,
  highlight,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
  highlight?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow"
          : highlight
          ? "bg-primary/15 text-primary hover:bg-primary/20"
          : "bg-background text-muted-foreground hover:bg-secondary"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-foreground/10"
        }`}
      >
        {count}
      </span>
    </button>
  )
}
