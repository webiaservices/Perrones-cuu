"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  LogOut,
  Search,
  Table as TableIcon,
  CalendarDays,
  Clock,
  DollarSign,
  CheckCircle2,
  Users,
  Heart,
  Footprints,
  ShieldCheck,
  Star,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LogoCircle } from "@/components/logo-circle"
import { createClient } from "@/lib/supabase/client"
import { STATUS_LABELS, ADMIN_SHARE, adminFeeFor, walkerPayoutFor } from "@/lib/constants"

export type AdminReservation = {
  id: string
  user_id: string
  walker_id: string | null
  plan_name: string
  dogs_count: number
  price_mxn: number
  status: string
  notes: string | null
  created_at: string
  scheduled_at: string | null
  scheduled_until: string | null
  zone: string | null
  pickup_address: string | null
  dog_name: string | null
  dog_size: string | null
  visibility?: string | null
  payment_status?: string | null
  manual_client_name?: string | null
  manual_client_phone?: string | null
  package_id?: string | null
  package_index?: number | null
  package_total?: number | null
  admin_fee_mxn?: number | null
}

const ALL_STATUSES = [
  "buscando_paseador",
  "confirmada",
  "en_curso",
  "completada",
  "cancelada",
  "sin_asignar",
] as const

const STATUS_BG: Record<string, string> = {
  buscando_paseador: "bg-amber-100 text-amber-800",
  confirmada: "bg-emerald-100 text-emerald-800",
  en_curso: "bg-indigo-100 text-indigo-800",
  completada: "bg-emerald-200 text-emerald-900",
  cancelada: "bg-rose-100 text-rose-800 line-through",
  sin_asignar: "bg-rose-100 text-rose-800",
}

// Paleta de colores para paseadores
const WALKER_COLORS = [
  "#3DCABD",
  "#F59E0B",
  "#3B82F6",
  "#A855F7",
  "#EF4444",
  "#10B981",
  "#EC4899",
  "#0EA5E9",
]

function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay() // 0=dom, 1=lun
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function fmtDateShort(d: Date) {
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
}

function durationMin(start: string | null, end: string | null) {
  if (!start || !end) return 30
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

export type AdminUser = {
  id: string
  full_name: string | null
  phone: string | null
  role: string
  zone: string | null
  banned?: boolean
  created_at: string
}

type AdminReview = {
  id: string
  rating: number
  comment: string | null
  approved: boolean
  created_at: string
  name: string
  dog: string
}

export function AdminPanel({
  fullName,
  email,
  reservations: initial,
  ownerMap,
  walkerMap,
  allUsers = [],
  reviews: initialReviews = [],
  initialAdminPct = null,
}: {
  fullName: string | null
  email: string
  reservations: AdminReservation[]
  ownerMap: Record<string, { name: string | null; phone: string | null }>
  walkerMap: Record<string, { name: string | null }>
  initialAdminPct?: number | null
  allUsers?: AdminUser[]
  reviews?: AdminReview[]
}) {
  const router = useRouter()
  const [reservations, setReservations] = useState(initial)
  const [users, setUsers] = useState(allUsers)
  const [reviews, setReviews] = useState(initialReviews)
  const [view, setView] = useState<"tabla" | "calendario" | "usuarios" | "resenas">("tabla")
  // Reparto: default el admin se queda el 30% del precio. Editable en PESOS
  // por paseo (admin_fee_mxn en la reserva). adminFee (global, en pesos) es el
  // default que se estampa en los paseos que TÚ creas; null = usar 30%.
  // MISMA fórmula que ve el paseador en su panel y sus correos (lib/constants).
  const [adminFee, setAdminFee] = useState<number | null>(initialAdminPct)
  const [savingFee, setSavingFee] = useState(false)
  // admin_fee_mxn = TOTAL en pesos que se queda el admin de ese paseo/paquete.
  // Prefill del editor = 30% del total si aún no hay override.
  const feeForReservation = (r: AdminReservation) =>
    r.admin_fee_mxn ?? Math.round(effectivePrice(r) * ADMIN_SHARE)
  const adminShareFor = (r: AdminReservation) => adminFeeFor(effectivePrice(r), r.admin_fee_mxn)
  const walkerShareFor = (r: AdminReservation) => walkerPayoutFor(effectivePrice(r), r.admin_fee_mxn)
  const saveAdminFee = async (v: number | null) => {
    setAdminFee(v)
    setSavingFee(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from("profiles").update({ commission_pct: v }).eq("id", user.id)
    }
    setSavingFee(false)
  }
  const [updatingUser, setUpdatingUser] = useState<string | null>(null)
  const [assignFor, setAssignFor] = useState<AdminReservation | null>(null)
  const [assigning, setAssigning] = useState(false)
  const [creating, setCreating] = useState(false)
  const [clientMode, setClientMode] = useState<"registered" | "manual">("registered")
  const [newPaseo, setNewPaseo] = useState({
    user_id: "",
    manual_client_name: "",
    manual_client_phone: "",
    walker_id: "", // vacío = no asignar (queda pending_admin)
    plan_name: "Paseo de 1 día",
    dogs_count: 1,
    price_mxn: 110,
    zone: "",
    pickup_address: "",
    dog_name: "",
    dog_size: "mediano",
    scheduled_at: "",
    notes: "",
  })
  // Slots para planes recurrentes (admin crea N paseos en N fechas/horas distintas)
  const planWalksMap: Record<string, number> = {
    "Paseo de 1 día": 1, "Paseo de 3 días": 3, "Paseo semanal": 5, "VIP 7 días": 7,
  }
  const [newSlots, setNewSlots] = useState<{ date: string; startHour: string }[]>([
    { date: "", startHour: "09:00" },
  ])
  const ensureSlotsLength = (planName: string) => {
    const n = planWalksMap[planName] ?? 1
    setNewSlots((prev) => {
      if (prev.length === n) return prev
      const base = prev[0]?.date ?? ""
      return Array.from({ length: n }, (_, i) => prev[i] ?? { date: base, startHour: "09:00" })
    })
  }
  const updateNewSlot = (i: number, patch: Partial<{ date: string; startHour: string }>) => {
    setNewSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }

  const allOwners = useMemo(() => users.filter((u) => u.role === "dueno" && !u.banned), [users])

  const createReservation = async () => {
    if (clientMode === "registered" && !newPaseo.user_id) { alert("Selecciona un cliente"); return }
    if (clientMode === "manual" && !newPaseo.manual_client_name.trim()) { alert("Nombre del cliente"); return }
    if (!newPaseo.dog_name) { alert("Nombre del perro"); return }
    if (!newPaseo.zone) { alert("Zona"); return }
    if (!newSlots.every((s) => s.date && s.startHour)) { alert("Llena fecha y hora de cada día"); return }

    setCreating(true)
    const supabase = createClient()

    // Para cliente manual: usa el admin como user_id pero guarda los datos manuales
    const { data: { user: currentAdmin } } = await supabase.auth.getUser()
    const userId = clientMode === "registered" ? newPaseo.user_id : currentAdmin?.id
    if (!userId) { setCreating(false); alert("Error: admin no identificado"); return }

    const assignedNow = newPaseo.walker_id !== ""
    const walks = newSlots.length
    const packageId = walks > 1 ? crypto.randomUUID() : null

    // Ordena slots cronológicamente
    const ordered = [...newSlots].sort((a, b) => {
      const ta = new Date(`${a.date}T${a.startHour}:00`).getTime()
      const tb = new Date(`${b.date}T${b.startHour}:00`).getTime()
      return ta - tb
    })

    const rows = ordered.map((slot, i) => {
      const at = new Date(`${slot.date}T${slot.startHour}:00`)
      const until = new Date(at.getTime() + 60 * 60 * 1000)
      return {
        user_id: userId,
        manual_client_name: clientMode === "manual" ? newPaseo.manual_client_name : null,
        manual_client_phone: clientMode === "manual" ? newPaseo.manual_client_phone : null,
        walker_id: assignedNow ? newPaseo.walker_id : null,
        plan_name: newPaseo.plan_name,
        dogs_count: newPaseo.dogs_count,
        // Solo el primero lleva el precio total
        price_mxn: i === 0 ? newPaseo.price_mxn : 0,
        status: assignedNow ? "confirmada" : "buscando_paseador",
        // Sin paseador = privado (pending_admin) como promete el modal: tú
        // decides cuándo abrirlo con "Hacer público". Antes se publicaba y
        // notificaba a todos los paseadores aunque eligieras "dejar privado".
        visibility: assignedNow ? "public" : "pending_admin",
        notes: i === 0
          ? (newPaseo.notes || (clientMode === "manual" ? "Cliente manual (sin registro)" : "Creado por admin"))
          : `Paseo ${i + 1} de ${walks} del paquete "${newPaseo.plan_name}"`,
        scheduled_at: at.toISOString(),
        scheduled_until: until.toISOString(),
        // Estampa tu comisión global (en pesos/paseo) si la tienes definida;
        // null = se calcula 30% del precio automáticamente
        admin_fee_mxn: adminFee,
        zone: newPaseo.zone,
        pickup_address: newPaseo.pickup_address,
        dog_name: newPaseo.dog_name,
        dog_size: newPaseo.dog_size,
        package_id: packageId,
        package_index: walks > 1 ? i + 1 : null,
        package_total: walks > 1 ? walks : null,
      }
    })

    const { data, error } = await supabase
      .from("reservations")
      .insert(rows)
      .select()
    setCreating(false)
    if (error) { alert(`Error: ${error.message}`); return }
    const firstRow = (data as AdminReservation[])[0]

    setReservations((prev) => [...(data as AdminReservation[]), ...prev])
    setNewPaseo({
      user_id: "", manual_client_name: "", manual_client_phone: "", walker_id: "", plan_name: "Paseo de 1 día", dogs_count: 1, price_mxn: 110,
      zone: "", pickup_address: "", dog_name: "", dog_size: "mediano", scheduled_at: "", notes: "",
    })
    setNewSlots([{ date: "", startHour: "09:00" }])
    setClientMode("registered")
    setShowCreateModal(false)

    // Solo notifica por correo si el cliente está registrado (los manuales no tienen email)
    if (clientMode === "registered" && firstRow) {
      if (assignedNow) {
        fetch("/api/notify-cliente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: firstRow.id, kind: "asignada" }),
        }).catch(() => {})
      } else {
        fetch("/api/notify-cliente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: firstRow.id, kind: "reservada" }),
        }).catch(() => {})
      }
    }

    // Si asignaste paseador directo, avísale (antes se quedaba sin enterarse
    // a menos que abriera su panel)
    if (assignedNow && firstRow) {
      fetch("/api/notify-walker-assigned", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reservationId: firstRow.id }),
      }).catch(() => {})
    }
    // Nota: ya NO se notifica a todos los paseadores aquí — el paseo queda
    // privado (pending_admin) hasta que le des "Hacer público", y eso sí notifica.
  }

  const [showCreateModal, setShowCreateModal] = useState(false)

  // Paseadores disponibles (no baneados) para asignación manual
  const availableWalkers = useMemo(
    () => users.filter((u) => u.role === "paseador" && !u.banned),
    [users],
  )

  const assignWalker = async (reservationId: string, walkerId: string) => {
    setAssigning(true)
    const supabase = createClient()
    const target = reservations.find((r) => r.id === reservationId)
    // Al asignar manual: queda confirmada + visible + con paseador en un solo update.
    // Para paquetes multi-día se asigna el PAQUETE COMPLETO (todos los días),
    // no solo el paseo 1 — igual que cuando un paseador acepta.
    const query = supabase
      .from("reservations")
      .update({
        status: "confirmada",
        walker_id: walkerId,
        visibility: "public", // ya no es privada, queda lista para el paseador
      })
    const { error } = target?.package_id
      ? await query.eq("package_id", target.package_id)
      : await query.eq("id", reservationId)
    setAssigning(false)
    if (error) {
      alert(`Error: ${error.message}`)
      return
    }
    setReservations((prev) =>
      prev.map((r) =>
        (target?.package_id ? r.package_id === target.package_id : r.id === reservationId)
          ? { ...r, walker_id: walkerId, status: "confirmada", visibility: "public" }
          : r,
      ),
    )
    setAssignFor(null)
    // Notifica al cliente y al paseador
    fetch("/api/notify-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId, kind: "asignada" }),
    }).catch(() => {})
    // Notifica al paseador específico que el admin lo asignó
    fetch("/api/notify-walker-assigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId }),
    }).catch(() => {})
  }

  const makePublic = async (id: string) => {
    const supabase = createClient()
    const target = reservations.find((r) => r.id === id)
    // Paquetes: se abren completos (todas las fechas)
    const query = supabase.from("reservations").update({ visibility: "public" })
    const { error } = target?.package_id
      ? await query.eq("package_id", target.package_id)
      : await query.eq("id", id)
    if (error) return alert(error.message)
    setReservations((prev) =>
      prev.map((r) =>
        (target?.package_id ? r.package_id === target.package_id : r.id === id)
          ? { ...r, visibility: "public" }
          : r,
      ),
    )
    // Notifica a paseadores
    fetch("/api/notify-paseadores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservationId: id }),
    }).catch(() => {})
  }

  const togglePayment = async (id: string, paid: boolean) => {
    const supabase = createClient()
    const newStatus = paid ? "pagado" : "pendiente"
    const { error } = await supabase.from("reservations").update({ payment_status: newStatus }).eq("id", id)
    if (error) return alert(error.message)
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, payment_status: newStatus } : r)))
  }

  const updateUserRole = async (id: string, newRole: string) => {
    if (!confirm(`¿Cambiar rol a ${newRole}?`)) return
    setUpdatingUser(id)
    const supabase = createClient()
    const { error } = await supabase.from("profiles").update({ role: newRole }).eq("id", id)
    setUpdatingUser(null)
    if (error) {
      alert(`Error: ${error.message}`)
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: newRole } : u)))
  }

  const toggleBan = async (id: string, banned: boolean) => {
    if (!confirm(banned ? "¿Banear este usuario?" : "¿Reactivar este usuario?")) return
    setUpdatingUser(id)
    const supabase = createClient()
    const { error } = await supabase.from("profiles").update({ banned }).eq("id", id)
    setUpdatingUser(null)
    if (error) {
      alert(`Error: ${error.message}`)
      return
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, banned } : u)))
  }
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("todos")
  const [updating, setUpdating] = useState<string | null>(null)

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  // Mapa paseador → color
  const walkerColor = useMemo(() => {
    const ids = Array.from(new Set(reservations.map((r) => r.walker_id).filter(Boolean) as string[]))
    const map: Record<string, string> = {}
    ids.forEach((id, i) => { map[id] = WALKER_COLORS[i % WALKER_COLORS.length] })
    return map
  }, [reservations])

  // Reservas de la semana actual
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const weekReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (!r.scheduled_at) return false
      const d = new Date(r.scheduled_at)
      return d >= weekStart && d <= addDays(weekStart, 7)
    })
  }, [reservations, weekStart])

  // Mapa: package_id → todas las fechas de ese paquete (ordenadas)
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

  // Precio total por paquete (suma price_mxn de todos los paseos del paquete)
  const packagePrices = useMemo(() => {
    const m: Record<string, number> = {}
    reservations.forEach((r) => {
      if (r.package_id) {
        m[r.package_id] = (m[r.package_id] ?? 0) + Number(r.price_mxn || 0)
      }
    })
    return m
  }, [reservations])

  // Precio efectivo de una fila (si es paquete, el total; si no, el precio individual)
  const effectivePrice = (r: AdminReservation) =>
    r.package_id ? (packagePrices[r.package_id] ?? Number(r.price_mxn || 0)) : Number(r.price_mxn || 0)

  // Métricas de la semana
  const stats = useMemo(() => {
    const active = weekReservations.filter((r) => r.status !== "cancelada")
    const agendados = active.length
    const completados = active.filter((r) => r.status === "completada").length
    const totalMin = active.reduce((sum, r) => sum + durationMin(r.scheduled_at, r.scheduled_until), 0)
    const totalH = Math.floor(totalMin / 60)
    const totalRem = totalMin % 60
    // Solo cuenta el primero de cada paquete para no duplicar ingreso
    const uniqueForIncome = active.filter((r) => !r.package_id || (r.package_index ?? 1) === 1)
    // MISMA fórmula que la columna Reparto y que el panel del paseador
    const totalIngresos = uniqueForIncome.reduce((sum, r) => sum + adminShareFor(r), 0)
    const ingresosCompletados = uniqueForIncome
      .filter((r) => r.status === "completada")
      .reduce((sum, r) => sum + adminShareFor(r), 0)
    const tasa = active.length > 0 ? Math.round((completados / active.length) * 100) : null
    return { agendados, completados, totalMin, totalH, totalRem, totalIngresos, ingresosCompletados, tasa }
  }, [weekReservations, packagePrices, adminFee])

  const filtered = useMemo(() => {
    // Agrupar paseos recurrentes: solo mostrar el primero de cada paquete
    let arr = reservations.filter((r) => !r.package_id || (r.package_index ?? 1) === 1)
    if (statusFilter !== "todos") arr = arr.filter((r) => r.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter((r) => {
        const dog = (r.dog_name ?? "").toLowerCase()
        const walker = (r.walker_id ? walkerMap[r.walker_id]?.name ?? "" : "").toLowerCase()
        const owner = (r.manual_client_name ?? ownerMap[r.user_id]?.name ?? "").toLowerCase()
        const zone = (r.zone ?? "").toLowerCase()
        return dog.includes(q) || walker.includes(q) || owner.includes(q) || zone.includes(q)
      })
    }
    return arr.sort((a, b) => {
      const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0
      const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0
      return tb - ta
    })
  }, [reservations, search, statusFilter, walkerMap, ownerMap])

  // Guarda el admin_fee_mxn en una reservación específica (o el paquete entero).
  // value = null → borra el override y vuelve al 30% automático.
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null)
  const [editingFeeValue, setEditingFeeValue] = useState<number | null>(null)
  const saveReservationFee = async (r: AdminReservation, value: number | null) => {
    const supabase = createClient()
    const query = supabase.from("reservations").update({ admin_fee_mxn: value })
    const { error } = r.package_id ? await query.eq("package_id", r.package_id) : await query.eq("id", r.id)
    if (error) { alert(`Error: ${error.message}`); return }
    setReservations((prev) =>
      prev.map((x) => (r.package_id ? x.package_id === r.package_id : x.id === r.id) ? { ...x, admin_fee_mxn: value } : x),
    )
    setEditingFeeId(null)
  }

  // Reseñas: pendientes (por moderar) primero
  const pendingReviews = useMemo(() => reviews.filter((r) => !r.approved), [reviews])
  const approvedReviews = useMemo(() => reviews.filter((r) => r.approved), [reviews])

  const approveReview = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("reviews").update({ approved: true }).eq("id", id)
    if (error) { alert(`Error: ${error.message}`); return }
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, approved: true } : r)))
  }
  const unapproveReview = async (id: string) => {
    const supabase = createClient()
    const { error } = await supabase.from("reviews").update({ approved: false }).eq("id", id)
    if (error) { alert(`Error: ${error.message}`); return }
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, approved: false } : r)))
  }
  const deleteReview = async (id: string) => {
    if (!confirm("¿Borrar esta reseña definitivamente?")) return
    const supabase = createClient()
    const { error } = await supabase.from("reviews").delete().eq("id", id)
    if (error) { alert(`Error: ${error.message}`); return }
    setReviews((prev) => prev.filter((r) => r.id !== id))
  }

  // Borrar paseo (cancelado o cualquier estado, solo admin)
  const deleteReservation = async (id: string) => {
    const r = reservations.find((x) => x.id === id)
    if (!confirm(`¿Borrar definitivamente este paseo${r?.dog_name ? ` de ${r.dog_name}` : ""}?`)) return
    const supabase = createClient()
    // Si es paquete, borra todos los del paquete
    const query = supabase.from("reservations").delete()
    const { error } = r?.package_id ? await query.eq("package_id", r.package_id) : await query.eq("id", id)
    if (error) { alert(`Error: ${error.message}`); return }
    setReservations((prev) => prev.filter((x) => (r?.package_id ? x.package_id !== r.package_id : x.id !== id)))
  }

  // Cambio de estado. Para paquetes multi-día "cancelada" aplica a TODO el
  // paquete (la tabla solo muestra el paseo 1; si no, los días 2-N quedarían
  // vivos e invisibles). Completada/en_curso sí son por paseo individual.
  const updateStatus = async (id: string, status: string) => {
    setUpdating(id)
    const supabase = createClient()
    const r = reservations.find((x) => x.id === id)
    const wholePackage = !!r?.package_id && status === "cancelada"
    const query = supabase.from("reservations").update({ status })
    // Al cancelar un paquete NO se tocan los días ya completados (conservan
    // su registro e ingreso); solo se cancelan los que aún no ocurrieron
    const { error } = wholePackage
      ? await query.eq("package_id", r!.package_id!).neq("status", "completada")
      : await query.eq("id", id)
    setUpdating(null)
    if (!error) {
      setReservations((prev) =>
        prev.map((x) =>
          (wholePackage ? x.package_id === r!.package_id && x.status !== "completada" : x.id === id)
            ? { ...x, status }
            : x,
        ),
      )
      // Si se marca como completada, mandamos recordatorio de pago al dueño
      if (status === "completada") {
        fetch("/api/notify-pago", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: id }),
        }).catch(() => {})
      }
      // Si se cancela y hay paseador asignado, avisarle (antes nadie se enteraba)
      if (status === "cancelada" && r?.walker_id) {
        fetch("/api/notify-paseador-cancelado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reservationId: id }),
        }).catch(() => {})
      }
    }
  }

  // Export CSV
  const exportCSV = () => {
    // Expande los paquetes: una fila por CADA paseo (la tabla en pantalla solo
    // muestra el día 1, pero el registro/Excel debe traer todos los días)
    const expanded = filtered.flatMap((r) =>
      r.package_id
        ? reservations
            .filter((x) => x.package_id === r.package_id)
            .sort((a, b) => (a.package_index ?? 1) - (b.package_index ?? 1))
        : [r],
    )
    const rows = [
      ["Fecha", "Hora", "Perro", "Tamaño", "Paseador", "Zona", "Duración (min)", "Precio MXN", "Paquete", "Estado", "Dueño"],
      ...expanded.map((r) => [
        r.scheduled_at ? new Date(r.scheduled_at).toLocaleDateString("es-MX") : "",
        r.scheduled_at ? fmtTime(r.scheduled_at) : "",
        r.dog_name ?? "",
        r.dog_size ?? "",
        r.walker_id ? walkerMap[r.walker_id]?.name ?? "" : "",
        r.zone ?? "",
        String(durationMin(r.scheduled_at, r.scheduled_until)),
        String(r.price_mxn),
        r.package_id ? `${r.package_index ?? 1} de ${r.package_total ?? 1}` : "",
        STATUS_LABELS[r.status] ?? r.status,
        r.manual_client_name ?? ownerMap[r.user_id]?.name ?? "",
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")
    // BOM UTF-8 para que Excel en Windows no muestre "DuraciÃ³n"/"TamaÃ±o"
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `perrones-paseos-${(() => {
      const d = new Date()
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    })()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Calendario: días de la semana
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  // Rango de horas dinámico: base 06:00-20:00 pero se expande si hay paseos
  // fuera de ese horario (antes un paseo de 21:00 era invisible en el calendario)
  const hourBounds = useMemo(() => {
    let min = 6, max = 20
    reservations.forEach((r) => {
      if (!r.scheduled_at) return
      const h = new Date(r.scheduled_at).getHours()
      if (h < min) min = h
      if (h > max) max = h
    })
    return { min, max }
  }, [reservations])
  const hours = Array.from({ length: hourBounds.max - hourBounds.min + 1 }, (_, i) => i + hourBounds.min)
  const dayNames = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]

  const reservationsByDay = useMemo(() => {
    const map: Record<string, AdminReservation[]> = {}
    for (const d of days) map[d.toDateString()] = []
    for (const r of weekReservations) {
      if (!r.scheduled_at) continue
      const key = new Date(r.scheduled_at).toDateString()
      if (map[key]) map[key].push(r)
    }
    return map
  }, [weekReservations, days])

  const uniqueWalkers = useMemo(() => {
    const set = new Set<string>()
    reservations.forEach((r) => r.walker_id && set.add(r.walker_id))
    return Array.from(set)
  }, [reservations])

  return (
    <main className="min-h-svh bg-secondary/30">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3">
            <LogoCircle className="h-10 w-10" />
            <span className="font-display text-xl font-extrabold tracking-tight">Perrones Cuu · Admin</span>
          </Link>
          <Button variant="outline" size="sm" onClick={logout} className="gap-1.5 rounded-full font-semibold">
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{fullName ?? email}</p>
          <Button onClick={() => setShowCreateModal(true)} className="rounded-full bg-primary font-bold text-primary-foreground hover:bg-primary/90">
            + Nuevo paseo
          </Button>
        </div>

        {/* Resumen de la semana */}
        <section className="mt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight">Resumen de la semana</h1>
              <p className="text-sm text-muted-foreground">
                {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)} {weekEnd.getFullYear()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekStart(addDays(weekStart, -7))}
                className="rounded-full"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className="rounded-full bg-primary px-5 font-bold text-primary-foreground hover:bg-primary/90"
              >
                Esta semana
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setWeekStart(addDays(weekStart, 7))}
                className="rounded-full"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<CalendarDays className="h-5 w-5 text-primary" />}
              title="Paseos esta semana"
              value={String(stats.agendados)}
              sub={`${stats.agendados} agendados · ${stats.completados} completados`}
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-primary" />}
              title="Horas de paseo"
              value={`${stats.totalH}h ${stats.totalRem}m`}
              sub="Tiempo activo (sin cancelados)"
            />
            <StatCard
              icon={<DollarSign className="h-5 w-5 text-primary" />}
              title="Mi ingreso"
              value={`$${stats.totalIngresos.toLocaleString()}`}
              sub={`$${stats.ingresosCompletados.toLocaleString()} ya completados · solo tu parte`}
            />
            <StatCard
              icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
              title="Tasa de completado"
              value={stats.tasa !== null ? `${stats.tasa}%` : "—"}
              sub={stats.tasa !== null ? "De los paseos de la semana" : "Sin paseos esta semana"}
            />
          </div>
        </section>

        {/* Configuración de comisión */}
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
          <div>
            <p className="text-sm font-bold">Reparto de ganancias</p>
            <p className="text-xs text-muted-foreground">
              Define cuánto ganas tú por cada paseo (en pesos). Lo demás va al paseador.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold">Mi ganancia por paseo: $</label>
            <Input
              type="number"
              min={0}
              value={adminFee ?? ""}
              placeholder="auto (30%)"
              onChange={(e) => setAdminFee(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
              className="w-24"
            />
            <span className="text-xs font-bold text-muted-foreground">MXN · vacío = 30% del precio</span>
            <button
              onClick={() => saveAdminFee(adminFee)}
              disabled={savingFee}
              className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {savingFee ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>

        {/* Toggle tabla / calendario / usuarios */}
        <div className="mt-6 flex flex-wrap items-center gap-2 rounded-full bg-background p-1.5 shadow-sm w-fit">
          <button
            onClick={() => setView("tabla")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              view === "tabla" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <TableIcon className="h-4 w-4" />
            Tabla
          </button>
          <button
            onClick={() => setView("calendario")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              view === "calendario" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Calendar className="h-4 w-4" />
            Calendario
          </button>
          <button
            onClick={() => setView("usuarios")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              view === "usuarios" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Users className="h-4 w-4" />
            Usuarios <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs">{users.length}</span>
          </button>
          <button
            onClick={() => setView("resenas")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-all ${
              view === "resenas" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Star className="h-4 w-4" />
            Reseñas
            {pendingReviews.length > 0 && (
              <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs text-amber-950">{pendingReviews.length}</span>
            )}
          </button>
        </div>

        {/* Vista tabla */}
        {view === "tabla" && (
          <section className="mt-6 rounded-3xl border border-border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Registro de paseos</h2>
              <Button onClick={exportCSV} className="rounded-full bg-primary font-bold text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" />
                Exportar a Excel/CSV
              </Button>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar por perro, paseador, dueño o zona…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded-full pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold"
              >
                <option value="todos">Todos los estados</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4">Fecha</th>
                    <th className="pb-3 pr-4">Perro</th>
                    <th className="pb-3 pr-4">Cliente</th>
                    <th className="pb-3 pr-4">Paseador</th>
                    <th className="pb-3 pr-4">Zona</th>
                    <th className="pb-3 pr-4">Duración</th>
                    <th className="pb-3 pr-4">Precio total</th>
                    <th className="pb-3 pr-4">Reparto</th>
                    <th className="pb-3 pr-4">Estado</th>
                    <th className="pb-3 pr-4">Visibilidad</th>
                    <th className="pb-3">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-muted-foreground">
                        Sin reservas con esos filtros.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r) => {
                      // Solo muestra "Hacer público" si está PENDIENTE Y todavía sin asignar Y buscando paseador
                      const canMakePublic = r.visibility === "pending_admin" && r.status === "buscando_paseador" && !r.walker_id
                      const isPaid = r.payment_status === "pagado"
                      return (
                      <tr key={r.id} className={`border-b border-border/50 align-top ${canMakePublic ? "bg-amber-50" : ""}`}>
                        <td className="py-3 pr-4 font-semibold">
                          {r.scheduled_at ? (
                            r.package_id && packageDates[r.package_id]?.length > 1 ? (
                              <>
                                <div className="text-xs leading-tight">
                                  {packageDates[r.package_id].map((d, di) => (
                                    <div key={di} className="capitalize">
                                      {d.toLocaleDateString("es-MX", { weekday: "long" })} · {d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                                    </div>
                                  ))}
                                </div>
                                <span className="mt-1 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                                  Paquete · {packageDates[r.package_id].length} paseos
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="capitalize">
                                  {new Date(r.scheduled_at).toLocaleDateString("es-MX", { weekday: "long" })}
                                </span>
                                <div className="text-xs text-muted-foreground">{fmtTime(r.scheduled_at)}</div>
                              </>
                            )
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {r.dog_name ?? "—"}
                          {r.dog_size && <div className="text-xs text-muted-foreground">{r.dog_size}</div>}
                        </td>
                        <td className="py-3 pr-4">
                          {r.manual_client_name ?? ownerMap[r.user_id]?.name ?? "—"}
                          {(r.manual_client_phone ?? ownerMap[r.user_id]?.phone) && (
                            <div className="text-xs text-muted-foreground">
                              {r.manual_client_phone ?? ownerMap[r.user_id]?.phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          {r.walker_id ? (
                            <>
                              {walkerMap[r.walker_id]?.name ?? "Paseador"}
                              <div className="text-[10px] text-muted-foreground">ID: {r.walker_id.slice(0, 8)}</div>
                            </>
                          ) : (
                            <button
                              onClick={() => setAssignFor(r)}
                              className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/25"
                            >
                              + Asignar
                            </button>
                          )}
                        </td>
                        <td className="py-3 pr-4">{r.zone ?? "—"}</td>
                        <td className="py-3 pr-4">{durationMin(r.scheduled_at, r.scheduled_until)} min</td>
                        <td className="py-3 pr-4 font-bold">${effectivePrice(r).toLocaleString()}</td>
                        <td className="py-3 pr-4 text-xs leading-tight">
                          {editingFeeId === r.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">$</span>
                              <input
                                type="number"
                                min={0}
                                autoFocus
                                placeholder="auto"
                                value={editingFeeValue ?? ""}
                                onChange={(e) => setEditingFeeValue(e.target.value === "" ? null : Math.max(0, parseInt(e.target.value) || 0))}
                                onBlur={() => saveReservationFee(r, editingFeeValue)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") saveReservationFee(r, editingFeeValue)
                                  if (e.key === "Escape") setEditingFeeId(null)
                                }}
                                className="w-16 rounded border border-primary/40 bg-white px-1.5 py-0.5 text-xs font-bold text-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <span className="text-[10px] text-muted-foreground">
                                {editingFeeValue === null ? "30% auto" : "= tu parte del total"}
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFeeId(r.id)
                                // Prefill: el override si existe; vacío (auto 30%) si no
                                setEditingFeeValue(r.admin_fee_mxn ?? null)
                              }}
                              className="text-left hover:opacity-70"
                              title="Click para editar tu ganancia en pesos (vacío = 30% automático)"
                            >
                              <div className="font-bold text-primary underline decoration-dotted underline-offset-2">
                                Admin: ${adminShareFor(r).toLocaleString()}
                              </div>
                              <div className="text-muted-foreground">
                                Paseador: ${walkerShareFor(r).toLocaleString()}
                              </div>
                            </button>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <select
                            value={r.status}
                            disabled={updating === r.id}
                            onChange={(e) => updateStatus(r.id, e.target.value)}
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${STATUS_BG[r.status] ?? "bg-secondary"}`}
                          >
                            {ALL_STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-4">
                          {canMakePublic ? (
                            <button
                              onClick={() => makePublic(r.id)}
                              className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white hover:bg-amber-600"
                            >
                              🔒 Hacer público
                            </button>
                          ) : r.visibility === "pending_admin" ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-muted-foreground">
                              —
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
                              🌐 Público
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => togglePayment(r.id, !isPaid)}
                              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                isPaid ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                              }`}
                            >
                              {isPaid ? "✓ Pagado" : "⏳ Pendiente"}
                            </button>
                            {r.status === "cancelada" && (
                              <button
                                onClick={() => deleteReservation(r.id)}
                                title="Borrar definitivamente"
                                className="rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700 hover:bg-red-200"
                              >
                                🗑
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Vista calendario */}
        {view === "calendario" && (
          <section className="mt-6 rounded-3xl border border-border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} className="gap-1.5 rounded-full">
                  <ChevronLeft className="h-4 w-4" /> Semana anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))} className="gap-1.5 rounded-full">
                  <CalendarDays className="h-4 w-4" /> Hoy
                </Button>
                <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} className="gap-1.5 rounded-full">
                  Semana siguiente <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className="font-display text-lg font-bold">
                {fmtDateShort(weekStart)} – {fmtDateShort(weekEnd)} {weekEnd.getFullYear()}
              </p>
            </div>

            {/* Leyenda de paseadores */}
            {uniqueWalkers.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl bg-secondary/40 px-4 py-3 text-sm">
                {uniqueWalkers.map((id) => (
                  <span key={id} className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: walkerColor[id] }} />
                    {walkerMap[id]?.name ?? "Paseador"}
                  </span>
                ))}
              </div>
            )}

            {/* Grid del calendario */}
            <div className="mt-5 overflow-x-auto">
              <div className="grid min-w-[800px]" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
                {/* Header días */}
                <div />
                {days.map((d, i) => {
                  const isToday = d.toDateString() === new Date().toDateString()
                  return (
                    <div key={i} className="border-b border-border pb-3 text-center">
                      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{dayNames[i]}</div>
                      <div className={`font-display text-2xl font-extrabold ${isToday ? "text-primary" : ""}`}>
                        {d.getDate()}
                      </div>
                    </div>
                  )
                })}

                {/* Filas por hora */}
                {hours.map((h) => (
                  <FragmentRow
                    key={h}
                    hour={h}
                    days={days}
                    reservationsByDay={reservationsByDay}
                    walkerColor={walkerColor}
                    walkerMap={walkerMap}
                    ownerMap={ownerMap}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Vista usuarios */}
        {view === "usuarios" && (
          <section className="mt-6 rounded-3xl border border-border bg-background p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Usuarios</h2>
              <div className="flex gap-2 text-sm">
                <span className="flex items-center gap-1.5 rounded-full bg-accent/40 px-3 py-1 font-bold">
                  <Heart className="h-4 w-4" /> {users.filter((u) => u.role === "dueno").length} Dueños
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 font-bold text-primary">
                  <Footprints className="h-4 w-4" /> {users.filter((u) => u.role === "paseador").length} Paseadores
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 font-bold">
                  <ShieldCheck className="h-4 w-4" /> {users.filter((u) => u.role === "admin").length} Admins
                </span>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <th className="pb-3 pr-4">Nombre</th>
                    <th className="pb-3 pr-4">Rol</th>
                    <th className="pb-3 pr-4">Teléfono</th>
                    <th className="pb-3 pr-4">Zona</th>
                    <th className="pb-3 pr-4">Estado</th>
                    <th className="pb-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">Sin usuarios.</td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className={`border-b border-border/50 ${u.banned ? "opacity-50" : ""}`}>
                        <td className="py-3 pr-4 font-semibold">{u.full_name ?? "—"}</td>
                        <td className="py-3 pr-4">
                          <select
                            value={u.role}
                            disabled={updatingUser === u.id}
                            onChange={(e) => updateUserRole(u.id, e.target.value)}
                            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              u.role === "admin"
                                ? "bg-secondary text-foreground"
                                : u.role === "paseador"
                                ? "bg-primary/15 text-primary"
                                : "bg-accent/40 text-accent-foreground"
                            }`}
                          >
                            <option value="dueno">Dueño</option>
                            <option value="paseador">Paseador</option>
                            <option value="admin">Admin</option>
                          </select>
                        </td>
                        <td className="py-3 pr-4 text-muted-foreground">{u.phone ?? "—"}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{u.zone ?? "—"}</td>
                        <td className="py-3 pr-4">
                          {u.banned ? (
                            <span className="rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-bold text-destructive">Baneado</span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">Activo</span>
                          )}
                        </td>
                        <td className="py-3">
                          <button
                            disabled={updatingUser === u.id}
                            onClick={() => toggleBan(u.id, !u.banned)}
                            className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                              u.banned ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-destructive/15 text-destructive hover:bg-destructive/25"
                            }`}
                          >
                            {u.banned ? "Reactivar" : "Banear"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Vista reseñas — moderación */}
        {view === "resenas" && (
          <section className="mt-6 space-y-6">
            {/* Pendientes por aprobar */}
            <div className="rounded-3xl border border-amber-300 bg-amber-50/60 p-6 shadow-sm">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">
                Por aprobar {pendingReviews.length > 0 && <span className="text-amber-600">({pendingReviews.length})</span>}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Estas reseñas NO aparecen en la página hasta que las apruebes.
              </p>
              {pendingReviews.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">No hay reseñas pendientes. 🎉</p>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {pendingReviews.map((rv) => (
                    <ReviewCard key={rv.id} rv={rv} onApprove={() => approveReview(rv.id)} onDelete={() => deleteReview(rv.id)} />
                  ))}
                </div>
              )}
            </div>

            {/* Ya publicadas */}
            <div className="rounded-3xl border border-border bg-background p-6 shadow-sm">
              <h2 className="font-display text-2xl font-extrabold tracking-tight">
                Publicadas {approvedReviews.length > 0 && <span className="text-muted-foreground">({approvedReviews.length})</span>}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Las 3 más recientes se muestran en la página de inicio.
              </p>
              {approvedReviews.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">Aún no hay reseñas publicadas.</p>
              ) : (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {approvedReviews.map((rv) => (
                    <ReviewCard key={rv.id} rv={rv} onUnapprove={() => unapproveReview(rv.id)} onDelete={() => deleteReview(rv.id)} />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Modal crear paseo en nombre del cliente */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-2xl rounded-3xl bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-extrabold">Crear paseo en nombre del cliente</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Útil cuando un cliente llama por teléfono para agendar.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex gap-2 rounded-full bg-secondary/40 p-1">
                <button
                  type="button"
                  onClick={() => setClientMode("registered")}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${clientMode === "registered" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  Cliente registrado
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode("manual")}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition-colors ${clientMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  Cliente manual (sin mail)
                </button>
              </div>
              {clientMode === "registered" ? (
                <div className="md:col-span-2">
                  <label className="text-sm font-semibold">Cliente</label>
                  <select
                    value={newPaseo.user_id}
                    onChange={(e) => setNewPaseo({ ...newPaseo, user_id: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="">— Selecciona cliente —</option>
                    {allOwners.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.full_name ?? "Sin nombre"} {o.phone ? `· ${o.phone}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-semibold">Nombre del cliente</label>
                    <Input
                      value={newPaseo.manual_client_name}
                      onChange={(e) => setNewPaseo({ ...newPaseo, manual_client_name: e.target.value })}
                      placeholder="Ej. María Lopez"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold">Teléfono (opcional)</label>
                    <Input
                      value={newPaseo.manual_client_phone}
                      onChange={(e) => setNewPaseo({ ...newPaseo, manual_client_phone: e.target.value })}
                      placeholder="614-123-4567"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-sm font-semibold">Plan</label>
                <select
                  value={newPaseo.plan_name}
                  onChange={(e) => {
                    const v = e.target.value
                    const price = v === "VIP 7 días" ? 630 : v === "Paseo semanal" ? 450 : v === "Paseo de 3 días" ? 300 : 110
                    setNewPaseo({ ...newPaseo, plan_name: v, price_mxn: price })
                    ensureSlotsLength(v)
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="Paseo de 1 día">Paseo de 1 día — $110</option>
                  <option value="Paseo de 3 días">Paseo de 3 días — $300</option>
                  <option value="Paseo semanal">Paseo semanal — $450</option>
                  <option value="VIP 7 días">VIP 7 días — $630</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-semibold">Cuántos perros</label>
                <Input type="number" min={1} max={5} value={newPaseo.dogs_count} onChange={(e) => setNewPaseo({ ...newPaseo, dogs_count: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-semibold">Nombre del perro</label>
                <Input value={newPaseo.dog_name} onChange={(e) => setNewPaseo({ ...newPaseo, dog_name: e.target.value })} placeholder="Toby" />
              </div>
              <div>
                <label className="text-sm font-semibold">Tamaño</label>
                <select value={newPaseo.dog_size} onChange={(e) => setNewPaseo({ ...newPaseo, dog_size: e.target.value })} className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="pequeno">Pequeño</option>
                  <option value="mediano">Mediano</option>
                  <option value="grande">Grande</option>
                </select>
              </div>
              <div className="md:col-span-2 space-y-3 rounded-2xl bg-secondary/30 p-3">
                <p className="text-sm font-bold">
                  {newSlots.length > 1 ? `${newSlots.length} días — escoge fecha y hora de cada uno` : "Fecha y hora"}
                </p>
                {newSlots.map((slot, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">
                        {newSlots.length > 1 ? `Día ${i + 1}` : "Fecha"}
                      </label>
                      <Input
                        type="date"
                        value={slot.date}
                        onChange={(e) => updateNewSlot(i, { date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Hora</label>
                      <Input
                        type="time"
                        value={slot.startHour}
                        onChange={(e) => updateNewSlot(i, { startHour: e.target.value })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="text-sm font-semibold">Precio MXN</label>
                <Input type="number" value={newPaseo.price_mxn} onChange={(e) => setNewPaseo({ ...newPaseo, price_mxn: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-sm font-semibold">Zona</label>
                <Input value={newPaseo.zone} onChange={(e) => setNewPaseo({ ...newPaseo, zone: e.target.value })} placeholder="Country Club" />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Dirección de recogida</label>
                <Input value={newPaseo.pickup_address} onChange={(e) => setNewPaseo({ ...newPaseo, pickup_address: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-semibold">Notas</label>
                <Input value={newPaseo.notes} onChange={(e) => setNewPaseo({ ...newPaseo, notes: e.target.value })} placeholder="Notas opcionales" />
              </div>

              {/* Asignar paseador directo (opcional) */}
              <div className="md:col-span-2 rounded-2xl bg-primary/5 p-4">
                <label className="text-sm font-bold">Asignar paseador (opcional)</label>
                <select
                  value={newPaseo.walker_id}
                  onChange={(e) => setNewPaseo({ ...newPaseo, walker_id: e.target.value })}
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="">— Dejar privado (decidir después) —</option>
                  {availableWalkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.full_name ?? "Sin nombre"} · Zona: {w.zone ?? "—"}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Si eliges un paseador, el paseo queda <b>confirmado</b> y se le notifica al cliente y al paseador.
                  Si lo dejas en blanco, queda como <b>privado pendiente</b> para que decidas después.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">Cancelar</button>
              <Button onClick={createReservation} disabled={creating} className="rounded-full font-bold">
                {creating ? "Creando..." : "Crear paseo"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar paseador */}
      {assignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAssignFor(null)}>
          <div className="w-full max-w-md rounded-3xl bg-background p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-extrabold">Asignar paseador</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Reserva en <b>{assignFor.zone ?? "—"}</b> · {assignFor.scheduled_at ? new Date(assignFor.scheduled_at).toLocaleDateString("es-MX") : ""}
            </p>
            <div className="mt-4 max-h-80 overflow-y-auto">
              {availableWalkers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No hay paseadores activos.</p>
              ) : (
                <ul className="space-y-2">
                  {availableWalkers.map((w) => {
                    const sameZone = w.zone === assignFor.zone
                    return (
                      <li key={w.id}>
                        <button
                          disabled={assigning}
                          onClick={() => assignWalker(assignFor.id, w.id)}
                          className="flex w-full items-center justify-between rounded-2xl border border-border p-3 text-left transition-colors hover:bg-secondary"
                        >
                          <div>
                            <p className="font-semibold">{w.full_name ?? "Sin nombre"}</p>
                            <p className="text-xs text-muted-foreground">
                              Zona: {w.zone ?? "—"}
                              {sameZone && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Misma zona</span>}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-primary">Asignar →</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setAssignFor(null)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function StatCard({ icon, title, value, sub }: { icon: React.ReactNode; title: string; value: string; sub: string }) {
  return (
    <div className="rounded-3xl border border-border bg-background p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">{icon}</div>
        <div>
          <p className="text-sm font-bold text-muted-foreground">{title}</p>
          <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        </div>
      </div>
    </div>
  )
}

function ReviewCard({
  rv, onApprove, onUnapprove, onDelete,
}: {
  rv: AdminReview
  onApprove?: () => void
  onUnapprove?: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-background p-4 shadow-sm">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={`h-4 w-4 ${n <= rv.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
        ))}
      </div>
      <p className="mt-2 flex-1 text-sm leading-relaxed">&ldquo;{rv.comment ?? ""}&rdquo;</p>
      <p className="mt-3 text-sm font-bold">{rv.name}{rv.dog ? <span className="font-normal text-muted-foreground"> · {rv.dog}</span> : null}</p>
      <p className="text-xs text-muted-foreground">{new Date(rv.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}</p>
      <div className="mt-3 flex gap-2">
        {onApprove && (
          <Button onClick={onApprove} className="flex-1 rounded-full bg-primary font-bold text-primary-foreground hover:bg-primary/90">
            <CheckCircle2 className="h-4 w-4" /> Aprobar
          </Button>
        )}
        {onUnapprove && (
          <Button onClick={onUnapprove} variant="outline" className="flex-1 rounded-full font-bold">
            Ocultar
          </Button>
        )}
        <Button onClick={onDelete} variant="outline" className="rounded-full border-destructive/40 font-bold text-destructive hover:bg-destructive/10">
          Borrar
        </Button>
      </div>
    </div>
  )
}

function FragmentRow({
  hour,
  days,
  reservationsByDay,
  walkerColor,
  walkerMap,
  ownerMap,
}: {
  hour: number
  days: Date[]
  reservationsByDay: Record<string, AdminReservation[]>
  walkerColor: Record<string, string>
  walkerMap: Record<string, { name: string | null }>
  ownerMap: Record<string, { name: string | null; phone: string | null }>
}) {
  return (
    <>
      <div className="border-b border-border/40 py-2 pr-2 text-right text-xs font-semibold text-muted-foreground">
        {String(hour).padStart(2, "0")}:00
      </div>
      {days.map((d, i) => {
        const dayKey = d.toDateString()
        const items = (reservationsByDay[dayKey] ?? []).filter((r) => {
          if (!r.scheduled_at) return false
          const h = new Date(r.scheduled_at).getHours()
          return h === hour
        })
        return (
          <div key={i} className="relative min-h-14 border-b border-border/40 border-l p-1">
            {items.map((r) => {
              const walkerName = r.walker_id ? walkerMap[r.walker_id]?.name ?? "Paseador" : null
              const clienteName = r.manual_client_name ?? ownerMap[r.user_id]?.name ?? ""
              return (
                <div
                  key={r.id}
                  className="mb-1 rounded-lg px-2 py-1 text-[11px] leading-tight font-bold text-white shadow"
                  style={{ background: r.walker_id ? walkerColor[r.walker_id] ?? "#888" : "#a0a0a0" }}
                  title={`${r.dog_name ?? ""} · ${walkerName ?? "Sin paseador"} · Cliente: ${clienteName} · ${r.zone ?? ""}`}
                >
                  <div>{r.scheduled_at ? fmtTime(r.scheduled_at) : ""} · {r.dog_name ?? "Sin perro"}</div>
                  <div className="opacity-90">👤 {walkerName ?? "Sin asignar"}</div>
                  {clienteName && <div className="opacity-90">🐶 {clienteName}</div>}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
