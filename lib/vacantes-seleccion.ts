/**
 * A quién se le avisa de una vacante, y por qué canal. Lógica pura (sin base
 * ni red) para poder probarla con datos inventados: pruebas/vacantes.test.ts.
 *
 * Lo que pesó en las reglas (medido del 25-ago al 24-sep-2026):
 *   - A los de Chihuahua les llegaban las vacantes de CDMX.
 *   - Quien más toma vacantes son paseadores SIN paseos previos, pero TODOS
 *     ya habían aceptado el manual. Por eso el WhatsApp va a todos los que
 *     terminaron su registro (y a los recién registrados), no a quien lleva
 *     semanas sin terminarlo.
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
/** Registrado hace menos de 14 días: todavía puede estar terminando su alta. */
export const DIAS_DE_NUEVO = 14
export const esNuevo = (p: Paseador, ahora = Date.now()) =>
  !!p.created_at && ahora - new Date(p.created_at).getTime() < DIAS_DE_NUEVO * 86400000
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
    // Solo quien terminó su registro (aceptó el manual) o se registró hace
    // menos de 14 días. Backtest del 26-sep-2026: las 4 vacantes que tomó
    // alguien que no es Endy las tomó un paseador que YA había aceptado el
    // manual; a los 60 que se registraron hace semanas y nunca lo aceptaron se
    // les pagaron ~400 WhatsApp sin que ninguno tomara un paseo. En cuanto uno
    // acepta el manual, vuelve a recibir vacantes solo.
    if (!p.manual_ok && !esNuevo(p)) continue
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
  /** Último correo de vacante de cada quien: se rota, el que lleva más sin
   *  correo va primero, para que el tope no le llegue siempre a los mismos. */
  ultimoCorreo: Record<string, string> = {},
): Paseador[] {
  const elegidos: Paseador[] = []
  const vistos = new Set<string>()
  const enFila = ordenar(deLaCiudad(paseadores, ctx.ciudad), ctx).sort(
    (a, b) => (ultimoCorreo[a.id] ?? "").localeCompare(ultimoCorreo[b.id] ?? ""),
  )
  for (const p of enFila) {
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
