# Tareas

## Fase 1 — Definición (2026-11-23)
- [x] Levantar requerimientos → `REQUERIMIENTOS.md`
- [x] Resolver decisiones D1–D9 → `DECISIONES.md`
- [x] Crear estructura de carpeta + `CLAUDE.md` (/init)

## Fase 2 — Construcción (2026-11-23)
- [x] `sorteo.js`: validación de nombres, sorteo con exclusiones, codificar/decodificar link
- [x] `test/verificar-sorteo.js`: 10.700 sorteos, casos imposibles, uniformidad, codificación → **OK**
- [x] `index.html`: vista organizador (participantes, exclusiones, evento, links, WhatsApp, localStorage)
- [x] `index.html`: vista participante (confirmar "¿Eres X?", revelar, datos del evento, link inválido)
- [x] Prueba E2E en Edge headless: 5 personas + exclusión → asignación válida, organizador sin ver receptores

## Fase 2b — Seguridad link + código (2026-11-23) — D10, D11
- [x] `sorteo.js`: `generarCodigo`, `normalizarCodigo`, cifrado AES-256-GCM + PBKDF2 (reemplaza XOR)
- [x] `app.js`: UI movida fuera del HTML; sorteo async con progreso; código por fila; botones Solo link / Link + código
- [x] Participante: campo de código, error, espera tras 5 fallos, "Ocultar" borra el resultado
- [x] `index.html`: CSP estricta + no-referrer
- [x] Tests Node: código correcto/incorrecto, nombre alterado (AAD), sin fugas en claro, iteraciones fuera de rango → **OK**
- [x] E2E Edge vía DevTools: sorteo de 5 con exclusión válido (~1,3 s), código malo rechazado, bueno revela,
      bloqueo tras 5 fallos, link inválido, 0 errores de consola/CSP

## Fase 4 — SEO (2026-11-23) — D15
- [x] Title/description, canonical, Open Graph + `img/og-image.png`, JSON-LD WebApplication + FAQPage
- [x] Contenido indexable (cómo funciona, beneficios, FAQ), `robots.txt`, `sitemap.xml`, manifest, íconos, `404.html`
- [x] `privacidad.html`
- [x] Bug corregido: `app.js` sobrescribía el `<title>` SEO
- [x] URL pública `jorgecaror.github.io/amigo-secreto` en index, privacidad, robots y sitemap
- [ ] Dar de alta en Google Search Console y enviar el sitemap (`docs/SEO.md`)

## Fase 5 — Perfiles con Supabase (2026-11-23) — D12, D13, D14, D16
- [x] `supabase/schema.sql` (RLS, límites, triggers, `eliminar_mi_cuenta`) + `npm run test:rls` en Postgres 16 (PGlite) → **OK**
- [x] `perfil.js` (link mágico PKCE, mis listas, guardar/cargar/borrar, historial, borrar datos, eliminar cuenta)
- [x] `vendor/supabase.js` 2.45.4 con SHA-256; carga perezosa; CSP `connect-src *.supabase.co`
- [x] `npm run test:e2e`: SEO, 0 requests sin cuenta, participante sin red, CSP, login PKCE, flujo de perfil simulado → **OK**
- [x] `docs/SUPABASE-SETUP.md`
- [x] **Usuario:** crear proyecto Supabase, ejecutar `schema.sql`, configurar Auth + SMTP, completar `config.js`
- [x] Verificación automática contra el proyecto real (2026-11-23): clave anon (no service_role), tablas creadas,
      `anon` sin acceso a tablas ni RPC, funciones de trigger no expuestas, CSP fijada al proyecto, `supabase.js` y OTP llegan
- [x] Hallazgo: `disable_signup: true` bloqueaba el login de usuarios nuevos → guía corregida (paso 3) y mensaje claro en `perfil.js`
- [x] E2E independiente del proyecto real (`servidor.mjs` con `sinConfig`)
- [x] Usuario: activar "Allow new users to sign up" (verificado `disable_signup: false`)
- [x] Login real por link mágico probado por el usuario → funciona
- [ ] Resto del checklist manual (guardar/cargar lista, historial, aislamiento entre cuentas, eliminar cuenta)

## Fase 6 — Revisión de seguridad (2026-11-23)
- [x] `git init` local
- [x] Revisión independiente (el skill `/security-review` requiere un remoto `origin`; se hizo con un agente revisor)
- [x] 0 altos · 2 medios · 3 bajos → 5 corregidos con pruebas (`docs/SEGURIDAD.md`, D17)
- [x] SHA-256 de `vendor/supabase.js` verificado contra el paquete npm oficial

## Fase 3 — Publicación (2026-11-23) — D18
- [x] Identidad de git solo en este repo + primer commit
- [x] Repo `github.com/jorgecaror/amigo-secreto` (creado por el usuario) + push a `main`
- [x] GitHub Pages activo (rama `main`, raíz) → `https://jorgecaror.github.io/amigo-secreto/`
- [x] Verificado en vivo: páginas 200, 404 propio, canonical real, SHA de `supabase.js` intacto; sorteo de 4 y revelación
      con código en Edge; CSP fijada al proyecto; participante sin Supabase; consola limpia
- [x] Supabase: Site URL y Redirect URLs con la URL pública. Verificado: publicado, `index.html` y local aceptados; dominio
      ajeno rechazado → vuelve a la Site URL
- [x] Link de login vencido (`#error=otp_expired`): antes no mostraba aviso; ahora avisa, limpia la URL y no carga Supabase (E2E 5c)
- [ ] Probar login desde el sitio publicado
- [ ] Probar un link real desde el celular (abrir, revelar, WhatsApp)

## Fase 7 — Correo, link corto y correos de login (2026-11-27) — D19, D20, D21
- [x] Link v3 compacto (`sorteo.js`): relleno al nombre más largo, texto binario, iteraciones implícitas →
      ~120–220 caracteres (antes ~970). Los links v2 se siguen leyendo (test + E2E)
- [x] Edge Function `supabase/functions/enviar-correo/` (`index.ts` + `correo.mjs`): sesión real, solo links del
      sitio, nombre tomado del link, cupo por usuario y global, Gmail por el puerto 465, sin logs de datos
- [x] `schema.sql`: tabla `envios_correo` (200 por usuario en 24 h, sin fechas falsas, borrado a los 30 días) + `test:rls`
- [x] UI: correo por fila (solo en `localStorage`), "✉️ Correo" y "Enviar a todos" en lotes de 10, estados por fila;
      sin sesión pide login; contrato `window.AmigoSecretoCorreo` en `perfil.js`
- [x] Diseño único de correos (participante + Magic Link + Confirm signup), `supabase/correos/*.html` generados,
      vistas previas en claro/oscuro (`npm run correos:vista`)
- [x] `test:correo` (anti-phishing, inyección de cabeceras, escape HTML, plantillas al día), `test:funcion` (la función
      en Deno con Supabase y SMTP simulados) y E2E (sin sesión, con
      sesión simulada, nada a `rest/v1`) → **OK**
- [x] Docs: D19–D21, SEGURIDAD, CLAUDE.md, privacidad, SUPABASE-SETUP §7
- [x] Usuario: `schema.sql` ejecutado, contraseña de aplicación de Gmail, secretos y función desplegada. Verificado (2026-11-27):
      CORS solo para github.io (204/403), clave anon rechazada (401), tabla `envios_correo` creada y sin acceso anon
- [x] Usuario: plantillas de `supabase/correos/` pegadas en Authentication → Emails
- [x] Hallazgo en la prueba real: `42501` al leer el cupo global → el proyecto no da permisos por defecto a `service_role`;
      `schema.sql` ahora hace `grant select on envios_correo to service_role` y `test:rls` lo cubre (sin permisos por defecto)
- [ ] Prueba real: sorteo de 3 con correos propios (llega, el botón abre, el código revela) y login con la plantilla nueva

## Ideas futuras (no comprometidas)
- [ ] Proveedor de correo transaccional con dominio propio (evita la copia en "Enviados" de Gmail y su límite diario)
- [ ] Lista de deseos por participante
- [ ] Exportar/importar el sorteo a un archivo (respaldo fuera del navegador)
