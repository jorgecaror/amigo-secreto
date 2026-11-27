# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto
Servicio público de **amigo secreto** online. El organizador (que también participa) ingresa una lista de personas,
se sortea quién le regala a quién y se genera **un link + un código por participante**. Cada persona abre su link,
ingresa su código y ve solo a quién le toca. Es un sitio estático para GitHub Pages, sin build. Opcionalmente, los
usuarios pueden crear un **perfil** (Supabase, link mágico por correo) para guardar listas y **enviar a cada persona su
link + código por correo** (Edge Function `enviar-correo` con SMTP de Gmail, D20).

La solicitud original y los requerimientos están en `docs/REQUERIMIENTOS.md`. Las decisiones de diseño (D1–D22, con
alternativas descartadas y amenazas aceptadas) están en `docs/DECISIONES.md`, y el avance en `docs/TAREAS.md` (resumen de lo hecho y lo pendiente en `docs/ESTADO.md`).
**Al tomar una decisión nueva, agrégala como D23, D24… en `DECISIONES.md`, marca el avance en `TAREAS.md` y actualiza `ESTADO.md`.**
Toda la documentación y la UI están en español.

## Comandos
```bash
npm install                      # solo instala PGlite (para test:rls)
npm test                         # test:sorteo + test:correo + test:rls
npm run test:sorteo              # lógica: miles de sorteos, códigos, cifrado AES-GCM (v3 y compatibilidad v2)
npm run test:correo              # Edge Function: validación anti-phishing, plantillas, supabase/correos al día
npm run test:funcion             # Edge Function corriendo en Deno con Supabase y SMTP simulados (requiere Deno)
npm run correos                  # regenera supabase/correos/*.html (plantillas de login) desde correo.mjs
node supabase/correos/aplicar.mjs   # aplica esas plantillas en Supabase por la Management API (SUPABASE_ACCESS_TOKEN)
npm run correos:vista            # vistas previas + capturas de los 3 correos en una carpeta temporal
npm run test:rls                 # supabase/schema.sql en Postgres 16 real (PGlite) con auth emulado
npm run test:e2e                 # navegador headless vía CDP (Edge por defecto; otra ruta: NAVEGADOR=...)
```
El E2E levanta `test/servidor.mjs` en `127.0.0.1:8099`, que imita GitHub Pages (sirve en `/amigo-secreto/` y usa
`404.html`), y Edge con depuración en el puerto 9334. Si falla de inmediato, revisa que no haya una corrida anterior
ocupando esos puertos. Para probar a mano: `node -e "import('./test/servidor.mjs').then(m=>m.iniciarServidor(8099))"`
y abrir `http://127.0.0.1:8099/amigo-secreto/`.

## Arquitectura
- `sorteo.js`: lógica pura sin DOM (UMD: `window.Sorteo` en el navegador, `require` en Node). Es la única fuente
  de la lógica.
  - `sortear(nombres, exclusiones)` → `[{da, recibe}]` o `null`. Primero muestreo por rechazo (uniforme) y, como
    respaldo, backtracking. Usa `crypto.getRandomValues`.
  - Cifrado (D10, D19): `codificar(datos, codigo, {relleno})` / `decodificar(hash, codigo)` son **async**
    (PBKDF2-SHA256 600k → AES-256-GCM). Se genera v3: `3.<b64url nombre>.<b64url salt|iv|ct>`, AAD = `3.<b64url
    nombre>`, texto binario con el receptor rellenado a `rellenoPara(nombres)`. Se sigue leyendo v2
    (`2.<b64url JSON {v,d,i}>.<…>`). Cambiar el formato rompe los links ya enviados: subir la versión y mantener
    la lectura de las anteriores.
- `app.js`: toda la UI del sorteo. **Solo** un hash `#3.…` o `#2.…` activa la vista participante; cualquier otro hash, o
  `?code=` del login, muestra la vista organizador.
  - Organizador: formulario, sorteo con progreso, links y códigos por fila, último sorteo en `localStorage`.
  - Participante: código, revelar, freno tras 5 fallos. Agrega una CSP `connect-src 'none'` en tiempo de
    ejecución y oculta `.solo-organizador`.
  - Expone `window.AmigoSecretoApp` (`vista`, `obtenerFormulario()`, `cargarFormulario(lista)`, `limpiar()`: borra el
    último sorteo y deja el formulario vacío; lo usa "Salir", D22) y emite el evento
    `sorteo-realizado` con **solo** `{participantes: n}`.
  - Correo (D20): cada fila tiene un campo de correo (se guarda solo en `localStorage`) y "✉️ Correo". Llama a
    `window.AmigoSecretoCorreo.enviar([{email,url,codigo}])`, que define `perfil.js`. Los controles solo se ven con
    `body.con-correo`. Junto con lo anterior, es todo el contrato con `perfil.js`.
- `perfil.js`: perfiles opcionales. No hace nada si `config.js` está vacío o si la vista es participante. Carga
  `vendor/supabase.js` de forma perezosa (sesión guardada en `localStorage['amigo-secreto-auth']`, `?code=` o clic
  en login). Tablas: `listas`, `sorteos`, `envios_correo` (solo el cupo); RPC `eliminar_mi_cuenta`. Define
  `AmigoSecretoCorreo` (llama a `functions.invoke('enviar-correo')`; rechaza con `'sin-sesion'`).
- `supabase/functions/enviar-correo/`: `index.ts` (Deno: CORS, `auth.getUser`, cupo global con la service_role,
  cupo por usuario con el JWT, nodemailer a Gmail por el puerto 465) y `correo.mjs` (lógica pura: `validarEnvio`,
  `construirCorreo`, `plantillaLogin`; se prueba en Node). Se despliega aparte (`docs/SUPABASE-SETUP.md` §7).
- `supabase/schema.sql`: tablas, RLS, límites y triggers. Es idempotente. Cualquier cambio debe pasar
  `npm run test:rls`; si agregas una tabla, agrega su prueba de aislamiento ahí.
- `index.html`: marcado, metadatos SEO y JSON-LD. El FAQ visible (`#faq`) y el JSON-LD `FAQPage` deben ser
  **idénticos** (lo verifica el E2E). `estilos.css` se comparte con `privacidad.html` y `404.html`.
- La URL pública es `https://jorgecaror.github.io/amigo-secreto/` (repo `github.com/jorgecaror/amigo-secreto`,
  Pages desde `main` raíz). Aparece en index, privacidad, robots y sitemap: si cambia (ej. dominio propio), cambiarla
  en los cuatro y en las Redirect URLs de Supabase. Publicar = commit + `git push` a `main`.

## Invariantes que no se deben romper
- La vista organizador **nunca** muestra receptores. Resultados, links y códigos **nunca** salen del navegador
  (ni a Supabase ni a ningún lado). En claro solo puede ir el nombre de quien regala. **Única excepción (D20):**
  el envío por correo que el organizador con sesión pide con un clic. Va solo a la función `enviar-correo` y no
  se guarda. Nunca a `rest/v1` (lo verifica el E2E).
- La vista participante no hace llamadas de red ni carga Supabase.
- Reglas del sorteo: nadie se regala a sí mismo, cada persona recibe exactamente una vez, exclusiones en ambos
  sentidos, entre 3 y 100 participantes (mismo límite en `sorteo.js` y en `schema.sql`).
- Sin scripts inline ni CDNs: la CSP es `script-src 'self'`. Las librerías van en `vendor/` con versión y SHA-256.
  `perfil.js` fija en tiempo de ejecución `connect-src` al proyecto exacto de `config.js`, o `'none'` sin config.
- El receptor se rellena al nombre más largo del sorteo (`rellenoPara`; en v2 era `BYTES_RECEPTOR`): todos los links
  de un sorteo tienen la parte cifrada del mismo largo (solo varía por el nombre visible de quien regala), así que el
  largo no depende del receptor.
- "Link + código" nunca se envía por una URL web (`wa.me`): se usa `navigator.share` o el portapapeles. Detalle en `docs/SEGURIDAD.md`.
  La única red permitida es `connect-src https://*.supabase.co`.
- Texto de usuario siempre con `textContent`. `localStorage` siempre en try/catch.
- `config.js` solo lleva la clave pública (anon/publishable). Nunca la `service_role`.
- No cambiar `document.title` en la vista organizador: es el título SEO.
