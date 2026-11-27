# Estado del proyecto — 2026-11-27

**Sitio publicado:** <https://jorgecaror.github.io/amigo-secreto/>
**Repositorio:** <https://github.com/jorgecaror/amigo-secreto> (rama `main`, GitHub Pages desde la raíz)
**Base de datos:** Supabase, proyecto `afrsrmxkgfztevosnjkw` (perfiles, listas y cupo de correos; nunca resultados)

Este archivo es el resumen. El detalle de cada tarea está en [`TAREAS.md`](TAREAS.md) y las decisiones en
[`DECISIONES.md`](DECISIONES.md) (D1–D22).

## ✅ Realizado

| Área | Qué se hizo | Dónde |
|------|-------------|-------|
| Requerimientos y decisiones | Requerimientos RF1–RF16 y decisiones D1–D18 con alternativas descartadas | `REQUERIMIENTOS.md`, `DECISIONES.md` |
| Sorteo | Nadie se regala a sí mismo, cada persona recibe una vez, exclusiones, 3–100 participantes, sorteo uniforme con `crypto` | `sorteo.js` |
| Privacidad del resultado | Un link y un código por persona, cifrado AES-256-GCM + PBKDF2 600k; el organizador no ve los resultados; link de largo fijo | `sorteo.js`, `app.js`, D10, D17 |
| Vista participante | Pide el código, revela el resultado, frena tras 5 intentos fallidos, botón "Ocultar"; no hace conexiones de red | `app.js` |
| Compartir | Menú nativo del celular; "Link + código" nunca pasa por `wa.me` | `app.js`, D17 |
| Seguridad de la página | CSP estricta sin scripts externos, conexión fijada al proyecto Supabase, no-referrer | `index.html`, `perfil.js`, D11, D16 |
| SEO | Título y descripción, Open Graph, JSON-LD (WebApplication + FAQ), contenido indexable, sitemap, manifest, íconos, 404 | `index.html`, `SEO.md`, D15 |
| Privacidad legal | Página de privacidad (Ley 19.628 / 21.719) | `privacidad.html` |
| Perfiles | Login por link mágico (PKCE); guardar, cargar y borrar listas; historial (solo fecha y cantidad); borrar datos; eliminar cuenta | `perfil.js`, D12–D14 |
| Base de datos | Tablas con RLS, límites (50 listas, historial de 200), triggers, `eliminar_mi_cuenta()` | `supabase/schema.sql` |
| Supabase real | Proyecto creado, schema ejecutado, SMTP propio, `config.js` con la clave anon. Verificado: `anon` sin acceso, registro habilitado, **login real probado** | `SUPABASE-SETUP.md` |
| Revisión de seguridad | Revisión independiente: 0 altos, 2 medios, 3 bajos → los 5 corregidos y con prueba | `SEGURIDAD.md`, D17 |
| Pruebas | `npm test` (lógica + RLS en Postgres 16) y `npm run test:e2e` (Edge headless): todo OK | `test/` |
| URLs de Supabase | Site URL y Redirect URLs del sitio publicado; dominios ajenos rechazados. Aviso claro si el link de login venció | `perfil.js` |
| Link corto (v3) | De ~970 a ~120–220 caracteres, sin servidor; los links v2 ya enviados siguen funcionando | `sorteo.js`, D19 |
| Envío por correo | **Funcionando en producción.** Botón al resultado + código, enviado por el sitio (Edge Function + Gmail) solo con sesión y con clic; cupos por usuario y global; WhatsApp igual que antes | `supabase/functions/enviar-correo/`, `app.js`, `perfil.js`, D20 |
| Diseño de correos | **Aplicado en producción.** Un diseño para el correo del participante y los de login (Magic Link, Confirm signup), claro y oscuro | `supabase/correos/`, D21 |
| Cerrar sesión | "Salir" avisa si hay un sorteo en pantalla, lo borra del navegador y vuelve al formulario vacío | `app.js`, `perfil.js`, D22 |
| Google Search Console | Propiedad verificada (archivo `googleaf2cb88067bc384d.html`, no borrar) y sitemap enviado | `SEO.md` |
| Publicación | Commits en `main`, GitHub Pages activo, verificado en vivo (páginas, 404, sorteo, revelación, CSP, consola limpia) | D18 |

## ⏳ Pendiente

### Lo hace el usuario
1. **Probar desde el celular:** sorteo pequeño, compartir un link por WhatsApp, abrirlo y revelarlo con el código.
2. **Completar el checklist manual de perfiles** (`SUPABASE-SETUP.md` §6):
   - Guardar una lista y recargar.
   - Revisar el historial.
   - Comprobar que una segunda cuenta no ve las listas.
   - Eliminar una cuenta.

### Se puede hacer conmigo
- Usar `/security-review` en los próximos cambios (ya existe el remoto `origin`).

### Ideas futuras (no comprometidas)
- Proveedor de correo transaccional con dominio propio, en vez de Gmail (D20: copia en "Enviados" y ~500 correos al día).
- Lista de deseos por participante.
- Exportar e importar un sorteo a un archivo (respaldo fuera del navegador).
- Dominio propio: hay que actualizar la URL en index, privacidad, robots y sitemap y en las Redirect URLs de Supabase.

## Notas a tener presentes
- El correo pasa por la cuenta Gmail del SMTP: su carpeta "Enviados" guarda link + código de cada envío (D20).
- El correo de los commits (configurado solo en este repo) es **público** en el historial de GitHub.
- Los proyectos gratis de Supabase se pausan tras 7 días sin actividad; se reactivan desde el panel.
- Publicar cambios = commit + `git push` a `main`; Pages se actualiza en 1–2 minutos.
