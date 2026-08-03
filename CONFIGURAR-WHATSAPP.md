# Conectar WhatsApp — manual completo

Todo el código ya está listo y desplegado. Esto es lo que falta hacer una sola
vez para que empiecen a salir los mensajes.

**Decisión tomada:** se usa un **chip nuevo** (número aparte). El WhatsApp
actual de Endy queda intacto.

---

## ✅ ANTES DE EMPEZAR — lo que le pides a Endy

1. **Que compre un chip nuevo** (Telcel/AT&T/Movistar, ~$100) y **lo active**.
   - Que confirme que **recibe SMS** (que se mande un mensaje de prueba).
   - ⚠️ Que **NO** le instale WhatsApp a ese número. Si le instala WhatsApp, hay
     que borrar esa cuenta antes de seguir.
2. **Que te dé el número** de ese chip.
3. **Que tenga el chip a la mano** el día del alta (en cualquier teléfono),
   porque le va a llegar un código.

> El chip solo se usa para recibir el código. Después se puede guardar.

---

## ⚠️ ANTES DE EMPEZAR — lo que necesitas tú

**Saldo en Twilio.** Las cuentas nuevas están en modo *trial* y solo pueden
mandar mensajes a números verificados a mano. Para mandar a los clientes hay
que **agregar saldo** (mínimo ~$20 USD) y salir del trial.
→ Twilio Console → **Billing → Add funds**.

Si no haces esto, la prueba te va a fallar aunque todo lo demás esté bien.

---

## PASO 1 — Dar de alta el número en Twilio

1. Twilio Console → **Messaging → Senders → WhatsApp senders → New sender**.
2. Pon el número del chip (formato internacional: `+521614XXXXXXX`).
3. Sigue el asistente. Te va a pedir conectar/crear un **Meta Business Account**
   (se hace con la cuenta de Facebook del negocio).
4. **AQUÍ ENTRA ENDY:** llega un **código de 6 dígitos** por SMS a ese chip.
   Él te lo pasa, tú lo capturas.
5. Pon el **nombre del negocio** como "Perrones Cuu" — así lo verán los
   clientes en el chat.
6. Espera a que el sender quede en estado **"Online"**.

---

## PASO 2 — Crear las 4 plantillas

Twilio → **Messaging → Content Template Builder → Create new**. Para cada una:

- **Content type:** Text
- **Language:** Spanish (Mexico) — `es_MX`
- **Category:** **Utility** ← IMPORTANTE. Si le pones *Marketing* cuesta 5× más.
- Pega el texto tal cual (respeta el orden de `{{1}}, {{2}}...`).
- **Submit for WhatsApp approval** y copia el **Content SID** (`HX...`).

> Meta tarda de minutos a unas horas en aprobarlas.

### 1. `paseo_confirmado`
Al cliente, apenas agenda. Variables: 1=nombre · 2=fecha y hora · 3=zona · 4=precio

```
Hola {{1}} 🐶 ¡Tu paseo quedó agendado!

📅 {{2}}
📍 Zona: {{3}}
💵 Total: MX${{4}}

Estamos buscando al paseador ideal para tu perrito. Te avisamos en cuanto alguien lo tome.
```

### 2. `paseador_asignado`
Al cliente, cuando un paseador acepta. Variables: 1=nombre · 2=paseador · 3=fecha y hora

```
Hola {{1}} 🎉 ¡Ya tienes paseador!

{{2}} tomó tu paseo del {{3}} y llegará puntual por tu perrito.

Cualquier duda, aquí andamos 🐕
```

### 3. `paseo_disponible`
A los paseadores, cuando hay paseo nuevo. Variables: 1=paseador · 2=zona · 3=fecha y hora

```
Hola {{1}} 🐕 Hay un paseo disponible

📍 Zona: {{2}}
📅 {{3}}

Entra a tu panel para tomarlo antes de que otro paseador lo agarre.
```

### 4. `recordatorio_pago`
Al cliente, al completarse el paseo. Variables: 1=nombre · 2=perro · 3=precio

```
Hola {{1}} ✅ El paseo de {{2}} ya terminó.

Total a transferir: MX${{3}}

Te mandamos los datos de la cuenta por correo. ¡Gracias por confiar en Perrones Cuu! 🐶
```

---

## PASO 3 — Webhook (para poder recibir respuestas)

Twilio → **Messaging → Senders → tu sender de WhatsApp** → campo
**"When a message comes in"**:

```
https://perronescuu.com/api/whatsapp-webhook
```
Método: **POST**

Sin esto, los clientes te contestan y no lo ves.

---

## PASO 4 — Base de datos

Supabase → **SQL Editor → New query** → pega todo el contenido de
`APLICAR-EN-SUPABASE-whatsapp.sql` → **Run**.

Crea la tabla donde se guardan los mensajes. Debe decir "Success".

---

## PASO 5 — Credenciales en Vercel

Vercel → proyecto **perrones-cuu-chihuahua** → **Settings → Environment
Variables**. Agrega estas 8 en **Production**:

| Variable | De dónde sale |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console, arriba (`AC...`) |
| `TWILIO_AUTH_TOKEN` | Twilio Console, junto al SID (dale "show") |
| `TWILIO_WHATSAPP_FROM` | El número del chip, ej. `+5216141234567` |
| `TWILIO_WEBHOOK_URL` | `https://perronescuu.com/api/whatsapp-webhook` |
| `TWILIO_TPL_PASEO_CONFIRMADO` | Content SID de la plantilla 1 |
| `TWILIO_TPL_PASEADOR_ASIGNADO` | Content SID de la plantilla 2 |
| `TWILIO_TPL_PASEO_DISPONIBLE` | Content SID de la plantilla 3 |
| `TWILIO_TPL_RECORDATORIO_PAGO` | Content SID de la plantilla 4 |

Después: **Deployments → el último → ⋯ → Redeploy**.
(Las variables nuevas NO entran sin redeploy.)

---

## PASO 6 — Probar

Panel de admin → pestaña **WhatsApp**:

1. Debe decir **"✅ WhatsApp conectado"**.
2. Las 4 plantillas en verde ("configurada").
3. Pon tu número → **"Enviar prueba"** → te debe llegar el WhatsApp.
4. **Contéstale** desde tu celular → debe aparecer en **"Mensajes de clientes"**.
5. Responde desde el panel → te debe llegar al celular.

Si algo falla, esa misma pantalla te dice qué está mal.

---

## Si algo sale mal

| Síntoma | Causa probable |
|---|---|
| "Las credenciales de Twilio no son válidas" | SID o Auth Token mal copiados |
| "Falta el Content SID de la plantilla X" | Falta esa variable en Vercel, o no hiciste redeploy |
| El mensaje de prueba no llega | Cuenta Twilio en *trial* sin saldo |
| No aparecen las respuestas de clientes | Falta el webhook (Paso 3) o el SQL (Paso 4) |
| "Pasaron más de 24h" | Regla de WhatsApp: solo se responde texto libre dentro de 24h |

---

## Costo

- Twilio **no cobra mensualidad**, solo por mensaje (~$0.013 USD c/u).
- ~300 mensajes/mes (50 clientes) ≈ **$80 MXN/mes**.
- Las respuestas dentro de la ventana de 24h son **gratis**.
