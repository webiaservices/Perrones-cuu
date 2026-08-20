import {
  MANUAL_SECCIONES,
  MANUAL_SUBTITULO,
  MANUAL_TITULO,
} from "@/lib/manual-paseadores"

/**
 * El manual renderizado. Se usa igual en /manual (público, el enlace que va
 * en los WhatsApp a paseadores) y dentro del panel del paseador.
 *
 * Las clases `print:` son las que hacen que "Descargar PDF" salga limpio:
 * el navegador imprime a PDF y hay que quitarle fondos y sombras.
 */
export function ManualPaseadores() {
  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8 text-center">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {MANUAL_TITULO}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{MANUAL_SUBTITULO}</p>
      </header>

      <div className="space-y-8">
        {MANUAL_SECCIONES.map((sec) => (
          <section
            key={sec.titulo}
            className="rounded-3xl border border-border bg-background p-6 shadow-sm print:border-0 print:p-0 print:shadow-none"
          >
            <h2 className="font-display text-xl font-extrabold tracking-tight text-primary print:text-foreground">
              {sec.titulo}
            </h2>

            {sec.intro?.map((p) => (
              <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground print:text-foreground">
                {p}
              </p>
            ))}

            {sec.puntos && (
              <ul className="mt-3 space-y-2">
                {sec.puntos.map((p) => (
                  <li key={p} className="flex gap-2.5 text-sm leading-relaxed">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            )}

            {sec.subsecciones?.map((sub) => (
              <div key={sub.titulo} className="mt-5">
                <h3 className="font-bold">{sub.titulo}</h3>
                <ul className="mt-2 space-y-2">
                  {sub.puntos.map((p) => (
                    <li key={p} className="flex gap-2.5 text-sm leading-relaxed">
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {sec.tabla && (
              /* overflow-x-auto: en celular la tabla se desborda si no */
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[26rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      {sec.tabla.encabezados.map((h) => (
                        <th key={h} className="pb-2 pr-4 font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sec.tabla.filas.map((fila) => (
                      <tr key={fila.join("|")} className="border-b border-border/50">
                        {fila.map((celda, i) => (
                          <td key={celda + i} className={`py-2.5 pr-4 ${i === 0 ? "font-medium" : "text-muted-foreground print:text-foreground"}`}>
                            {celda}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </article>
  )
}
