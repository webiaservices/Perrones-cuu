/**
 * Prueba de punta a punta del anuncio de vacantes por oleadas.
 *
 * SOLO corre contra un servidor LOCAL levantado con NOTIFICACIONES_SIMULADAS=1:
 * así se recorre todo el camino de verdad (botón del admin → ruta → base) sin
 * mandar un solo WhatsApp, push ni correo. Las pruebas locales usan la base de
 * producción, por eso la reserva y la cuenta son desechables y se borran por id.
 *
 *   NOTIFICACIONES_SIMULADAS=1 pnpm dev        (en otra terminal)
 *   node pruebas/oleadas.mjs
 */
import { abrirPlaywright, conectarBase, crearCuenta, borrarCuenta, hacerBitacora } from "./lib.mjs"

const base = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "")
const CLIENTE = "PRUEBA WEBIA - BORRAR"
const TEL_ENDY = "6145948513"
const t10 = (t) => String(t ?? "").replace(/\D/g, "").slice(-10)

if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
  console.error("Esta prueba solo corre contra un servidor local en modo simulado.")
  process.exit(2)
}

const b = hacerBitacora("Vacantes por oleadas")
const db = await conectarBase()

// 0. ¿El servidor de verdad está simulando? Si no, no se toca nada.
const pre = await fetch(`${base}/api/cron/avisos`).then((r) => r.json()).catch(() => ({}))
if (!pre.simulado) {
  console.error("El servidor NO está en modo simulado (NOTIFICACIONES_SIMULADAS=1). No se corre nada.")
  process.exit(2)
}
b.ok("El servidor está en modo simulado: no sale ningún mensaje")

const conTablas = !(await db.from("vacante_avisos").select("reservation_id").limit(1)).error
console.log(conTablas ? "  (migración 0026 aplicada)" : "  (SIN migración 0026: se prueba el modo de respaldo)")

const cuenta = await crearCuenta(db, { role: "dueno" })
await db.from("profiles").update({ role: "admin" }).eq("id", cuenta.id)
let reservaId = null
const nav = await (await abrirPlaywright()).chromium.launch({ headless: process.env.VER !== "1" })

try {
  // 1. Una vacante de prueba, privada, dentro de 20 días
  const cuando = new Date(Date.now() + 20 * 86400000)
  const { data: res, error: errRes } = await db
    .from("reservations")
    .insert({
      user_id: cuenta.id,
      manual_client_name: CLIENTE,
      plan_name: "Paseo de 1 día",
      dogs_count: 1,
      price_mxn: 250,
      status: "buscando_paseador",
      visibility: "pending_admin",
      scheduled_at: cuando.toISOString(),
      scheduled_until: new Date(cuando.getTime() + 3600000).toISOString(),
      zone: "Centro",
      city: "chihuahua",
      pickup_address: "PRUEBA — no ir",
      dog_name: "PRUEBA WEBIA",
      dog_size: "mediano",
      notes: CLIENTE,
    })
    .select("id")
    .single()
  if (errRes) throw new Error(`No se pudo crear la reserva de prueba: ${errRes.message}`)
  reservaId = res.id

  // 2. El admin entra y la hace pública con el botón de verdad
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 } })
  const pg = await ctx.newPage()
  await pg.goto(`${base}/login`, { waitUntil: "networkidle" })
  await pg.fill('input[type="email"]', cuenta.email)
  await pg.fill('input[type="password"]', cuenta.password)
  await Promise.all([pg.waitForURL((u) => u.pathname.startsWith("/panel"), { timeout: 30000 }), pg.click('button[type="submit"]')])
  const buscador = pg.locator('input[placeholder*="Buscar" i]').first()
  if (await buscador.count()) await buscador.fill("PRUEBA WEBIA")
  const fila = pg.locator("tr", { hasText: CLIENTE }).first()
  await fila.waitFor({ timeout: 20000 })
  const inicio = Date.now()
  const respuesta = pg.waitForResponse((r) => r.url().includes("/api/notify-paseadores"), { timeout: 90000 })
  await fila.getByRole("button", { name: /Privado/ }).click()
  await fila.getByRole("button", { name: /Público/ }).waitFor({ timeout: 20000 })
  await respuesta
  const segundos = (Date.now() - inicio) / 1000
  // Endy no ve nada nuevo en su pantalla (así lo pidió Diego): ni mensajes ni avisos
  await pg.waitForTimeout(1500)
  if ((await pg.locator("text=/Se avisó a|Paseo publicado/").count()) === 0) b.ok("Publicar se ve igual que antes para Endy (sin mensajes nuevos)")
  else b.falla("Apareció un mensaje nuevo en la pantalla de Endy")
  if ((await pg.locator("text=/no se pudo avisar/").count()) === 0) b.ok("Sin aviso de error: el anuncio salió")
  else b.falla("Apareció el aviso rojo de falla al publicar")
  const { count: wa1Base } = conTablas
    ? await db.from("vacante_notificados").select("*", { count: "exact", head: true }).eq("reservation_id", reservaId).eq("canal", "whatsapp")
    : { count: null }
  const wa1 = wa1Base ?? 0

  if (!conTablas) {
    b.ok("Sin la migración, publicar sigue avisando (respaldo): no se queda muda la vacante")
  } else {
    // 3. Revisar en la base a quién se le avisó
    const { data: notif } = await db.from("vacante_notificados").select("profile_id, canal, ola").eq("reservation_id", reservaId)
    const waIds = (notif ?? []).filter((x) => x.canal === "whatsapp").map((x) => x.profile_id)
    const { data: perfiles } = await db.from("profiles").select("id, phone, city, manual_version, manual_accepted_at, wa_rebotes").in("id", waIds.length ? waIds : ["00000000-0000-0000-0000-000000000000"])
    const tels = (perfiles ?? []).map((p) => t10(p.phone))
    // Esperado: TODOS los paseadores de la ciudad que pueden recibirlo (como
    // siempre), menos el desperdicio: Endy, números muertos, teléfonos repetidos
    const { data: todos } = await db.from("profiles").select("id, phone, city, banned, wa_rebotes").eq("role", "paseador")
    const telsEsperados = new Set(
      (todos ?? [])
        .filter((p) => !p.banned && (p.city ?? "chihuahua") === "chihuahua" && (p.wa_rebotes ?? 0) < 2 && t10(p.phone).length === 10 && t10(p.phone) !== TEL_ENDY)
        .map((p) => t10(p.phone)),
    )
    if (waIds.length === telsEsperados.size) b.ok("La vacante le llega a TODOS los que la pueden tomar, como siempre", `${waIds.length} de ${telsEsperados.size}`)
    else b.falla("A alguien que debía recibir la vacante no le llegó", `${waIds.length} de ${telsEsperados.size}`)
    if (segundos < 55) b.ok("Alcanza a mandarle a todos antes del límite de tiempo", `${segundos.toFixed(1)} s`)
    else b.falla("Mandar a todos tarda demasiado: la función se cortaría", `${segundos.toFixed(1)} s`)
    if ((perfiles ?? []).every((p) => (p.city ?? "chihuahua") === "chihuahua")) b.ok("Solo paseadores de la misma ciudad")
    else b.falla("Se le avisó a paseadores de otra ciudad")
    if ((perfiles ?? []).every((p) => (p.wa_rebotes ?? 0) < 2)) b.ok("Ningún número muerto")
    else b.falla("Se le mandó a un número que ya rebotó")
    if (new Set(tels).size === tels.length) b.ok("Ningún teléfono repetido")
    else b.falla("Un teléfono recibió dos WhatsApp")
    if (!tels.includes(TEL_ENDY)) b.ok("A Endy no se le paga el aviso de la vacante que él publicó")
    else b.falla("Se le mandó WhatsApp al número de Endy")
    const { data: bit } = await db.from("wa_envios").select("clave, resultado").like("clave", `sim|paseo_disponible|${reservaId}|%`)
    if ((bit ?? []).length === wa1 && (bit ?? []).every((x) => x.resultado === "simulado")) b.ok("Cada WhatsApp quedó en la bitácora, marcado como simulado")
    else b.falla("La bitácora no cuadra", JSON.stringify(bit ?? []).slice(0, 200))

    // 4. Doble publicación: no se vuelve a pagar
    await fila.getByRole("button", { name: /Público/ }).click()
    await fila.getByRole("button", { name: /Privado/ }).waitFor({ timeout: 20000 })
    await fila.getByRole("button", { name: /Privado/ }).click()
    await fila.getByRole("button", { name: /Público/ }).waitFor({ timeout: 20000 })
    await pg.waitForTimeout(8000)
    const { count: waTras } = await db.from("vacante_notificados").select("*", { count: "exact", head: true }).eq("reservation_id", reservaId).eq("canal", "whatsapp")
    if (waTras === waIds.length) b.ok("Volver a publicar enseguida NO paga otra ronda", `${waIds.length} → ${waTras}`)
    else b.falla("El doble clic pagó más WhatsApp", `${waIds.length} → ${waTras}`)

    // 5. El reloj ya no manda olas extra: una sola ronda, a todos
    await db.from("vacante_avisos").update({ ultima_ola_at: new Date(Date.now() - 50 * 60000).toISOString() }).eq("reservation_id", reservaId)
    const cron2 = await fetch(`${base}/api/cron/avisos`).then((r) => r.json())
    const { count: waTrasReloj } = await db.from("vacante_notificados").select("*", { count: "exact", head: true }).eq("reservation_id", reservaId).eq("canal", "whatsapp")
    if (!(cron2.vacantes ?? []).some((v) => v.ola > 0) && waTrasReloj === waIds.length) b.ok("El reloj no manda rondas extra por su cuenta")
    else b.falla("El reloj mandó otra ronda", JSON.stringify(cron2.vacantes ?? []).slice(0, 200))

    // 6. Alguien la toma y la suelta: como antes, NO se re-anuncia sola
    await db.from("reservations").update({ status: "confirmada", walker_id: cuenta.id }).eq("id", reservaId)
    await fetch(`${base}/api/cron/avisos`)
    await db.from("reservations").update({ status: "buscando_paseador", walker_id: null, visibility: "public" }).eq("id", reservaId)
    await fetch(`${base}/api/cron/avisos`)
    const { data: est } = await db.from("vacante_avisos").select("ciclo").eq("reservation_id", reservaId).single()
    if (est?.ciclo === 1) b.ok("Si la sueltan, no se re-anuncia sola (igual que antes: lo decide Endy)")
    else b.falla("Se re-anunció sola al soltarla", JSON.stringify(est))

    // 7. Endy la vuelve a publicar (pasados 45 min): sale otra ronda a todos, como antes
    await db.from("vacante_avisos").update({ ultima_ola_at: new Date(Date.now() - 50 * 60000).toISOString() }).eq("reservation_id", reservaId)
    await pg.reload({ waitUntil: "networkidle" })
    const buscador2 = pg.locator('input[placeholder*="Buscar" i]').first()
    if (await buscador2.count()) await buscador2.fill("PRUEBA WEBIA")
    const fila2 = pg.locator("tr", { hasText: CLIENTE }).first()
    await fila2.getByRole("button", { name: /Público/ }).click()
    await fila2.getByRole("button", { name: /Privado/ }).waitFor({ timeout: 20000 })
    const resp2 = pg.waitForResponse((r) => r.url().includes("/api/notify-paseadores"), { timeout: 90000 })
    await fila2.getByRole("button", { name: /Privado/ }).click()
    await resp2
    const { data: est2 } = await db.from("vacante_avisos").select("ciclo").eq("reservation_id", reservaId).single()
    const { count: waRonda2 } = await db.from("vacante_notificados").select("*", { count: "exact", head: true }).eq("reservation_id", reservaId).eq("canal", "whatsapp")
    if (est2?.ciclo === 2 && waRonda2 === waIds.length) b.ok("Volver a publicar después de 45 min manda otra ronda a todos, como antes", `${waRonda2} WhatsApp`)
    else b.falla("Volver a publicar no mandó la ronda completa", JSON.stringify({ est2, waRonda2 }))
  }

  await ctx.close()
} catch (e) {
  b.falla("Se rompió a medio camino", e instanceof Error ? e.message : String(e))
} finally {
  await nav.close()
  if (reservaId) {
    // La bitácora apunta a la reserva con "set null": se borra por su clave
    await db.from("wa_envios").delete().like("clave", `sim|%|${reservaId}|%`)
    await db.from("wa_envios").delete().eq("reservation_id", reservaId)
    await db.from("reservations").delete().eq("id", reservaId)
  }
  await borrarCuenta(db, cuenta)
  const { count } = await db.from("reservations").select("id", { count: "exact", head: true }).eq("manual_client_name", CLIENTE)
  if (count) console.log(`  ⚠ Quedaron ${count} reservas de prueba vivas`)
}

const fallas = b.pasos.filter((p) => p.resultado === "FALLA")
console.log(`\n${b.pasos.length - fallas.length}/${b.pasos.length} pasos pasaron`)
process.exit(fallas.length ? 1 : 0)
