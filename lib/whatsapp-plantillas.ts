/**
 * Las 9 plantillas de WhatsApp de Perrones Cuu.
 *
 * Este archivo es la ÚNICA fuente de verdad de los textos. Sirve para dos
 * cosas: que el código sepa cuántas variables lleva cada plantilla y en qué
 * orden, y generar el instructivo de alta en Twilio (INSTRUCTIVO-PLANTILLAS.md).
 *
 * Reglas de estilo que fijó el dueño y que aplican a TODAS:
 *   - Trato de usted a clientes y a paseadores.
 *   - Ninguna promete horario o paseador sin que la empresa lo confirme.
 *   - Ninguna ofrece descuentos ni precios distintos a los publicados.
 *   - Todas cierran aclarando que es un número automático y remiten al
 *     614-594-85-13 para atención personalizada.
 *   - Informativas, no publicitarias: Meta rechaza las promocionales.
 *
 * IMPORTANTE: cambiar un texto aquí NO cambia lo que se manda. El texto vive
 * en Twilio; aquí solo se documenta. Si se edita, hay que volver a darla de
 * alta en Twilio y esperar aprobación de Meta.
 */

/** Número de atención personal. Se queda en la app de WhatsApp Business, no en la API. */
export const TEL_ATENCION = "614-594-85-13"

export type Plantilla = {
  /** Nombre en Twilio y sufijo de la env var: TWILIO_TPL_<NOMBRE EN MAYÚSCULAS>. */
  nombre: string
  /** A quién le llega. */
  destinatario: "cliente" | "paseador"
  /** Qué la dispara, en una línea. */
  cuando: string
  /** Etiqueta corta para el panel de Endy. */
  resumen: string
  /** Qué representa cada {{n}}, en orden. */
  variables: string[]
  /** El texto tal cual va en Twilio. */
  texto: string
}

export const PLANTILLAS: Plantilla[] = [
  {
    nombre: "paseo_confirmado",
    destinatario: "cliente",
    cuando: "El cliente completa una reserva en perronescuu.com.",
    resumen: "Al cliente cuando agenda su paseo",
    variables: ["nombre del cliente", "lista de fechas y horas, una por renglón"],
    texto: `Hola {{1}} 🐾 ¡Gracias por reservar con Perrones!

Sus paseos quedaron registrados para:
{{2}}

En un momento le confirmamos el paseador asignado.

Puede tomar cierto tiempo contactar a un paseador, pero no se preocupe: nosotros siempre le vamos a avisar.

Le recordamos que nuestros paseos incluyen recogida y entrega en su domicilio.

Si desea utilizar el rastreo por GPS en tiempo real, háganoslo saber al ${TEL_ATENCION}.

Este es un número automático de Perrones. Para atención personalizada, escríbanos al ${TEL_ATENCION} 🐶`,
  },
  {
    nombre: "paseador_asignado",
    destinatario: "cliente",
    cuando: "Un paseador acepta el paseo en la plataforma.",
    resumen: "Al cliente cuando ya tiene paseador",
    variables: ["nombre del paseador", "fecha y hora del paseo"],
    texto: `Hola 🐾 Su paseo ya tiene paseador asignado.

Paseador: {{1}}
Fecha y hora: {{2}}

Pasará por su perrito a su domicilio y se lo entregará al terminar la hora de paseo.

Le compartimos su número al paseador únicamente para que pueda comunicarse con usted si surge algún cambio o alguna situación durante el paseo.

IMPORTANTE: el pago siempre es mediante transferencia y directamente con nosotros. Nunca en efectivo al paseador.

Este es un número de mensajes automáticos de Perrones. Para atención personalizada, escríbanos al ${TEL_ATENCION} 🐶`,
  },
  {
    nombre: "paseo_disponible",
    destinatario: "paseador",
    cuando: "Se abre una vacante o un paseo nuevo que hay que asignar.",
    resumen: "A los paseadores cuando hay paseo nuevo",
    variables: ["nombre del paseador", "zona o colonia", "pago semanal de la ruta"],
    texto: `Hola, muy buenas tardes {{1}} 🐶

Le informamos que se abrió una nueva vacante en la zona de {{2}}.

Pago semanal: {{3}}

Si le interesa, puede tomarla directamente en nuestra página: perronescuu.com

En algunos casos se requiere celular con datos móviles para todo (no solo redes sociales), ya que ciertos clientes solicitan rastreo por GPS en tiempo real. No aplica en todos los paseos, pero es importante tenerlo en cuenta.

Este es un número de mensajes automáticos de Perrones. Para atención personalizada, escríbanos al ${TEL_ATENCION}.`,
  },
  {
    nombre: "recordatorio_pago",
    destinatario: "cliente",
    cuando: "Al INICIAR el último paseo de la semana del cliente (no al terminarlo, para que le dé tiempo de preparar la transferencia).",
    resumen: "Al cliente en su último paseo de la semana",
    variables: ["monto a pagar"],
    texto: `Hola 🐾 Le informamos que hoy se realiza el último paseo de su semana.

Total a pagar: {{1}}

Si tuvo alguna modificación de horario o de día con el paseador para reponer algún paseo, no se preocupe: el pago se realiza cuando se finalicen todos los días contratados. Este mensaje le llega porque está automatizado en nuestra página.

El pago se realiza siempre por transferencia y directamente con nosotros, nunca en efectivo al paseador.

Este es un número de mensajes automáticos de Perrones. Si requiere los datos bancarios o tiene alguna duda, escríbanos al ${TEL_ATENCION}.

¡Gracias por confiar en Perrones! 🐶`,
  },
  {
    nombre: "paseador_acepta",
    destinatario: "paseador",
    cuando: "El paseador acepta un paseo. Los datos del dueño solo salen aquí, nunca a quien apenas mostró interés.",
    resumen: "Al paseador con los datos del dueño",
    variables: [
      "nombre del paseador",
      "nombre del dueño o dueña",
      "teléfono del dueño o dueña",
      "ubicación o domicilio del paseo",
      "días y hora del paseo",
    ],
    texto: `Hola {{1}}, muy buenas tardes 🙌🏾

Nos alegra mucho que hayas aceptado el paseo.

Aquí está el manual de paseadores actualizado: perronescuu.com/manual

Te dejamos también los datos del paseo:

Dueño(a): {{2}}
Teléfono: {{3}}
Ubicación: {{4}}
Días y hora: {{5}}

Por favor revisa el manual con calma, leyendo cada punto, y acéptalo desde tu panel en la pestaña "Manual".

Te recordamos que el pago es mediante transferencia al finalizar la semana.

Este es un número de mensajes automáticos de Perrones. Si necesitas atención personalizada, escríbenos al ${TEL_ATENCION}. Cualquier duda, estamos en contacto 😊`,
  },
  {
    nombre: "paseo_sin_cubrir",
    destinatario: "cliente",
    cuando: "Faltan 2 horas para el paseo y sigue sin paseador asignado. La más importante: el hueco de no avisar ya dejó a dos clientas esperando.",
    resumen: "Aviso interno: paseo sin paseador",
    variables: ["hora del paseo que no se pudo cubrir"],
    texto: `Hola 🐾 Le escribimos para avisarle que hoy no logramos asignar paseador para el paseo de las {{1}}. Una disculpa.

Podemos resolverlo como usted prefiera: le reponemos el paseo otro día de esta misma semana, o se lo descontamos del paquete.

Dígame cuál le acomoda y lo dejamos listo.

Este es un número de mensajes automáticos de Perrones. Para atención personalizada, escríbanos al ${TEL_ATENCION}.`,
  },
  {
    nombre: "recordatorio_paseador",
    destinatario: "paseador",
    cuando: "2 horas antes del primer paseo del día de ese paseador.",
    resumen: "Al paseador 2 horas antes de su paseo",
    variables: ["nombre del paseador", "hora del paseo", "dirección"],
    texto: `Hola {{1}} 🐶 Recordatorio de tu paseo de hoy.

Hora: {{2}}
Dirección: {{3}}

Antes de salir: celular cargado y con datos. No siempre se ocupa, pero hay clientes que piden rastreo por GPS y necesitamos poder activarlo.

Si este paseo lleva GPS, nosotros te avisamos con anticipación y te damos de alta en la app junto con el perrito. Si no te avisamos, no tienes que abrir nada.

Y si por algo no vas a poder llegar, avísanos por lo menos 30 minutos antes 🙌`,
  },
  {
    nombre: "pago_vencido",
    destinatario: "cliente",
    cuando: "3 días después de terminada la semana sin que el pago esté marcado en el panel. Puede repetirse a los 7 días.",
    resumen: "Al cliente que quedó a deber",
    variables: ["monto pendiente", "semana correspondiente"],
    texto: `Hola 🐾 Le recordamos que tiene un pago pendiente de {{1}} correspondiente a la semana del {{2}}.

El pago es por transferencia directamente con nosotros. Si ya lo realizó, háganoslo saber para registrarlo.

Este es un número de mensajes automáticos de Perrones. Cualquier duda, escríbanos al ${TEL_ATENCION}.`,
  },
  {
    nombre: "solicitud_resena",
    destinatario: "cliente",
    cuando: "1 día después del último paseo de la semana. Solo clientes nuevos, una sola vez por cliente.",
    resumen: "Al cliente nuevo, para pedirle reseña",
    variables: [],
    texto: `Hola 🐾 Esperamos que su perrito haya disfrutado su paseo.

Si le tomara un minuto, nos ayudaría muchísimo que nos dejara una reseña en perronescuu.com — es lo que nos ayuda a que más dueños nos conozcan.

¡Gracias por confiar en Perrones! 🐶

Este es un número de mensajes automáticos. Para atención personalizada, escríbanos al ${TEL_ATENCION}.`,
  },
]

/** La env var que guarda el Content SID de una plantilla. */
export function envVarDe(nombre: string) {
  return `TWILIO_TPL_${nombre.toUpperCase()}`
}
