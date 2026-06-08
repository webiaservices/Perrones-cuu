"use client"

import type React from "react"
import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Heart, Footprints } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LogoCircle } from "@/components/logo-circle"
import { ContractModal } from "@/components/contract-modal"
import { ZONES, WEEKDAYS } from "@/lib/constants"
import { CLIENT_CONTRACT, WALKER_CONTRACT, CONTRACT_VERSION } from "@/lib/contract-text"
import { cn } from "@/lib/utils"

type Role = "dueno" | "paseador" | "admin"

// Admin se crea manualmente desde Supabase. Solo Dueño y Paseador son públicos.
const ROLE_OPTIONS: { value: Role; label: string; desc: string; icon: typeof Heart }[] = [
  { value: "dueno", label: "Dueño", desc: "Quiero agendar paseos para mi perro", icon: Heart },
  { value: "paseador", label: "Paseador", desc: "Quiero trabajar paseando perros", icon: Footprints },
]

function SignUpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const initialRole = (params.get("role") as Role) || "dueno"

  const [role, setRole] = useState<Role>(initialRole)
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [zone, setZone] = useState("")
  const [days, setDays] = useState<string[]>([])
  const [accepted, setAccepted] = useState(false)
  const [contractOpen, setContractOpen] = useState(false)
  const [bankName, setBankName] = useState("")
  const [bankClabe, setBankClabe] = useState("")
  const [bankAccount, setBankAccount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const r = params.get("role") as Role
    if (r === "dueno" || r === "paseador" || r === "admin") setRole(r)
  }, [params])

  const needsContract = role === "dueno" || role === "paseador"
  const contractText = role === "paseador" ? WALKER_CONTRACT : CLIENT_CONTRACT
  const contractType = role === "paseador" ? "paseador" : "cliente"

  const toggleDay = (d: string) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (needsContract && !accepted) {
      setError("Debes aceptar el contrato de prestación de servicios.")
      return
    }
    if (role === "paseador" && !zone) {
      setError("Selecciona tu zona de preferencia.")
      return
    }

    setLoading(true)
    const supabase = createClient()
    const availableHours = WEEKDAYS.reduce<Record<string, boolean>>((acc, d) => {
      acc[d.value] = days.includes(d.value)
      return acc
    }, {})

    try {
      const { data, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: {
            full_name: fullName,
            phone,
            role,
            zone: role === "paseador" ? zone : null,
            available_hours: role === "paseador" ? availableHours : {},
            bank_name: role === "paseador" ? bankName : null,
            bank_clabe: role === "paseador" ? bankClabe : null,
            bank_account: role === "paseador" ? bankAccount : null,
          },
        },
      })
      if (signErr) throw signErr

      // If email confirmation is OFF, we already have a session: record the contract now.
      if (data.session && needsContract) {
        await supabase.from("contracts").insert({
          user_id: data.session.user.id,
          type: contractType,
          version: CONTRACT_VERSION,
        })
      }

      // Si venía de /reservar (u otra ruta), regresarlo ahí. Si no, al panel.
      const rawRedirect = params.get("redirectTo")
      const safeRedirect = rawRedirect && rawRedirect.startsWith("/") ? rawRedirect : null

      if (data.session) {
        router.push(safeRedirect ?? "/panel")
        router.refresh()
      } else {
        const successUrl = safeRedirect
          ? `/auth/sign-up-success?next=${encodeURIComponent(safeRedirect)}`
          : "/auth/sign-up-success"
        router.push(successUrl)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ocurrió un error al registrarte")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/">
            <LogoCircle className="h-14 w-14" />
          </Link>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Crea tu cuenta</h1>
          <p className="text-sm text-muted-foreground">Únete a Perrones Cuu en Chihuahua</p>
        </div>

        <form
          onSubmit={handleSignUp}
          className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-6 shadow-sm"
        >
          {/* Role selector */}
          <div className="flex flex-col gap-2">
            <Label>Quiero registrarme como</Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {ROLE_OPTIONS.map((opt) => {
                const active = role === opt.value
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setRole(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-all",
                      active
                        ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                        : "border-border bg-background hover:border-primary/40",
                    )}
                  >
                    <opt.icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-sm font-bold">{opt.label}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Common: nombre + teléfono (dueño & paseador) */}
          {role !== "admin" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+52 614 ..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {/* Paseador: zona + horarios */}
          {role === "paseador" && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Zona de preferencia</Label>
                <Select value={zone} onValueChange={setZone}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona tu zona" />
                  </SelectTrigger>
                  <SelectContent>
                    {ZONES.map((z) => (
                      <SelectItem key={z} value={z}>
                        {z}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>Días disponibles</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => {
                    const active = days.includes(d.value)
                    return (
                      <button
                        type="button"
                        key={d.value}
                        onClick={() => toggleDay(d.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40",
                        )}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Cuenta bancaria del paseador */}
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="font-bold">Cuenta bancaria para recibir tus pagos</p>
                <p className="text-xs text-muted-foreground">Te depositamos aquí el 70% de cada paseo. Tus datos son confidenciales.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="bankName">Banco</Label>
                    <Input id="bankName" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BBVA, Banorte, etc." />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="bankAccount">No. de cuenta</Label>
                    <Input id="bankAccount" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="0000 0000 0000" />
                  </div>
                  <div className="flex flex-col gap-1 md:col-span-2">
                    <Label htmlFor="bankClabe">CLABE interbancaria</Label>
                    <Input id="bankClabe" value={bankClabe} onChange={(e) => setBankClabe(e.target.value)} placeholder="18 dígitos" maxLength={18} />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Auth */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {/* Contract */}
          {needsContract && (
            <div className="flex items-start gap-3 rounded-2xl bg-muted/50 p-3">
              <Checkbox
                id="contract"
                checked={accepted}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="contract" className="text-sm font-normal leading-relaxed">
                Acepto el{" "}
                <button
                  type="button"
                  className="font-bold text-primary underline"
                  onClick={() => setContractOpen(true)}
                >
                  contrato de prestación de servicios
                </button>
                .
              </Label>
            </div>
          )}

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          <Button type="submit" size="lg" className="w-full rounded-full font-bold" disabled={loading}>
            {loading ? "Creando cuenta..." : "Registrarme"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-bold text-primary underline">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>

      <ContractModal
        open={contractOpen}
        onOpenChange={setContractOpen}
        title={role === "paseador" ? "Contrato del paseador" : "Contrato del cliente"}
        text={contractText}
        onAccept={() => setAccepted(true)}
      />
    </div>
  )
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  )
}
