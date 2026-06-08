export const BRAND = {
  name: "Perrones Cuu",
  tagline: "Perros felices, dueños tranquilos.",
  city: "Ciudad Chihuahua, Chih.",
  whatsapp: "526145948513",
  whatsappLink: "https://wa.me/526145948513?text=Hola%20Perrones",
  social: {
    instagram: "https://instagram.com/perronescuu",
    facebook: "https://www.facebook.com/people/perrones-cuu/61586452477627/",
    tiktok: "https://tiktok.com/@perronescuu",
  },
}

// Zonas de Ciudad Chihuahua
export const ZONES = [
  "Country Club",
  "Quintas del Sol",
  "San Felipe",
  "Cumbres",
  "Vistas Cerro Grande",
  "Campestre",
  "Las Águilas",
  "Saucito",
  "Centro",
  "Mirador",
]

export type DogSize = "pequeno" | "mediano" | "grande"

export const DOG_SIZES: { value: DogSize; label: string }[] = [
  { value: "pequeno", label: "Pequeño" },
  { value: "mediano", label: "Mediano" },
  { value: "grande", label: "Grande" },
]

export const WEEKDAYS = [
  { value: "lun", label: "Lunes" },
  { value: "mar", label: "Martes" },
  { value: "mie", label: "Miércoles" },
  { value: "jue", label: "Jueves" },
  { value: "vie", label: "Viernes" },
  { value: "sab", label: "Sábado" },
  { value: "dom", label: "Domingo" },
]

// Precio base por 1 perro. Cada perro adicional suma 60% del precio base.
export type Plan = {
  id: string
  name: string
  basePrice: number // precio para 1 perro
  walks: string
  walksCount: number // cuántos paseos genera realmente
  badge?: string
  /** Matriz de precios fija por número de perros */
  priceByDogs: { 1: number; 2: number; 3: number }
}

export const PLANS: Plan[] = [
  {
    id: "dia",
    name: "Paseo de 1 día",
    basePrice: 110,
    walks: "1 paseo único",
    walksCount: 1,
    priceByDogs: { 1: 110, 2: 160, 3: 200 },
  },
  {
    id: "3dias",
    name: "Paseo de 3 días",
    basePrice: 300,
    walks: "3 paseos / semana",
    walksCount: 3,
    badge: "Popular",
    priceByDogs: { 1: 300, 2: 450, 3: 600 },
  },
  {
    id: "semanal",
    name: "Paseo semanal",
    basePrice: 450,
    walks: "5 paseos / semana",
    walksCount: 5,
    badge: "Mejor precio",
    priceByDogs: { 1: 450, 2: 700, 3: 900 },
  },
  {
    id: "vip",
    name: "Paseo VIP",
    basePrice: 800,
    walks: "7 paseos · toda la semana",
    walksCount: 7,
    badge: "VIP",
    priceByDogs: { 1: 800, 2: 1100, 3: 1400 },
  },
]

export const PLAN_FEATURES = [
  "Paseador verificado",
  "Foto y reporte al terminar",
  "GPS en tiempo real",
  "Seguro para tu perrito incluido",
]

// El paseador recibe el 70% del total; la plataforma se queda con 30%.
export const WALKER_SHARE = 0.7
export const ADMIN_SHARE = 0.3

// Cuenta bancaria de la plataforma donde el cliente transfiere
export const PAYMENT_ACCOUNT = {
  bank: "NU",
  holder: "Javier Endika Seañez Pizarro",
  clabe: "638180000177552841",
  account: "5101 2582 4499 1973",
}

/**
 * Calcula el precio según número de perros usando la matriz del plan.
 * Si no hay plan, usa fórmula de fallback.
 */
export function priceForDogs(basePriceOrPlan: number | Plan, dogs: number) {
  // Si se pasa un plan completo, usa su matriz
  if (typeof basePriceOrPlan === "object" && basePriceOrPlan.priceByDogs) {
    const safeDogs = Math.min(Math.max(1, dogs), 3) as 1 | 2 | 3
    return basePriceOrPlan.priceByDogs[safeDogs]
  }
  // Fallback: cálculo legacy
  const basePrice = typeof basePriceOrPlan === "number" ? basePriceOrPlan : basePriceOrPlan.basePrice
  if (dogs <= 1) return basePrice
  return Math.round(basePrice * (1 + (dogs - 1) * 0.6))
}

export function walkerPayout(clientPrice: number) {
  return Math.round(clientPrice * WALKER_SHARE)
}

export const STATUS_LABELS: Record<string, string> = {
  buscando_paseador: "Buscando paseador",
  confirmada: "Confirmada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
  sin_asignar: "Sin asignar",
}

export const STATUS_STYLES: Record<string, string> = {
  buscando_paseador: "bg-accent/40 text-accent-foreground",
  confirmada: "bg-chart-3/20 text-foreground",
  en_curso: "bg-primary/15 text-primary",
  completada: "bg-muted text-muted-foreground",
  cancelada: "bg-muted text-muted-foreground line-through",
  sin_asignar: "bg-destructive/15 text-destructive",
}
