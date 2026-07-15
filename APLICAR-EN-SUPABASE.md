# Cómo aplicar los candados de seguridad en Supabase

Estos 3 cambios NO se despliegan solos con el push (van en la base de datos).
El código ya está preparado para ellos. Aplícalos **cuando el deploy de Vercel
esté READY** (no antes, o se rompe el registro de reservas viejo).

## Pasos (2 minutos)
1. Entra a https://supabase.com/dashboard → tu proyecto de Perrones.
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abre el archivo `APLICAR-EN-SUPABASE.sql` (está en esta misma carpeta),
   copia TODO y pégalo.
4. Dale **Run** (o Cmd+Enter). Debe decir "Success. No rows returned".

## Qué hacen
- **0014** — cierra que un cliente se cambie su propio precio a $1 desde la
  consola del navegador, y hace que los botones del paseador (En curso /
  Completada / Soltar) sí guarden.
- **0015** — cierra que alguien se cree cuenta de admin con `?role=admin`.
- **0016** — permite borrar un perro que ya tuvo paseos (antes tronaba).

## Importante (ventana entre deploy y este SQL)
Entre que sale el deploy y corres esto, los botones **En curso / Completada /
Soltar** del paseador van a decir "No se pudo actualizar, avísale al admin".
Eso es normal: ese flujo YA estaba roto en silencio antes (nunca guardaba nada).
En cuanto corras el SQL, empiezan a funcionar de verdad. Por eso: **corre el
SQL apenas veas el deploy READY.**

## Después de aplicar: revisa que no haya admins falsos
En el SQL Editor corre esto y confirma que reconoces TODAS las cuentas admin:

    select id, full_name, role, created_at from public.profiles where role = 'admin';

Si aparece alguna que no reconoces, avísame.
