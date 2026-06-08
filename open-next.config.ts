// Config para OpenNext.js + Cloudflare Workers
// Más info: https://opennext.js.org/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare"

export default defineCloudflareConfig({
  // Default: in-memory queue. Para producción con tráfico real,
  // se puede cambiar a Durable Objects.
})
