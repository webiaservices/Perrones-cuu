/**
 * Pruebas de quién recibe cada vacante. Sin base ni red: datos inventados.
 * Correr:  node --test pruebas/vacantes.test.ts
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { elegirCorreo, elegirPush, elegirWhatsApp, type Contexto, type Paseador } from "../lib/vacantes-seleccion.ts"

let n = 0
const p = (o: Partial<Paseador> = {}): Paseador => {
  n++
  return {
    id: o.id ?? `p${n}`,
    full_name: `Paseador ${n}`,
    phone: o.phone === undefined ? `61400000${String(n).padStart(2, "0")}` : o.phone,
    email: o.email === undefined ? `p${n}@correo.mx` : o.email,
    zone: o.zone ?? "Centro",
    city: o.city ?? "chihuahua",
    banned: o.banned ?? false,
    wa_rebotes: o.wa_rebotes ?? 0,
    manual_ok: o.manual_ok ?? true,
    created_at: o.created_at ?? `2026-08-${String((n % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  }
}
const ctx = (o: Partial<Contexto> = {}): Contexto => ({
  ciudad: o.ciudad ?? "chihuahua",
  zona: o.zona ?? "Centro",
  tomados: o.tomados ?? {},
  yaAvisados: o.yaAvisados ?? { push: new Set(), whatsapp: new Set(), correo: new Set() },
})

test("una vacante de CDMX no le llega a nadie de Chihuahua", () => {
  const todos = Array.from({ length: 62 }, () => p({ city: "chihuahua" }))
  assert.equal(elegirWhatsApp(todos, ctx({ ciudad: "cdmx" }), 5).length, 0)
  assert.equal(elegirPush(todos, ctx({ ciudad: "cdmx" })).length, 0)
  assert.equal(elegirCorreo(todos, ctx({ ciudad: "cdmx" }), 15, new Set()).length, 0)
})

test("con 62 paseadores, la primera ola paga máximo el cupo, no 62", () => {
  const todos = Array.from({ length: 62 }, () => p())
  assert.equal(elegirWhatsApp(todos, ctx(), 5).length, 5)
})

test("primero van quienes SÍ toman paseos, aunque sean de otra zona", () => {
  const trabajador = p({ id: "trabaja", zone: "Otra" })
  const resto = Array.from({ length: 10 }, () => p({ zone: "Centro" }))
  const elegidos = elegirWhatsApp([...resto, trabajador], ctx({ tomados: { trabaja: 3 } }), 5)
  assert.equal(elegidos[0].id, "trabaja")
})

test("entre los que nunca han tomado uno, primero los de la misma zona", () => {
  const lejos = p({ id: "lejos", zone: "Robinson" })
  const cerca = p({ id: "cerca", zone: "Centro" })
  const elegidos = elegirWhatsApp([lejos, cerca], ctx({ zona: "centro " }), 1)
  assert.equal(elegidos[0].id, "cerca")
})

test("no se le paga WhatsApp a quien no puede tomar el paseo, ni a números malos", () => {
  const sinManual = p({ manual_ok: false })
  const rebota = p({ wa_rebotes: 2 })
  const sinTel = p({ phone: null })
  const telCorto = p({ phone: "12345" })
  const baneado = p({ banned: true })
  const bueno = p({ id: "bueno" })
  const elegidos = elegirWhatsApp([sinManual, rebota, sinTel, telCorto, baneado, bueno], ctx(), 10)
  assert.deepEqual(elegidos.map((x) => x.id), ["bueno"])
})

test("dos cuentas con el mismo teléfono reciben UN mensaje", () => {
  const a = p({ phone: "+52 614 111 2233" })
  const b = p({ phone: "526141112233" })
  assert.equal(elegirWhatsApp([a, b], ctx(), 10).length, 1)
})

test("a quien le llegó el aviso gratis no se le paga WhatsApp", () => {
  const conPush = p({ id: "push" })
  const otro = p({ id: "otro" })
  const c = ctx({ yaAvisados: { push: new Set(["push"]), whatsapp: new Set(), correo: new Set() } })
  assert.deepEqual(elegirWhatsApp([conPush, otro], c, 10).map((x) => x.id), ["otro"])
})

test("la segunda ola no repite a nadie de la primera (ni por cuenta ni por teléfono)", () => {
  const todos = Array.from({ length: 20 }, () => p())
  const ola1 = elegirWhatsApp(todos, ctx(), 5)
  const c2 = ctx({ yaAvisados: { push: new Set(), whatsapp: new Set(ola1.map((x) => x.id)), correo: new Set() } })
  const ola2 = elegirWhatsApp(todos, c2, 10)
  const ids1 = new Set(ola1.map((x) => x.id))
  assert.equal(ola2.length, 10)
  assert.ok(ola2.every((x) => !ids1.has(x.id)))

  // Y si alguien cambió de cuenta pero conserva el teléfono, tampoco
  const tels = new Set(ola1.map((x) => String(x.phone).replace(/\D/g, "").slice(-10)))
  const clon = p({ phone: ola1[0].phone })
  assert.ok(!elegirWhatsApp([clon], ctx(), 10, tels).length)
})

test("el correo lleva tope y no repite a quien ya se avisó por otro canal", () => {
  const todos = Array.from({ length: 40 }, () => p())
  const alcanzados = new Set(todos.slice(0, 5).map((x) => x.id))
  const correos = elegirCorreo(todos, ctx(), 15, alcanzados)
  assert.equal(correos.length, 15)
  assert.ok(correos.every((x) => !alcanzados.has(x.id)))
})

test("el aviso gratis va a TODOS los de la ciudad (incluso sin manual), una sola vez", () => {
  const sinManual = p({ manual_ok: false })
  const conManual = p()
  const yaRecibio = p({ id: "ya" })
  const c = ctx({ yaAvisados: { push: new Set(["ya"]), whatsapp: new Set(), correo: new Set() } })
  const ids = elegirPush([sinManual, conManual, yaRecibio], c).map((x) => x.id)
  assert.deepEqual(ids.sort(), [sinManual.id, conManual.id].sort())
})

test("cada paseador que activó el aviso gratis es un WhatsApp MENOS, no uno para otro", () => {
  const top = [p({ id: "t1" }), p({ id: "t2" })]
  const resto = Array.from({ length: 10 }, () => p())
  const c = ctx({
    tomados: { t1: 5, t2: 4 },
    yaAvisados: { push: new Set(["t1", "t2"]), whatsapp: new Set(), correo: new Set() },
  })
  const elegidos = elegirWhatsApp([...resto, ...top], c, 5, new Set(), new Set(["t1", "t2"]))
  assert.equal(elegidos.length, 3)
  assert.ok(elegidos.every((x) => x.id !== "t1" && x.id !== "t2"))
})

test("si los 5 mejores ya se enteraron gratis, no se paga ningún WhatsApp", () => {
  const top = Array.from({ length: 5 }, (_, i) => p({ id: `top${i}` }))
  const resto = Array.from({ length: 10 }, () => p())
  const tomados = Object.fromEntries(top.map((x) => [x.id, 3]))
  const gratis = new Set(top.map((x) => x.id))
  const c = ctx({ tomados, yaAvisados: { push: gratis, whatsapp: new Set(), correo: new Set() } })
  assert.equal(elegirWhatsApp([...resto, ...top], c, 5, new Set(), gratis).length, 0)
})
