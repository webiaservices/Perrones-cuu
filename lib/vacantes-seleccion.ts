/**
 * A quién se le avisa de una vacante, y por qué canal. Lógica pura (sin base
 * ni red) para poder probarla con datos inventados: pruebas/vacantes.test.ts.
 *
 * Lo que pesó en las reglas (medido del 25-ago al 24-sep-2026):
 *   - El aviso le llegaba por WhatsApp a 62 teléfonos y 57 nunca habían tomado
 *     un paseo. Cuatro a seis personas hacen todo el trabajo.
 *   - A los de Chihuahua les llegaban las vacantes de CDMX.
 *   - Se le pagaba el mensaje a gente que no ha aceptado el manual, y que por
 *     lo tanto NO puede tomar el paseo (accept-paseo la rechaza).
 */

export type Paseador = {
  id: string
  full_name: string | null
  phone: string | null
  email: string | null
  zone: string | null
  city: string | null
  banned: boolean | null
  wa_rebotes: number | null
  /** Aceptó la versión vigente del manual: sin eso no puede tomar el paseo. */
  manual_ok: boolean
  created_at: string | null
}

export type Contexto = {
  ciudad: string
  zona: string | null
  /** Paseos (paquetes) que tomó cada paseador en los últimos 60 días. */
  tomados: Record<string, number>
  /** Ya se le avisó por ese canal en ESTA vacante (no se repite). */
  yaAvisados: { push: Set<string>; whatsapp: Set<string>; correo: Set<string> }
}

const tel10 = (t: string | null) => String(t ?? "").replace(/\D/g, "").slice(-10)
const normal = (s: string | null) => (s ?? "").trim().toLowerCase()

/** Paseadores de la ciudad de la vacante que pueden trabajar. */
export function deLaCiudad(paseadores: Paseador[], ciudad: string): Paseador[] {
  return paseadores.filter((p) => !p.banned && (p.city ?? "chihuahua") === ciudad)
}

/**
 * Orden de prioridad: primero quien SÍ toma paseos, luego los de la misma
 * zona, y entre los que nunca han tomado uno, los más nuevos (acaban de
 * registrarse y buscan trabajo) antes que las cuentas viejas inactivas.
 */
export function ordenar(paseadores: Paseador[], ctx: Contexto): Paseador[] {
  const zona = normal(ctx.zona)
  return [...paseadores].sort((a, b) => {
    const ta = ctx.tomados[a.id] ?? 0
    const tb = ctx.tomados[b.id] ?? 0
    if (ta !== tb) return tb - ta
    const za = zona && normal(a.zone) === zona ? 0 : 1
    const zb = zona && normal(b.zone) === zona ? 0 : 1
    if (za !== zb) return za - zb
    return (b.created_at ?? "").localeCompare(a.created_at ?? "")
  })
}

/**
 * A quién se le paga un WhatsApp en esta oleada.
 * Fuera: sin teléfono, número silenciado, sin manual, a quien ya le llegó el
 * aviso gratis al celular, a quien ya se le mandó WhatsApp de esta vacante, y
 * teléfonos repetidos (una persona con dos cuentas recibe uno solo).
 */
export function elegirWhatsApp(
  paseadores: Paseador[],
  ctx: Contexto,
  cupo: number,
  /** Teléfonos (últimos 10) a los que ya se les mandó esta vacante. */
  telefonosYaAvisados: Set<string> = new Set(),
  /**
   * A quién le llegó el aviso gratis EN ESTA OLA. Ocupan su lugar en el cupo:
   * el cupo es "los N con más probabilidad de tomarlo", y a los que ya se
   * enteraron gratis no hay que pagarles. Así, cada paseador que activa el
   * aviso al celular es un WhatsApp menos por vacante (y no uno para otro).
   */
  alcanzadosGratis: Set<string> = new Set(),
): Paseador[] {
  const vistos = new Set(telefonosYaAvisados)
  const elegidos: Paseador[] = []
  let lugaresOcupados = 0
  for (const p of ordenar(deLaCiudad(paseadores, ctx.ciudad), ctx)) {
    if (elegidos.length + lugaresOcupados >= cupo) break
    if (alcanzadosGratis.has(p.id)) {
      if (p.manual_ok) lugaresOcupados++
      continue
    }
    const t = tel10(p.phone)
    if (t.length < 10) continue
    if ((p.wa_rebotes ?? 0) >= 2) continue
    if (!p.manual_ok) continue
    if (ctx.yaAvisados.push.has(p.id) || ctx.yaAvisados.whatsapp.has(p.id)) continue
    if (vistos.has(t)) continue
    vistos.add(t)
    elegidos.push(p)
  }
  return elegidos
}

/**
 * A quién se le manda correo. El correo es gratis pero la cuenta de Resend se
 * comparte con otros sistemas (100 al día en total), así que lleva tope y va
 * solo a quien no recibió ni push ni WhatsApp.
 */
export function elegirCorreo(
  paseadores: Paseador[],
  ctx: Contexto,
  cupo: number,
  alcanzadosEnEstaOla: Set<string>,
): Paseador[] {
  const elegidos: Paseador[] = []
  const vistos = new Set<string>()
  for (const p of ordenar(deLaCiudad(paseadores, ctx.ciudad), ctx)) {
    if (elegidos.length >= cupo) break
    const correo = normal(p.email)
    if (!correo || !correo.includes("@")) continue
    if (alcanzadosEnEstaOla.has(p.id)) continue
    if (ctx.yaAvisados.push.has(p.id) || ctx.yaAvisados.whatsapp.has(p.id) || ctx.yaAvisados.correo.has(p.id)) continue
    if (vistos.has(correo)) continue
    vistos.add(correo)
    elegidos.push(p)
  }
  return elegidos
}

/** Push: a todos los de la ciudad a los que no se les ha mandado. Es gratis. */
export function elegirPush(paseadores: Paseador[], ctx: Contexto): Paseador[] {
  return deLaCiudad(paseadores, ctx.ciudad).filter((p) => !ctx.yaAvisados.push.has(p.id))
}
