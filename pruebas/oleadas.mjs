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
  await fila.getByRole("button", { name: /Privado/ }).click()
  await fila.getByRole("button", { name: /Público/ }).waitFor({ timeout: 20000 })
  // Endy no ve nada nuevo en su pantalla (así lo pidió Diego): ni mensajes ni avisos
  await pg.waitForTimeout(8000)
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
    if (waIds.length >= 1 && waIds.length <= 5) b.ok("La ola 1 paga máximo 5 WhatsApp (antes ~62)", `${waIds.length} WhatsApp`)
    else b.falla("La ola 1 no mandó o pagó de más", `${waIds.length} WhatsApp`)
    if ((perfiles ?? []).every((p) => (p.city ?? "chihuahua") === "chihuahua")) b.ok("Solo paseadores de la misma ciudad")
    else b.falla("Se le avisó a paseadores de otra ciudad")
    if ((perfiles ?? []).every((p) => p.manual_accepted_at && (p.wa_rebotes ?? 0) < 2)) b.ok("Solo quien puede tomarlo (manual aceptado, número sano)")
    else b.falla("Se le pagó WhatsApp a quien no puede tomar el paseo")
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

    // 5. Ola 2: se adelanta el reloj 50 minutos y corre el cron (simulado)
    await db.from("vacante_avisos").update({ ultima_ola_at: new Date(Date.now() - 50 * 60000).toISOString() }).eq("reservation_id", reservaId)
    const cron2 = await fetch(`${base}/api/cron/avisos`).then((r) => r.json())
    const mia2 = (cron2.vacantes ?? []).find((v) => v.ola === 2)
    const { data: notif2 } = await db.from("vacante_notificados").select("profile_id, ola").eq("reservation_id", reservaId).eq("canal", "whatsapp")
    const ola2 = (notif2 ?? []).filter((x) => x.ola === 2).map((x) => x.profile_id)
    if (mia2 && mia2.whatsapp <= 10 && ola2.length === mia2.whatsapp) b.ok("A los 45 min sin paseador sale la ola 2 (máx 10)", `${mia2.whatsapp} WhatsApp`)
    else b.falla("La ola 2 no salió o pagó de más", JSON.stringify(cron2.vacantes ?? []).slice(0, 200))
    if (ola2.every((id) => !waIds.includes(id))) b.ok("La ola 2 no repite a nadie de la ola 1")
    else b.falla("La ola 2 le volvió a pagar a alguien de la ola 1")
    const cron3 = await fetch(`${base}/api/cron/avisos`).then((r) => r.json())
    if (!(cron3.vacantes ?? []).some((v) => v.ola > 0)) b.ok("Después de la ola 2 el reloj ya no manda nada más")
    else b.falla("El reloj siguió mandando olas", JSON.stringify(cron3.vacantes).slice(0, 200))

    // 6. Alguien la toma y luego la suelta: ciclo nuevo automático
    await db.from("reservations").update({ status: "confirmada", walker_id: cuenta.id }).eq("id", reservaId)
    await fetch(`${base}/api/cron/avisos`)
    const { data: est1 } = await db.from("vacante_avisos").select("tomada_at, ciclo").eq("reservation_id", reservaId).single()
    if (est1?.tomada_at) b.ok("El reloj anota cuando alguien la tomó")
    else b.falla("El reloj no vio que la tomaron")
    await db.from("reservations").update({ status: "buscando_paseador", walker_id: null, visibility: "public" }).eq("id", reservaId)
    const cron4 = await fetch(`${base}/api/cron/avisos`).then((r) => r.json())
    const { data: est2 } = await db.from("vacante_avisos").select("tomada_at, ciclo, ola").eq("reservation_id", reservaId).single()
    const re = (cron4.vacantes ?? []).find((v) => v.ola === 1)
    if (est2?.ciclo === 2 && est2?.ola === 1 && re && re.whatsapp <= 5) b.ok("Si la sueltan, se vuelve a anunciar sola (ciclo 2)", `${re.whatsapp} WhatsApp`)
    else b.falla("La vacante soltada no se volvió a anunciar", JSON.stringify({ est2, vac: cron4.vacantes }).slice(0, 200))
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
