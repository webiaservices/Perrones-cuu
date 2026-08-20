# Alta de las 9 plantillas en Twilio

Generado desde `lib/whatsapp-plantillas.ts`. Si cambia un texto allá, hay que
volver a generar este documento y volver a dar de alta la plantilla.

## Antes de empezar

- Las plantillas se crean en **Twilio → Messaging → Content Template Builder → Create new**.
- **Content type:** Text · **Language:** Spanish (MEX) — es_MX
- **Category: Utility** en TODAS. Marketing cuesta 5× más y a estas Meta las rechaza.
- Al guardar, **Submit for WhatsApp approval** y copiar el **Content SID** (`HX...`).
- Meta aprueba en minutos o hasta 48 h.

## Las 4 que YA existen cambian de texto

Estas cuatro ya están dadas de alta, pero **el texto cambió** (trato de usted y
cierre con el 614-594-85-13). En Twilio no se puede editar una plantilla ya
aprobada: hay que **crear una nueva** con el texto de abajo y **reemplazar el
Content SID** en la variable de Vercel. La vieja se puede borrar después.

⚠️ **Ojo con el orden de las variables**: cambió en varias. Si se da de alta con
otro orden, los mensajes salen con los datos revueltos.

---

## paseo_confirmado ♻️ CAMBIA

**Para:** el cliente

**Cuándo:** El cliente completa una reserva en perronescuu.com.

**Variable de Vercel:** `TWILIO_TPL_PASEO_CONFIRMADO`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — nombre del cliente
2. `{{2}}` — lista de fechas y horas, una por renglón

**Texto para copiar y pegar:**

```
Hola {{1}} 🐾 ¡Gracias por reservar con Perrones!

Sus paseos quedaron registrados para:
{{2}}

En un momento le confirmamos el paseador asignado.

Puede tomar cierto tiempo contactar a un paseador, pero no se preocupe: nosotros siempre le vamos a avisar.

Le recordamos que nuestros paseos incluyen recogida y entrega en su domicilio.

Si desea utilizar el rastreo por GPS en tiempo real, háganoslo saber al 614-594-85-13.

Este es un número automático de Perrones. Para atención personalizada, escríbanos al 614-594-85-13 🐶
```

---

## paseador_asignado ♻️ CAMBIA

**Para:** el cliente

**Cuándo:** Un paseador acepta el paseo en la plataforma.

**Variable de Vercel:** `TWILIO_TPL_PASEADOR_ASIGNADO`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — nombre del paseador
2. `{{2}}` — fecha y hora del paseo

**Texto para copiar y pegar:**

```
Hola 🐾 Su paseo ya tiene paseador asignado.

Paseador: {{1}}
Fecha y hora: {{2}}

Pasará por su perrito a su domicilio y se lo entregará al terminar la hora de paseo.

Le compartimos su número al paseador únicamente para que pueda comunicarse con usted si surge algún cambio o alguna situación durante el paseo.

IMPORTANTE: el pago siempre es mediante transferencia y directamente con nosotros. Nunca en efectivo al paseador.

Este es un número de mensajes automáticos de Perrones. Para atención personalizada, escríbanos al 614-594-85-13 🐶
```

---

## paseo_disponible ♻️ CAMBIA

**Para:** el paseador

**Cuándo:** Se abre una vacante o un paseo nuevo que hay que asignar.

**Variable de Vercel:** `TWILIO_TPL_PASEO_DISPONIBLE`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — nombre del paseador
2. `{{2}}` — zona o colonia
3. `{{3}}` — pago semanal de la ruta

**Texto para copiar y pegar:**

```
Hola, muy buenas tardes {{1}} 🐶

Le informamos que se abrió una nueva vacante en la zona de {{2}}.

Pago semanal: {{3}}

Si le interesa, puede tomarla directamente en nuestra página: perronescuu.com

En algunos casos se requiere celular con datos móviles para todo (no solo redes sociales), ya que ciertos clientes solicitan rastreo por GPS en tiempo real. No aplica en todos los paseos, pero es importante tenerlo en cuenta.

Este es un número de mensajes automáticos de Perrones. Para atención personalizada, escríbanos al 614-594-85-13.
```

---

## recordatorio_pago ♻️ CAMBIA

**Para:** el cliente

**Cuándo:** Al INICIAR el último paseo de la semana del cliente (no al terminarlo, para que le dé tiempo de preparar la transferencia).

**Variable de Vercel:** `TWILIO_TPL_RECORDATORIO_PAGO`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — monto a pagar

**Texto para copiar y pegar:**

```
Hola 🐾 Le informamos que hoy se realiza el último paseo de su semana.

Total a pagar: {{1}}

Si tuvo alguna modificación de horario o de día con el paseador para reponer algún paseo, no se preocupe: el pago se realiza cuando se finalicen todos los días contratados. Este mensaje le llega porque está automatizado en nuestra página.

El pago se realiza siempre por transferencia y directamente con nosotros, nunca en efectivo al paseador.

Este es un número de mensajes automáticos de Perrones. Si requiere los datos bancarios o tiene alguna duda, escríbanos al 614-594-85-13.

¡Gracias por confiar en Perrones! 🐶
```

---

## paseador_acepta 🆕 NUEVA

**Para:** el paseador

**Cuándo:** El paseador acepta un paseo. Los datos del dueño solo salen aquí, nunca a quien apenas mostró interés.

**Variable de Vercel:** `TWILIO_TPL_PASEADOR_ACEPTA`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — nombre del paseador
2. `{{2}}` — nombre del dueño o dueña
3. `{{3}}` — teléfono del dueño o dueña
4. `{{4}}` — ubicación o domicilio del paseo
5. `{{5}}` — días y hora del paseo

**Texto para copiar y pegar:**

```
Hola {{1}}, muy buenas tardes 🙌🏾

Nos alegra mucho que hayas aceptado el paseo.

Aquí está el manual de paseadores actualizado: perronescuu.com/manual

Te dejamos también los datos del paseo:

Dueño(a): {{2}}
Teléfono: {{3}}
Ubicación: {{4}}
Días y hora: {{5}}

Por favor revisa el manual con calma, leyendo cada punto, y acéptalo desde tu panel en la pestaña "Manual".

Te recordamos que el pago es mediante transferencia al finalizar la semana.

Este es un número de mensajes automáticos de Perrones. Si necesitas atención personalizada, escríbenos al 614-594-85-13. Cualquier duda, estamos en contacto 😊
```

---

## paseo_sin_cubrir 🆕 NUEVA

**Para:** el cliente

**Cuándo:** Faltan 2 horas para el paseo y sigue sin paseador asignado. La más importante: el hueco de no avisar ya dejó a dos clientas esperando.

**Variable de Vercel:** `TWILIO_TPL_PASEO_SIN_CUBRIR`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — hora del paseo que no se pudo cubrir

**Texto para copiar y pegar:**

```
Hola 🐾 Le escribimos para avisarle que hoy no logramos asignar paseador para el paseo de las {{1}}. Una disculpa.

Podemos resolverlo como usted prefiera: le reponemos el paseo otro día de esta misma semana, o se lo descontamos del paquete.

Dígame cuál le acomoda y lo dejamos listo.

Este es un número de mensajes automáticos de Perrones. Para atención personalizada, escríbanos al 614-594-85-13.
```

---

## recordatorio_paseador 🆕 NUEVA

**Para:** el paseador

**Cuándo:** 2 horas antes del primer paseo del día de ese paseador.

**Variable de Vercel:** `TWILIO_TPL_RECORDATORIO_PASEADOR`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — nombre del paseador
2. `{{2}}` — hora del paseo
3. `{{3}}` — dirección

**Texto para copiar y pegar:**

```
Hola {{1}} 🐶 Recordatorio de tu paseo de hoy.

Hora: {{2}}
Dirección: {{3}}

Antes de salir: celular cargado y con datos. No siempre se ocupa, pero hay clientes que piden rastreo por GPS y necesitamos poder activarlo.

Si este paseo lleva GPS, nosotros te avisamos con anticipación y te damos de alta en la app junto con el perrito. Si no te avisamos, no tienes que abrir nada.

Y si por algo no vas a poder llegar, avísanos por lo menos 30 minutos antes 🙌
```

---

## pago_vencido 🆕 NUEVA

**Para:** el cliente

**Cuándo:** 3 días después de terminada la semana sin que el pago esté marcado en el panel. Puede repetirse a los 7 días.

**Variable de Vercel:** `TWILIO_TPL_PAGO_VENCIDO`

**Variables, EN ESTE ORDEN:**

1. `{{1}}` — monto pendiente
2. `{{2}}` — semana correspondiente

**Texto para copiar y pegar:**

```
Hola 🐾 Le recordamos que tiene un pago pendiente de {{1}} correspondiente a la semana del {{2}}.

El pago es por transferencia directamente con nosotros. Si ya lo realizó, háganoslo saber para registrarlo.

Este es un número de mensajes automáticos de Perrones. Cualquier duda, escríbanos al 614-594-85-13.
```

---

## solicitud_resena 🆕 NUEVA

**Para:** el cliente

**Cuándo:** 1 día después del último paseo de la semana. Solo clientes nuevos, una sola vez por cliente.

**Variable de Vercel:** `TWILIO_TPL_SOLICITUD_RESENA`

**Variables:** ninguna.

**Texto para copiar y pegar:**

```
Hola 🐾 Esperamos que su perrito haya disfrutado su paseo.

Si le tomara un minuto, nos ayudaría muchísimo que nos dejara una reseña en perronescuu.com — es lo que nos ayuda a que más dueños nos conozcan.

¡Gracias por confiar en Perrones! 🐶

Este es un número de mensajes automáticos. Para atención personalizada, escríbanos al 614-594-85-13.
```

---

## Variables que hay que agregar en Vercel

Al terminar, en **Settings → Environment Variables** del proyecto:

| Variable | Plantilla |
|---|---|
| `TWILIO_TPL_PASEO_CONFIRMADO` | paseo_confirmado |
| `TWILIO_TPL_PASEADOR_ASIGNADO` | paseador_asignado |
| `TWILIO_TPL_PASEO_DISPONIBLE` | paseo_disponible |
| `TWILIO_TPL_RECORDATORIO_PAGO` | recordatorio_pago |
| `TWILIO_TPL_PASEADOR_ACEPTA` | paseador_acepta |
| `TWILIO_TPL_PASEO_SIN_CUBRIR` | paseo_sin_cubrir |
| `TWILIO_TPL_RECORDATORIO_PASEADOR` | recordatorio_paseador |
| `TWILIO_TPL_PAGO_VENCIDO` | pago_vencido |
| `TWILIO_TPL_SOLICITUD_RESENA` | solicitud_resena |

Las cuatro existentes ya tienen su variable: hay que **actualizar su valor** con
el Content SID nuevo, no crear otra.

**Y un redeploy al final**, o las variables nuevas no entran.

