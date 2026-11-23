# Registro de decisiones

Formato: decisión · opción elegida · alternativas descartadas · motivo. Agregar nuevas al final (D9, D10, ...).

## D1 — Cómo se revela el resultado (2026-11-23)
- **Elegido:** link personal por participante. El resultado va codificado en el `#hash` del link.
- **Descartado:** página única + PIN (requiere base de datos); envío por correo (requiere backend).
- **Motivo:** cero infraestructura; el `#hash` no se envía al servidor, así que el hosting nunca ve resultados.

## D2 — El organizador participa (2026-11-23)
- **Elegido:** sí. La vista del organizador **nunca** muestra quién le toca a quién; solo nombres + links.

## D3 — Nivel de confianza (2026-11-23) — ⚠️ REEMPLAZADA por D10
- **Elegido:** "confiar + ocultar". El payload del link está ofuscado (XOR + base64url, ilegible a simple
  vista) y la página pide confirmar "¿Eres Ana?" antes de revelar.
- **Descartado:** código extra por persona que el organizador no conozca (necesita otro canal y backend).
- **Limitación aceptada:** un organizador que abra a propósito el link de otra persona podría verlo. Es
  ofuscación, no cifrado fuerte. Suficiente para grupos de amigos/familia.

## D4 — Hosting (2026-11-23)
- **Elegido:** HTML estático en GitHub Pages.
- **Descartado:** artifact de claude.ai (los invitados podrían necesitar cuenta), Netlify Drop.

## D5 — Extras (2026-11-23)
- **Elegido:** exclusiones bidireccionales (A↔B) y datos del evento (monto, fecha, lugar, mensaje).

## D6 — Link perdido (2026-11-23)
- **Elegido:** el navegador del organizador guarda el último sorteo en `localStorage` (nombres, exclusiones,
  evento y links) para volver a copiar un link. "Nuevo sorteo" pide confirmación y borra el anterior.
- **Nota:** si el organizador borra los datos del navegador o cambia de equipo, se pierde y hay que re-sortear.

## D7 — Algoritmo (2026-11-23)
- **Elegido:** muestreo por rechazo (permutación aleatoria uniforme hasta que cumpla todas las reglas,
  hasta 5.000 intentos → resultado uniforme entre todas las asignaciones válidas). Si no encuentra, búsqueda
  exhaustiva con backtracking (primero quien tiene menos opciones). Si el backtracking falla, el sorteo es
  imposible y se avisa al usuario.
- **Reglas:** nadie a sí mismo, receptores únicos, exclusiones respetadas.
- **Aleatoriedad:** `crypto.getRandomValues` con rechazo para evitar sesgo de módulo.

## D8 — Mínimo de participantes (2026-11-23)
- **Elegido:** 3. Con 2 personas cada una sabría a quién le tocó la otra.

## D9 — Estructura del código (2026-11-23)
- **Elegido:** `index.html` (UI, ambas vistas) + `sorteo.js` (lógica pura, UMD) para poder testear la lógica
  con Node sin duplicarla. Sin dependencias ni build.

## D10 — Seguridad: link + código por persona (2026-11-23) — reemplaza a D3
- **Motivo:** con D3 cualquiera que viera un link (reenviado, captura, o leyendo el código fuente) podía
  descifrar el resultado. Se pidió que ningún extraño pueda ver el resultado ni el evento de otro.
- **Elegido:** cifrado real con WebCrypto, sin librerías:
  - Código por persona de 6 caracteres (`XXX-XXX`, alfabeto sin ambiguos, 31⁶ ≈ 8,9·10⁸ ≈ 30 bits).
  - Clave = PBKDF2-SHA256(código, salt de 16 bytes, 600.000 iteraciones) → AES-256-GCM (IV de 12 bytes).
  - Link: `#2.<público>.<salt|iv|cifrado>`. Público = `{v:2, d:quienRegala, i:iteraciones}` (solo dice para
    quién es el link) y va como AAD: alterar el nombre invalida el link. Cifrado = receptor + datos del evento.
  - El organizador elige en cada envío: "💬 Solo link" (el código va por otro canal) o "💬 Link + código".
  - Freno de interfaz en el participante: desde el 5º código incorrecto, espera de 30 s que se duplica.
- **Descartado:** inscripción con llave propia por participante (nadie, ni el organizador, podría ver; pero
  requiere dos rondas de mensajes y queda atado a un dispositivo); servidor con login (deja de ser HTML simple).
- **Amenazas cubiertas:** link reenviado o filtrado sin el código; capturas del link; alguien que lee el código
  fuente; manipulación del link; el hosting (el `#hash` nunca llega al servidor).
- **No cubiertas (aceptado):** el organizador ve todos los códigos (y quedan en su `localStorage`), así que
  podría espiar; si se reenvía el mensaje "Link + código" completo, quien lo reciba puede verlo; un atacante
  con el link y GPU podría probar códigos offline (≈30 bits × PBKDF2 600k ⇒ días/semanas de cómputo,
  desproporcionado para un amigo secreto). El freno de 5 intentos es solo de interfaz.
- Formato v1 (XOR) eliminado; no se publicaron links v1.

## D11 — Endurecimiento de la página (2026-11-23)
- JS movido de inline a `app.js` para poder usar una CSP estricta por `<meta>`:
  `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`.
  Sin `connect-src`: la página no puede enviar datos a ningún servidor.
- `<meta name="referrer" content="no-referrer">`; enlaces externos (WhatsApp) con `rel="noopener noreferrer"`.
- Al "Ocultar" el resultado se borra del DOM; para verlo otra vez hay que reingresar el código (no se recuerda).

## D12 — Perfiles con Supabase + RLS (2026-11-23)
- **Motivo:** se pidió poder crear un perfil para guardar las listas, y que el servicio lo use más gente.
- **Elegido:** Supabase (Postgres + Auth, plan gratis) consumido directo desde el sitio estático. La seguridad
  está en la base: RLS en `listas` y `sorteos` (`user_id = auth.uid()`), `anon` sin permisos, `CHECK` de
  tamaños, máximo de 50 listas por usuario, historial recortado a 200, dueño inmutable y
  `eliminar_mi_cuenta()` (`security definer`, `search_path` vacío). Ver `supabase/schema.sql`, probado con
  `npm run test:rls`.
- **Descartado:** Firebase; perfil solo local con exportar/importar.
- La app funciona igual sin Supabase configurado (`config.js` vacío → perfiles ocultos).

## D13 — Login por link mágico con PKCE (2026-11-23)
- **Elegido:** `signInWithOtp` con `flowType: 'pkce'`. La vuelta llega como `?code=` (query), no como
  `#access_token=` (hash), así no choca con los links de participante (`#2.…`). `app.js` solo trata como
  participante los hash que empiezan con `2.`.
- **Consecuencia:** el link del correo debe abrirse en el mismo navegador donde se pidió (ahí está el
  code verifier). La UI lo explica.
- **Descartado:** Google OAuth (más configuración); contraseñas.

## D14 — Nunca guardar resultados en la base (2026-11-23)
- **Elegido:** solo se guardan listas (nombre, participantes, exclusiones, evento) e historial (`lista_id`,
  cantidad, fecha). `app.js` emite el evento `sorteo-realizado` con **solo** `{participantes: n}`. El E2E
  verifica que ningún link ni código viaja a Supabase.
- **Descartado:** guardar links y códigos cifrados con una contraseña extra.

## D15 — SEO y subdominio gratis (2026-11-23)
- **Elegido:** GitHub Pages en `jorgecaror.github.io/amigo-secreto` (ver D18).
  Title y description optimizados, canonical, Open Graph con imagen, JSON-LD WebApplication + FAQPage
  (idéntico al FAQ visible, lo verifica el E2E), contenido indexable, robots.txt, sitemap, manifest e íconos,
  más `privacidad.html` (Ley 19.628/21.719) y `404.html`. Detalle en `docs/SEO.md`.
- **Pendiente:** dominio propio (mejor posicionamiento) cuando el usuario lo decida.

## D16 — Carga perezosa y CSP con Supabase (2026-11-23)
- supabase-js 2.45.4 copiado a `vendor/` (SHA-256 en `vendor/README.md`), así se mantiene `script-src 'self'`.
- `perfil.js` lo carga solo en la vista organizador y solo si hay sesión guardada, `?code=` o clic en
  "Iniciar sesión". Las visitas sin cuenta no descargan nada extra.
- CSP: `connect-src https://*.supabase.co` (lo único de red). La vista participante agrega en tiempo de
  ejecución otra CSP `connect-src 'none'`: no puede hacer ninguna llamada.
- El CSS pasó a `estilos.css`, compartido por las 3 páginas.
- `config.js` solo tiene la URL y la clave pública (anon/publishable); nunca la `service_role`.

## D17 — Correcciones de la revisión de seguridad (2026-11-23)
Detalle en `docs/SEGURIDAD.md` (H1–H5). Decisiones que cambian el comportamiento:
- **Relleno del cifrado:** `JSON(r) + p` ocupa siempre 512 bytes y el campo `n` (nonce) se eliminó: la salt y el
  IV ya hacen único cada link. Formato compatible: `v` sigue en 2 y el lector ignora `p`.
- **Compartir:** `navigator.share` primero. Sin él, "Link + código" se copia al portapapeles (nunca `wa.me`) y
  "Solo link" abre `wa.me`.
- **Red fijada en tiempo de ejecución:** CSP extra `connect-src <proyecto de config.js>` o `'none'` sin config. La
  CSP del `<meta>` mantiene `*.supabase.co` como techo.
- **Límite de listas:** el trigger pasa a `security invoker`, cuenta por `auth.uid()` y usa un advisory lock.
- **Links sin query:** la URL base de los links es solo origen + ruta.

## D18 — Publicación en GitHub Pages (2026-11-23)
- **Repositorio:** `github.com/jorgecaror/amigo-secreto` (público). **Sitio:** `https://jorgecaror.github.io/amigo-secreto/`,
  servido por Pages desde `main`, carpeta raíz, sin build ni Actions. Publicar = commit + push a `main`.
- **Identidad de git:** configurada solo en este repo (no global), con el correo que eligió el usuario. Ese correo
  queda **público** en el historial; si se quiere ocultar en adelante, cambiar a `...@users.noreply.github.com`.
- **Push por HTTPS** con Git Credential Manager (no se instaló `gh`).
- **Se publica `config.js` con la clave anon:** es pública por diseño; la protección la da RLS (D12).
- **Supabase:** la Site URL y la Redirect URL pasan a la URL pública; la de `127.0.0.1:8099` se mantiene solo
  para pruebas locales.
- `robots.txt` en una subcarpeta no lo leen los buscadores, así que el sitemap se envía en Search Console.
