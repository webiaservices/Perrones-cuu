/**
 * Las dos ciudades donde opera Perrones, y sus colonias.
 *
 * Antes la ciudad era texto quemado ("Ciudad Chihuahua, Chih.") y las colonias
 * un array plano. Con CDMX eso ya no alcanza: el precio, las zonas y a quién se
 * le avisa de un paseo dependen de la ciudad.
 */

export type CiudadId = "chihuahua" | "cdmx"

export const CIUDADES: { id: CiudadId; nombre: string; corto: string }[] = [
  { id: "chihuahua", nombre: "Ciudad Chihuahua, Chih.", corto: "Chihuahua" },
  { id: "cdmx", nombre: "Ciudad de México", corto: "CDMX" },
]

/** Colonias por ciudad. "Otra" abre un campo de texto libre: si alguien vive
 *  fuera de la lista, se captura a mano en vez de perder al cliente. */
export const ZONAS_POR_CIUDAD: Record<CiudadId, string[]> = {
  chihuahua: [
    "Centro",
    "Campestre",
    "Quintas del Sol",
    "San Felipe",
    "Villa Juárez",
    "Santa Rosa",
    "Mirador",
    "Panamericana",
    "Cerro de la Cruz",
    "Cerro Prieto",
    "Diego Lucero",
    "Junta de los Ríos",
    "Los Nogales",
    "Puerta de Hierro",
    "Riberas de Sacramento",
    "Robinson",
    "Vistas Cerro Grande",
    "Otra",
  ],
  cdmx: ["Condesa", "Roma Norte", "Roma Sur", "Otra"],
}

export function esCiudadValida(v: unknown): v is CiudadId {
  return v === "chihuahua" || v === "cdmx"
}

/** Nunca confiar en lo que llegue del navegador: cae a Chihuahua si viene raro. */
export function ciudadSegura(v: unknown): CiudadId {
  return esCiudadValida(v) ? v : "chihuahua"
}

export function nombreCiudad(id: CiudadId): string {
  return CIUDADES.find((c) => c.id === id)?.corto ?? "Chihuahua"
}

export function zonasDe(ciudad: CiudadId): string[] {
  return ZONAS_POR_CIUDAD[ciudad] ?? ZONAS_POR_CIUDAD.chihuahua
}
