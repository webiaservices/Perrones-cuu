import { PLANTILLAS, TEL_ATENCION } from "./whatsapp-plantillas"

/**
 * Mensajes de WhatsApp SIN la API de Meta.
 *
 * POR QUÉ EXISTE ESTO: la API de WhatsApp depende de que Meta tenga la cuenta
 * del negocio verificada y en orden. Mientras eso esté trabado, el negocio no
 * se puede quedar mudo. Con un link wa.me el mensaje sale del WhatsApp normal
 * de Endy —el número que sus clientes ya conocen— con el texto ya escrito.
 * Él nada más le da enviar.
 *
 * Ventajas sobre la API mientras tanto:
 *   - Sale de su número de siempre, no de un +1 gringo que parece fraude
 *   - No cuesta un peso
 *   - No depende de Meta ni de trámites
 *
 * Cuando la API reviva, esto se queda como respaldo para cuando un envío falle.
 */

const TZ = "America/Chihuahua"

/** Deja el teléfono como lo quiere wa.me: solo dígitos, con lada de país. */
export function telefonoParaWa(tel: string): string {
  const solo = tel.replace(/\D/g, "")
  if (solo.length === 10) return `52${solo}`
  // 521XXXXXXXXXX es el formato viejo de México; wa.me funciona sin el 1
  if (solo.length === 13 && solo.startsWith("521")) return `52${solo.slice(3)}`
  return solo
}

/**
 * Rellena {{1}}, {{2}}… de una plantilla con los valores dados.
 *
 * Quita además la coletilla de "este es un número automático": aquí el mensaje
 * sale del WhatsApp personal de Endy, así que decir eso confundiría al cliente
 * y lo invitaría a no responder, justo al revés de lo que queremos.
 */
export function armarTexto(nombrePlantilla: string, valores: string[]): string {
  const p = PLANTILLAS.find((x) => x.nombre === nombrePlantilla)
  if (!p) return ""
  const conDatos = p.texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] ?? "")
  return conDatos
    .split("\n")
    .filter((linea) => !/Este es un n[úu]mero (de mensajes )?autom[áa]tico/i.test(linea))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** El link que abre WhatsApp con el mensaje listo para enviar. */
export function linkWhatsApp(tel: string, texto: string): string {
  return `https://wa.me/${telefonoParaWa(tel)}?text=${encodeURIComponent(texto)}`
}

export function fmtFechaHoraLarga(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TZ,
  })
}

/**
 * Los mensajes que Endy puede mandar desde una reserva, ya armados.
 * Solo se ofrecen los que tienen sentido para el estado de esa reserva.
 */
export type MensajeListo = { clave: string; etiqueta: string; texto: string }

export function mensajesParaReserva(datos: {
  clienteNombre: string
  fechas: string[]
  paseadorNombre?: string | null
  fechaHora: string
  monto: number
}): MensajeListo[] {
  const { clienteNombre, fechas, paseadorNombre, fechaHora, monto } = datos
  const lista: MensajeListo[] = [
    {
      clave: "paseo_confirmado",
      etiqueta: "Confirmar reserva",
      texto: armarTexto("paseo_confirmado", [clienteNombre, fechas.join("\n")]),
    },
    {
      clave: "recordatorio_pago",
      etiqueta: "Recordar pago",
      texto: armarTexto("recordatorio_pago", [`MX$${monto.toLocaleString("es-MX")}`]),
    },
    {
      clave: "solicitud_resena",
      etiqueta: "Pedir reseña",
      texto: armarTexto("solicitud_resena", []),
    },
  ]
  if (paseadorNombre) {
    lista.splice(1, 0, {
      clave: "paseador_asignado",
      etiqueta: "Avisar paseador asignado",
      texto: armarTexto("paseador_asignado", [paseadorNombre, fechaHora]),
    })
  }
  return lista
}

export { TEL_ATENCION }
