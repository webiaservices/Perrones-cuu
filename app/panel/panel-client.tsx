"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { ArrowLeft, LogOut, PawPrint, CalendarDays, Dog, MapPin, Clock, Check, X, Star } from "lucide-react"
import { ReviewModal } from "@/components/review-modal"

export type Reservation = {
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

const ADMIN_STATUSES = ["buscando_paseador", "confirmada", "en_curso", "completada", "cancelada", "sin_asignar"] as const

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  buscando_paseador: { bg: "#FFF3D6", color: "#9a6b00", label: "Buscando paseador" },
  confirmada: { bg: "#DCF5F1", color: "#19756b", label: "Confirmada" },
  en_curso: { bg: "#E6E6FA", color: "#5a4fcf", label: "En curso" },
  completada: { bg: "#DDEEDD", color: "#2f7a3f", label: "Completada" },
  cancelada: { bg: "#FBE0E0", color: "#b33b3b", label: "Cancelada" },
  sin_asignar: { bg: "#FBE0E0", color: "#b33b3b", label: "Sin asignar" },
}

const ROLE_LABEL: Record<string, string> = {
  dueno: "Dueño",
  paseador: "Paseador",
  admin: "Administrador",
}

export function PanelClient({
  role,
  fullName,
  email,
  userId,
  reservations: initial,
  ownerMap,
  walkerNameMap = {},
}: {
  role: string
  fullName: string | null
  email: string
  userId: string
  reservations: Reservation[]
  ownerMap: Record<string, { name: string | null; phone: string | null }>
  walkerNameMap?: Record<string, string>
}) {
  const router = useRouter()
  const [reservations, setReservations] = useState(initial)
  const [updating, setUpdating] = useState<string | null>(null)
  const [reviewFor, setReviewFor] = useState<Reservation | null>(null)
  const isStaff = role === "paseador" || role === "admin"
  const isWalker = role === "paseador"
  const isAdmin = role === "admin"

  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    const supabase = createClient()
    // Si es paquete, actualiza TODOS los paseos del paquete
    const target = reservations.find((r) => r.id === id)
    const query = supabase.from("reservations").update({ status })
    const { error } = target?.package_id
      ? await query.eq("package_id", target.package_id)
      : await query.eq("id", id)
    setUpdating(null)
    if (!error) {
      setReservations((prev) =>
        prev.map((r) =>
          (target?.package_id ? r.package_id === target.package_id : r.id === id)
            ? { ...r, status }
            : r,
        ),
      )
    }
  }

  // Dueño puede borrar paseos cancelados
  const deleteReservation = async (id: string) => {
    if (!confirm("¿Borrar este paseo cancelado definitivamente?")) return
    const supabase = createClient()
    const target = reservations.find((r) => r.id === id)
    const query = supabase.from("reservations").delete()
    const { error } = target?.package_id
      ? await query.eq("package_id", target.package_id)
      : await query.eq("id", id)
    if (error) { alert(`Error: ${error.message}`); return }
    setReservations((prev) =>
      prev.filter((r) => (target?.package_id ? r.package_id !== target.package_id : r.id !== id)),
    )
  }

  const acceptJale = async (id: string) => {
    setUpdating(id)
    const supabase = createClient()
    // UPDATE atómico: solo aplica si walker_id sigue siendo null
    const { data, error } = await supabase
      .from("reservations")
      .update({ status: "confirmada", walker_id: userId })
      .eq("id", id)
      .is("walker_id", null)
      .select("id, walker_id, status")
      .single()
    setUpdating(null)
    if (error || !data) {
      alert("Otro paseador ya tomó este paseo.")
      setReservations((prev) => prev.filter((r) => r.id !== id))
      return
    }
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "confirmada", walker_id: userId } : r)),
    )
    // Notifica al cliente que su paseo fue aceptado
    fetch("/api/notify-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: id, kind: "asignada" }),
    }).catch(() => {})
  }

  const rejectJale = (id: string) => {
    // Reject local: el jale se quita de la lista de este paseador pero sigue para los demás
    setReservations((prev) => prev.filter((r) => r.id !== id))
  }

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  const fmtDate = (s: string | null) => {
    if (!s) return "Sin fecha"
    return new Date(s).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
  }
  const fmtTime = (s: string | null) => {
    if (!s) return ""
    return new Date(s).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
  }

  // Agrupar paseos recurrentes: solo mostrar el primero de cada paquete
  const groupedReservations = reservations.filter((r) => !r.package_id || (r.package_index ?? 1) === 1)

  // Para paseador: separar jales disponibles vs propios
  const availableJales = isWalker
    ? groupedReservations.filter((r) => r.status === "buscando_paseador" && !r.walker_id)
    : []
  const myWalks = isWalker ? groupedReservations.filter((r) => r.walker_id === userId) : []
  const visible = isWalker ? [...availableJales, ...myWalks] : groupedReservations

  return (
    <main className="min-h-svh bg-[#f0fafa]">
      <header className="border-b border-[#d5ebe8] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-[#0d3333]">
            <ArrowLeft className="h-4 w-4" />
            <span className="font-sans text-sm font-semibold">Volver al inicio</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="gap-1.5 font-semibold text-[#5a8080]"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-10 md:px-8">
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e0f7f5]">
            <PawPrint className="h-7 w-7 text-[#2ba89d]" />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-bold text-[#0d3333]">
              {isAdmin ? "Panel de administración" : isWalker ? "Paseos disponibles y agendados" : "Mis reservas"}
            </h1>
            <p className="text-sm text-[#5a8080]">
              {fullName ? `${fullName} · ` : ""}
              {ROLE_LABEL[role] ?? role} · {email}
            </p>
          </div>
        </div>

        {!isStaff && (
          <div className="mb-6 flex flex-wrap gap-2">
            <Button asChild className="rounded-full bg-[#3DCABD] font-bold text-white hover:bg-[#2ba89d]">
              <Link href="/#precios">Agendar nuevo paseo</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full font-bold">
              <Link href="/mis-perros">
                <Dog className="h-4 w-4" />
                Mis perros
              </Link>
            </Button>
          </div>
        )}

        {visible.length === 0 ? (
          <div className="rounded-3xl border border-[#d5ebe8] bg-white p-12 text-center">
            <Dog className="mx-auto mb-4 h-10 w-10 text-[#3DCABD]" />
            <p className="font-serif text-xl text-[#0d3333]">
              {isWalker
                ? "No hay paseos disponibles en tu zona ahora."
                : isAdmin
                ? "Todavía no hay reservas."
                : "Aún no tienes reservas."}
            </p>
            <p className="mt-1 text-sm text-[#5a8080]">
              {isWalker
                ? "Cuando un dueño agende un paseo en tu zona te aparecerá aquí."
                : isAdmin
                ? "Cuando un dueño reserve un paseo, aparecerá aquí."
                : "Reserva un paseo desde la página principal y lo verás aquí."}
            </p>
            {!isStaff && (
              <Button
                onClick={() => router.push("/#precios")}
                className="mt-6 rounded-full bg-[#3DCABD] font-bold text-white hover:bg-[#2ba89d]"
              >
                Reservar un paseo
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {visible.map((r) => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.buscando_paseador
              const owner = ownerMap[r.user_id]
              const isMyJale = isWalker && r.walker_id === userId
              const isAvailable = isWalker && !r.walker_id && r.status === "buscando_paseador"
              // Paseador NO ve ningún precio ni ganancia

              return (
                <div
                  key={r.id}
                  className="rounded-3xl border border-[#d5ebe8] bg-white p-6 transition-shadow hover:shadow-lg"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <h3 className="font-serif text-xl text-[#0d3333]">{r.plan_name}</h3>
                          <span
                            className="rounded-full px-2.5 py-0.5 text-xs font-bold"
                            style={{ background: st.bg, color: st.color }}
                          >
                            {st.label}
                          </span>
                          {isAvailable && (
                            <span className="rounded-full bg-[#3DCABD]/15 px-2.5 py-0.5 text-xs font-bold text-[#2ba89d]">
                              Nuevo paseo
                            </span>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-1.5 text-sm text-[#5a8080] sm:grid-cols-2">
                          {r.dog_name && (
                            <span className="flex items-center gap-1.5">
                              <Dog className="h-4 w-4" />
                              {r.dog_name}
                              {r.dog_size && ` · ${r.dog_size}`}
                              {r.dogs_count > 1 && ` · ${r.dogs_count} perros`}
                            </span>
                          )}
                          {r.scheduled_at && (
                            <span className="flex items-center gap-1.5">
                              <CalendarDays className="h-4 w-4" />
                              {fmtDate(r.scheduled_at)} · {fmtTime(r.scheduled_at)}
                              {r.scheduled_until && `–${fmtTime(r.scheduled_until)}`}
                            </span>
                          )}
                          {r.zone && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4" />
                              {r.zone}
                            </span>
                          )}
                          {!isWalker && (
                            <span className="flex items-center gap-1.5 font-bold text-[#2ba89d]">
                              <Clock className="h-4 w-4" />
                              MX${Number(r.price_mxn).toFixed(0)}
                            </span>
                          )}
                        </div>

                        {/* Admin y dueño ven dirección; paseador solo cuando ya aceptó */}
                        {(isAdmin || (isWalker && isMyJale) || (!isStaff && r.user_id === userId)) && r.pickup_address && (
                          <p className="mt-2 text-sm text-[#5a8080]">
                            <b>Recoger en:</b> {r.pickup_address}
                          </p>
                        )}

                        {isStaff && owner && (isAdmin || isMyJale) && (
                          <p className="mt-2 text-sm text-[#5a8080]">
                            Dueño: <span className="font-semibold text-[#0d3333]">{owner.name ?? "Sin nombre"}</span>
                            {/* Paseador no ve teléfono; admin sí */}
                            {isAdmin && owner.phone ? ` · ${owner.phone}` : ""}
                          </p>
                        )}

                        {/* Dueño ve quién es el paseador asignado */}
                        {!isStaff && r.user_id === userId && r.walker_id && (
                          <p className="mt-2 text-sm text-[#5a8080]">
                            🚶 Paseador asignado: <span className="font-bold text-[#0d3333]">{walkerNameMap[r.walker_id] ?? "Asignado"}</span>
                          </p>
                        )}

                        {r.notes && (
                          <p className="mt-2 text-sm italic text-[#5a8080]">{r.notes}</p>
                        )}
                      </div>

                      {/* Botón Dejar reseña para dueño en paseos completados */}
                      {!isStaff && r.status === "completada" && r.user_id === userId && (
                        <Button
                          onClick={() => setReviewFor(r)}
                          className="rounded-full bg-amber-500 font-bold text-white hover:bg-amber-600"
                        >
                          <Star className="h-4 w-4 fill-white" />
                          Dejar reseña
                        </Button>
                      )}

                      {/* Botón Modificar via WhatsApp + Cancelar (dueño, antes de empezar) */}
                      {!isStaff &&
                        r.user_id === userId &&
                        (r.status === "buscando_paseador" || r.status === "confirmada") && (
                          <>
                            <Button
                              asChild
                              variant="outline"
                              className="rounded-full font-bold"
                            >
                              <a
                                href={`https://wa.me/526145948513?text=${encodeURIComponent(
                                  `Hola Perrones! Quiero modificar mi paseo del ${r.scheduled_at ? new Date(r.scheduled_at).toLocaleString("es-MX") : "—"} (${r.zone ?? ""}). ID: ${r.id.slice(0, 8)}`
                                )}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                💬 Modificar por WhatsApp
                              </a>
                            </Button>
                            <Button
                              onClick={() => {
                                if (confirm("¿Seguro que quieres cancelar este paseo? Esta acción no se puede deshacer.")) {
                                  updateStatus(r.id, "cancelada")
                                  // Si había paseador asignado, notificarle
                                  if (r.walker_id) {
                                    fetch("/api/notify-paseador-cancelado", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ reservationId: r.id }),
                                    }).catch(() => {})
                                  }
                                }
                              }}
                              disabled={updating === r.id}
                              variant="outline"
                              className="rounded-full border-destructive/40 font-bold text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-4 w-4" />
                              Cancelar paseo
                            </Button>
                          </>
                        )}
                        {!isWalker && r.status === "cancelada" && (
                          <Button
                            onClick={() => deleteReservation(r.id)}
                            variant="outline"
                            className="rounded-full border-destructive/40 font-bold text-destructive hover:bg-destructive/10"
                          >
                            🗑 Borrar
                          </Button>
                        )}

                      {/* Botones aceptar/rechazar para paseador en jales disponibles */}
                      {isAvailable && (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => rejectJale(r.id)}
                            disabled={updating === r.id}
                            variant="outline"
                            className="rounded-full font-bold"
                          >
                            <X className="h-4 w-4" /> Rechazar
                          </Button>
                          <Button
                            onClick={() => acceptJale(r.id)}
                            disabled={updating === r.id}
                            className="rounded-full bg-[#3DCABD] font-bold text-white hover:bg-[#2ba89d]"
                          >
                            <Check className="h-4 w-4" />
                            {updating === r.id ? "Aceptando..." : "Aceptar paseo"}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Cambiar status: admin (todos) y paseador (solo en sus propios) */}
                    {(isAdmin || (isWalker && isMyJale)) && (
                      <div className="flex flex-wrap gap-2 border-t border-[#e0f0ee] pt-3">
                        {(isAdmin ? ADMIN_STATUSES : (["en_curso", "completada", "cancelada"] as const)).map((s) => (
                          <button
                            key={s}
                            disabled={updating === r.id || r.status === s}
                            onClick={() => updateStatus(r.id, s)}
                            className="rounded-full border px-3 py-1.5 text-xs font-bold transition-all disabled:cursor-default"
                            style={
                              r.status === s
                                ? { background: "#3DCABD", color: "white", borderColor: "#3DCABD" }
                                : { background: "white", color: "#5a8080", borderColor: "#d5ebe8" }
                            }
                          >
                            {STATUS_STYLE[s]?.label ?? s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de reseña */}
      {reviewFor && (
        <ReviewModal
          open={!!reviewFor}
          onOpenChange={(v) => !v && setReviewFor(null)}
          reservation={{
            id: reviewFor.id,
            dog_name: reviewFor.dog_name ?? null,
            user_id: reviewFor.user_id,
            walker_id: reviewFor.walker_id,
          }}
          onSaved={() => {
            setReviewFor(null)
            router.refresh()
          }}
        />
      )}
    </main>
  )
}
