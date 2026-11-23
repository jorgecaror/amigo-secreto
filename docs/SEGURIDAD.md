# Revisión de seguridad — 2026-11-23

**Alcance:** todo el proyecto (`index.html`, `privacidad.html`, `404.html`, `sorteo.js`, `app.js`, `perfil.js`,
`config.js`, `supabase/schema.sql`, `test/servidor.mjs`, `vendor/`).

**Método:** el skill `/security-review` de Claude Code necesita un remoto `origin` para comparar cambios, y el
repo aún no lo tiene. Por eso la revisión la hizo un agente revisor independiente, que leyó el código sin las
conclusiones del autor. Cada hallazgo se verificó y se corrigió con una prueba automática que lo cubre.

**Resultado:** **0 altos · 2 medios · 3 bajos → los 5 corregidos.** No se encontró XSS, mal uso del cifrado
ni bypass de RLS.

## Hallazgos y correcciones

| # | Sev. | Hallazgo | Corrección | Prueba |
|---|------|----------|------------|--------|
| H1 | Media | El **largo del cifrado revelaba el largo del nombre del receptor** (`sorteo.js`). Con un link filtrado sin código se podía acotar a quién le tocó. | Relleno a tamaño fijo: `JSON(r) + p` = 512 bytes. Todos los links de un sorteo miden lo mismo. | `test:sorteo` (receptores de 2 a 60 caracteres, emojis y escapes → mismo largo) |
| H2 | Media | **"Link + código" por `wa.me`** ponía link y código en una URL que llega a servidores de Meta y queda en el historial del navegador (`app.js`). | Se comparte con `navigator.share` (menú nativo). Si no existe: "Link + código" **se copia** (nunca `wa.me`) y "Solo link" sí usa `wa.me` (sin código no sirve). D17. | `test:e2e` (4b) |
| H3 | Baja | `connect-src https://*.supabase.co` permitía enviar datos a **cualquier** proyecto Supabase si algún día se inyectara código. | `perfil.js` agrega en tiempo de ejecución una CSP `connect-src <proyecto exacto>`, o `'none'` si no hay config. | `test:e2e` (4 y 5) |
| H4 | Baja | El trigger `limitar_listas` (`security definer`, contaba por `new.user_id`) corría antes de RLS y **revelaba si otro usuario tenía 50 listas**. Además permitía pasarse del límite por carrera. | `security invoker`, cuenta por `auth.uid()` y usa `pg_advisory_xact_lock`. | `test:rls` ("El límite no revela datos de otros usuarios") |
| H5 | Baja | Los links de participante **heredaban la query del organizador** (`?utm…`, `?code=` del login). | `base = location.href.split(/[?#]/)[0]` | `test:e2e` (4b) |

## Verificado como correcto (resumen del revisor y de las pruebas)
- **XSS:** todo dato de usuario o descifrado entra con `textContent`, `value` o `setAttribute` sin URL. Hay CSP
  `script-src 'self'` y no hay JS inline.
- **Aleatoriedad:** `crypto.getRandomValues` con rechazo, sin sesgo de módulo.
- **Cifrado:** salt e IV nuevos por link, clave nueva y no extraíble, PBKDF2-SHA256 600k → AES-256-GCM, la parte
  pública como AAD (alterar el nombre o las iteraciones invalida el link) e iteraciones acotadas a
  [100k, 5M] (sin DoS ni degradación).
- **Vista participante:** no carga Supabase y tiene `connect-src 'none'`. El `#hash` no se envía a ningún
  servidor y no hay referrer.
- **RLS:** select/insert/update/delete propios, `anon` sin permisos, historial no editable, la FK de `sorteos`
  validada contra el dueño, dueño inmutable, funciones de trigger no invocables, `eliminar_mi_cuenta` con
  `search_path = ''`.
- **Auth:** PKCE; la redirección queda en el mismo origen y ruta, y la URL se limpia después.
- **Minimización:** a Supabase solo llegan listas y `{lista_id, participantes}`. El E2E comprueba que no viaja
  ningún link ni código.
- **Cadena de suministro:** `vendor/supabase.js` coincide byte a byte (SHA-256 `8596965f…01e7`) con
  `dist/umd/supabase.js` del paquete npm `@supabase/supabase-js@2.45.4`.

## Riesgos aceptados (no son bugs; ver D10)
- El organizador ve todos los códigos y quedan en el `localStorage` de su navegador.
- Si se reenvía completo el mensaje "Link + código", quien lo reciba puede ver el resultado.
- Ataque offline a un link filtrado: ~30 bits × PBKDF2 600k, días o semanas de GPU por link.
- "Solo link" por `wa.me` (sin `navigator.share`) envía el link sin código a Meta. Sin el código no se puede
  descifrar y, con H1 corregido, tampoco revela el largo del nombre.

## Pendiente al publicar
- Crear el remoto en GitHub para poder usar `/security-review` en los próximos cambios.
- En Supabase: Redirect URLs exactas, SMTP propio y rate limits (`docs/SUPABASE-SETUP.md`).
