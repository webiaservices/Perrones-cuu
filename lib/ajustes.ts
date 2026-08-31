import { createClient } from "@/lib/supabase/server"

/**
 * Interruptores que Endy prende y apaga desde su panel.
 *
 * Viven en la tabla `ajustes` como clave/valor para no tener que desplegar cada
 * vez que quiere abrir o cerrar algo. Si la tabla todavía no existe se usan los
 * valores de abajo, para que el sitio nunca se caiga por esto.
 */

export type ClaveAjuste =
  | "registro_paseadores_chihuahua"
  | "registro_paseadores_cdmx"
  | "aviso_rutas_panel_cliente"

/** Lo que aplica mientras no haya nada guardado. CDMX arranca cerrado. */
export const AJUSTES_DEFAULT: Record<ClaveAjuste, boolean> = {
  registro_paseadores_chihuahua: true,
  registro_paseadores_cdmx: false,
  aviso_rutas_panel_cliente: true,
}

export async function leerAjustes(): Promise<Record<ClaveAjuste, boolean>> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from("ajustes").select("clave, valor")
    if (error || !data) return { ...AJUSTES_DEFAULT }
    const out = { ...AJUSTES_DEFAULT }
    for (const fila of data) {
      const k = fila.clave as ClaveAjuste
      if (k in out) out[k] = fila.valor === true || fila.valor === "true"
    }
    return out
  } catch {
    return { ...AJUSTES_DEFAULT }
  }
}

/** ¿Se pueden registrar paseadores en esa ciudad? */
export function registroPaseadoresAbierto(
  ajustes: Record<ClaveAjuste, boolean>,
  ciudad: "chihuahua" | "cdmx",
): boolean {
  return ciudad === "cdmx"
    ? ajustes.registro_paseadores_cdmx
    : ajustes.registro_paseadores_chihuahua
}
