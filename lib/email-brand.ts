import { BRAND } from "./constants"

/**
 * Base de las URLs que van dentro de los correos. Tienen que ser absolutas:
 * un `/icon-192.png` a secas no se ve en Gmail.
 */
export const EMAIL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://perronescuu.com"

/** Logo redondo de Perrones, servido desde public/. */
export const EMAIL_LOGO_URL = `${EMAIL_SITE_URL}/icon-192.png`

/**
 * El <img> del logo, listo para pegar dentro del encabezado turquesa.
 * Lleva width/height como atributos además del style porque Outlook ignora
 * el CSS de tamaño; sin ellos sale el logo a tamaño completo.
 */
export const EMAIL_LOGO_IMG = `<img src="${EMAIL_LOGO_URL}" width="64" height="64" alt="${BRAND.name}" style="display:block;margin:0 auto 10px;width:64px;height:64px;border:0;border-radius:50%;" />`

/**
 * Encabezado turquesa con el logo. Antes cada ruta de notify-* tenía su propia
 * copia de este bloque, así que agregar el logo significaba tocar 8 archivos.
 *
 * El <img> lleva width/height como atributos además del style porque Outlook
 * ignora el CSS de tamaño; sin ellos sale el logo a tamaño completo.
 */
export function emailHeader(title: string) {
  return `
      <div style="background:#3DCABD;padding:24px;text-align:center;color:#fff;">
        <img src="${EMAIL_LOGO_URL}" width="64" height="64" alt="${BRAND.name}"
             style="display:block;margin:0 auto 10px;width:64px;height:64px;border:0;border-radius:50%;" />
        <p style="margin:0;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${BRAND.name}</p>
        <h1 style="margin:8px 0 0;font-size:24px;font-weight:800;">${title}</h1>
      </div>`
}

/**
 * Bloque de contacto del cliente para los correos que van al ADMIN.
 * No se usa en los correos a paseadores: el contrato del paseador (punto 3)
 * prohíbe el contacto directo con clientes.
 */
export function bloqueContactoCliente(nombre: string | null, telefono: string | null, email: string | null) {
  if (!telefono && !email) return ""
  const tel = telefono
    ? `<p style="margin:4px 0;font-size:15px;"><b>Teléfono:</b> <a href="tel:${telefono}" style="color:#0d3333;">${telefono}</a></p>`
    : ""
  const mail = email
    ? `<p style="margin:4px 0;font-size:15px;"><b>Correo:</b> <a href="mailto:${email}" style="color:#0d3333;">${email}</a></p>`
    : ""
  return `
    <div style="background:#f0fafa;border-radius:16px;padding:16px 18px;margin-bottom:20px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#5a8080;text-transform:uppercase;letter-spacing:0.04em;">Contacto del cliente</p>
      ${nombre ? `<p style="margin:4px 0;font-size:15px;"><b>Nombre:</b> ${nombre}</p>` : ""}
      ${tel}
      ${mail}
    </div>`
}
