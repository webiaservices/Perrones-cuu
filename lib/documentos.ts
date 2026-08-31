import { createClient } from "@/lib/supabase/server"
import { CLIENT_CONTRACT, WALKER_CONTRACT, CONTRACT_VERSION } from "@/lib/contract-text"

/**
 * El contrato vigente, leído de la base.
 *
 * Antes vivía solo en lib/contract-text.ts y cambiarle una coma exigía
 * desplegar. Ahora Endy lo edita desde su panel y se publica como una versión
 * nueva.
 *
 * REGLA QUE NO SE ROMPE: una versión ya publicada nunca se reescribe. Quien
 * aceptó la v2 aceptó ESE texto, y eso es lo que respalda legalmente. Publicar
 * cambios significa crear v3, no editar v2.
 *
 * Si la tabla no existe todavía, se usa el texto del código.
 */

export type Documento = { version: string; texto: string }

export async function documentoVigente(tipo: "cliente" | "paseador"): Promise<Documento> {
  const respaldo: Documento = {
    version: CONTRACT_VERSION,
    texto: tipo === "cliente" ? CLIENT_CONTRACT : WALKER_CONTRACT,
  }
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("documentos")
      .select("version, texto")
      .eq("tipo", tipo)
      .eq("vigente", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return respaldo
    return { version: data.version as string, texto: data.texto as string }
  } catch {
    return respaldo
  }
}
