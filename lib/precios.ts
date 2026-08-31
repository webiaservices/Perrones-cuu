import { createClient } from "@/lib/supabase/server"
import { PLANS, ADMIN_SHARE } from "@/lib/constants"
import type { CiudadId } from "@/lib/ciudades"

/**
 * Precios y pago al paseador, leídos de la base.
 *
 * Antes vivían como constantes en lib/constants.ts, lo que obligaba a
 * desplegar para cambiar un precio. Ahora los edita Endy desde el panel y la
 * página se actualiza sola.
 *
 * IMPORTANTE — nada de esto toca lo ya cobrado: cada reserva guarda su propio
 * price_mxn al crearse y todos los paneles, correos y cobros leen ESE valor.
 * Cambiar la lista solo afecta a las reservas nuevas.
 *
 * Si la tabla todavía no existe (migración 0024 sin correr) se cae con gracia a
 * las constantes de siempre, para que el sitio nunca quede sin precios.
 */

export type TablaPrecios = Record<string, { 1: number; 2: number; 3: number }>

function desdeConstantes(): TablaPrecios {
  return Object.fromEntries(PLANS.map((p) => [p.name, { ...p.priceByDogs }]))
}

/** Precios de una ciudad, listos para pintar la tabla. */
export async function preciosDe(ciudad: CiudadId): Promise<TablaPrecios> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("precios")
      .select("plan_name, dogs, price_mxn")
      .eq("city", ciudad)
    if (error || !data?.length) return desdeConstantes()

    const tabla: TablaPrecios = {}
    for (const fila of data) {
      const plan = fila.plan_name as string
      tabla[plan] = tabla[plan] ?? { 1: 0, 2: 0, 3: 0 }
      tabla[plan][fila.dogs as 1 | 2 | 3] = fila.price_mxn as number
    }
    // Un plan que falte en la base conserva su precio de siempre
    for (const p of PLANS) if (!tabla[p.name]) tabla[p.name] = { ...p.priceByDogs }
    return tabla
  } catch {
    return desdeConstantes()
  }
}

/** El precio de un paquete concreto. Es la fuente de verdad al cotizar. */
export async function precioDe(ciudad: CiudadId, planName: string, perros: number): Promise<number> {
  const tabla = await preciosDe(ciudad)
  const n = Math.min(3, Math.max(1, perros)) as 1 | 2 | 3
  const plan = PLANS.find((p) => p.name === planName)
  return tabla[planName]?.[n] ?? plan?.priceByDogs[n] ?? plan?.basePrice ?? 0
}

/**
 * Lo que se le paga al paseador por ese paquete, en pesos.
 *
 * Endy: "el 70% automático no funciona, el reparto cambia según el paquete y
 * el tipo de cliente". Ahora es una cantidad que él captura por paquete. Si no
 * hay cantidad capturada, se cae al 70% de siempre para no dejar a nadie sin
 * pago definido.
 */
export async function pagoPaseadorDe(
  ciudad: CiudadId,
  planName: string,
  perros: number,
  precioTotal: number,
): Promise<number> {
  const n = Math.min(3, Math.max(1, perros))
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from("pagos_paseador")
      .select("walker_mxn")
      .eq("city", ciudad)
      .eq("plan_name", planName)
      .eq("dogs", n)
      .maybeSingle()
    if (data?.walker_mxn != null) return data.walker_mxn as number
  } catch {
    // sin tabla todavía: se usa el reparto viejo
  }
  return Math.round(precioTotal * (1 - ADMIN_SHARE))
}
