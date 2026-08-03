# Configurar WhatsApp con Twilio — paso a paso

Todo el código ya está listo. Solo falta dar de alta el número y las 4
plantillas en Twilio, y pegar las credenciales en Vercel.

---

## PARTE 1 — Dar de alta el número

### Qué número usar (IMPORTANTE)

Un número **no puede estar al mismo tiempo** en la app de WhatsApp y en el
sistema automático. Por eso hay que usar un número **aparte** del que Endy usa
para chatear:

| Opción | Costo | Notas |
|---|---|---|
| **Teléfono fijo del negocio** ✅ | $0 | La mejor. La línea sigue funcionando **igual** para llamadas; como nunca tuvo WhatsApp, no se pierde nada. Verificación por llamada de voz. |
| **Chip nuevo** | ~$100 una vez | Se mete en cualquier teléfono 2 min para el código; después ya no se usa. |
| ~~El número personal de Endy~~ ❌ | — | Perdería poder chatear desde su celular con ese número. **No usar.** |

> El teléfono y la línea **no se dañan ni se desactivan**. Lo único que pasa es
> que ese número deja de poder usar la *app* de WhatsApp.

### Pasos

1. En Twilio: **Messaging → Senders → WhatsApp senders → New sender**.
2. Pon el número elegido (fijo o chip nuevo).
3. Twilio te va a pedir crear/conectar un **Meta Business Account**. Sigue el
   asistente (es el "embedded signup", con la cuenta de Facebook del negocio).
4. **AQUÍ ENTRA ENDY (2 minutos):** Meta manda un **código de 6 dígitos** a ese
   número, por SMS o por llamada. Endy te lo pasa y tú lo capturas.
   → Es el único paso que obligatoriamente pasa por él.
5. Cuando el sender quede en estado **"Online"**, ya se puede mandar.

---

## PARTE 2 — Crear las 4 plantillas

En Twilio: **Messaging → Content Template Builder → Create new**.

Para cada una:
- **Content type:** Text
- **Language:** Spanish (Mexico) — `es_MX`
- **Category (al enviar a aprobación):** **Utility** ← IMPORTANTE, es la tarifa
  barata. Si la marcas como Marketing cuesta 5 veces más.
- Pega el texto tal cual (respeta el orden de las variables `{{1}}, {{2}}...`).
- Guarda y dale **Submit for WhatsApp approval**.
- Copia el **Content SID** (empieza con `HX...`) — lo vas a necesitar.

> Meta tarda de unos minutos a unas horas en aprobarlas.

### 1. `paseo_confirmado`
**Cuándo se manda:** al cliente, apenas agenda su paseo.
**Variables:** 1=nombre cliente · 2=fecha y hora · 3=zona · 4=precio

```
Hola {{1}} 🐶 ¡Tu paseo quedó agendado!

📅 {{2}}
📍 Zona: {{3}}
💵 Total: MX${{4}}

Estamos buscando al paseador ideal para tu perrito. Te avisamos en cuanto alguien lo tome.
```

### 2. `paseador_asignado`
**Cuándo se manda:** al cliente, cuando un paseador acepta su paseo.
**Variables:** 1=nombre cliente · 2=nombre paseador · 3=fecha y hora

```
Hola {{1}} 🎉 ¡Ya tienes paseador!

{{2}} tomó tu paseo del {{3}} y llegará puntual por tu perrito.

Cualquier duda, aquí andamos 🐕
```

### 3. `paseo_disponible`
**Cuándo se manda:** a los paseadores, cuando entra un paseo nuevo.
**Variables:** 1=nombre paseador · 2=zona · 3=fecha y hora

```
Hola {{1}} 🐕 Hay un paseo disponible

📍 Zona: {{2}}
📅 {{3}}

Entra a tu panel para tomarlo antes de que otro paseador lo agarre.
```

### 4. `recordatorio_pago`
**Cuándo se manda:** al cliente, cuando el paseo se marca como completado.
**Variables:** 1=nombre cliente · 2=nombre del perro · 3=precio

```
Hola {{1}} ✅ El paseo de {{2}} ya terminó.

Total a transferir: MX${{3}}

Te mandamos los datos de la cuenta por correo. ¡Gracias por confiar en Perrones Cuu! 🐶
```

---

## PARTE 3 — Pegar las credenciales en Vercel

En Vercel → proyecto **perrones-cuu-chihuahua** → **Settings → Environment
Variables**. Agrega estas 7 (entorno: Production):

| Variable | De dónde sale |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio Console, arriba (empieza con `AC...`) |
| `TWILIO_AUTH_TOKEN` | Twilio Console, junto al SID (dale "show") |
| `TWILIO_WHATSAPP_FROM` | El número del sender, ej. `+526145948513` |
| `TWILIO_TPL_PASEO_CONFIRMADO` | Content SID (`HX...`) de la plantilla 1 |
| `TWILIO_TPL_PASEADOR_ASIGNADO` | Content SID de la plantilla 2 |
| `TWILIO_TPL_PASEO_DISPONIBLE` | Content SID de la plantilla 3 |
| `TWILIO_TPL_RECORDATORIO_PAGO` | Content SID de la plantilla 4 |

Después de agregarlas: **Deployments → el último → Redeploy** (las variables
nuevas solo entran con un redeploy).

---

## PARTE 4 — Probar

1. Entra al panel de admin → pestaña **WhatsApp**.
2. Debe decir **"✅ WhatsApp conectado"** y las 4 plantillas en verde.
3. Escribe tu número y dale **"Enviar prueba"**. Si te llega, ya quedó.

Si algo falla, esa misma pantalla te dice **qué** está mal (credencial
inválida, plantilla sin configurar, etc.).

---

## Costo

- Twilio **no cobra mensualidad** — solo por mensaje.
- Cada mensaje sale en ~**$0.013 USD** (tarifa de Meta + comisión de Twilio).
- Con 50 clientes ≈ 300 mensajes/mes ≈ **$80 MXN/mes**.
- Los mensajes que el cliente responde dentro de 24h son **gratis**.

---

## PARTE 5 — Bandeja de mensajes (para poder CONTESTAR)

Con la API de WhatsApp los mensajes que responden los clientes **no llegan a
ningún celular**: llegan a un servidor. Por eso la plataforma trae una bandeja
en el panel de admin.

**Para activarla:**

1. Corre el SQL `APLICAR-EN-SUPABASE-whatsapp.sql` en Supabase (crea la tabla
   donde se guardan los mensajes).
2. En Twilio → **Messaging → Senders → tu sender de WhatsApp** → campo
   **"When a message comes in"**, pon:
   `https://perronescuu.com/api/whatsapp-webhook`  (método **POST**)
3. Agrega en Vercel la variable `TWILIO_WEBHOOK_URL` con ese mismo valor
   (sirve para validar que los mensajes vengan de verdad de Twilio).

**Cómo se usa:** panel de admin → pestaña **WhatsApp** → sección
**"Mensajes de clientes"**. Ahí se ven las conversaciones y se contesta.

⚠️ **Regla de WhatsApp:** solo se puede responder texto libre dentro de las
**24 horas** siguientes al último mensaje del cliente. Pasado ese tiempo la
bandeja lo avisa y hay que escribirle desde el WhatsApp normal.
