# Configurar WhatsApp con Twilio — paso a paso

Todo el código ya está listo. Solo falta dar de alta el número y las 4
plantillas en Twilio, y pegar las credenciales en Vercel.

---

## PARTE 1 — Dar de alta el número (aquí se necesita a Endy 2 minutos)

1. En Twilio: **Messaging → Senders → WhatsApp senders → New sender**.
2. Elige **"Use my own number"** y pon el número de WhatsApp de Perrones.
   - ⚠️ Ese número **no debe** tener la app de WhatsApp normal instalada. Si la
     tiene, hay que borrar esa cuenta de WhatsApp primero (los chats se pierden)
     o usar otro número.
3. Twilio te va a pedir crear/conectar un **Meta Business Account**. Sigue el
   asistente (es el "embedded signup", se hace con la cuenta de Facebook del
   negocio).
4. **AQUÍ ENTRA ENDY:** Meta manda un **código de verificación de 6 dígitos** al
   número del negocio (por SMS o llamada). Endy te lo pasa y tú lo capturas.
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
