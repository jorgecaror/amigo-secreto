# Configurar Supabase (perfiles)

Los perfiles son **opcionales**. Si `config.js` queda vacío, la página funciona igual, solo sin cuentas.
Tiempo estimado: 20–30 minutos.

## 1. Crear el proyecto
1. Entra a <https://supabase.com> y crea una cuenta.
2. **New project**: nombre `amigo-secreto`, una contraseña de base de datos fuerte (guárdala en tu gestor
   de contraseñas; la app no la usa) y la región más cercana a tus usuarios (ej. *South America (São Paulo)*).
3. Espera a que termine de crearse (1–2 min).

## 2. Crear las tablas y las reglas de seguridad
1. Menú **SQL Editor → New query**.
2. Pega el contenido completo de [`supabase/schema.sql`](../supabase/schema.sql) y presiona **Run**.
   Debe terminar sin errores. Se puede volver a ejecutar cuando quieras: no borra datos.
3. En **Table Editor** deberías ver `listas` y `sorteos`, ambas con el candado **RLS enabled**.

> Este mismo archivo se prueba localmente con `npm run test:rls` (Postgres 16 real vía PGlite).

## 3. Autenticación (link mágico)
En **Authentication → Sign In / Providers**:
- **"Allow new users to sign up"** (arriba, en *User Signups*): **activado**. Si está apagado, nadie nuevo puede
  entrar con el link mágico y la página muestra "Por ahora no se están creando cuentas nuevas".
- **Email**: habilitado y **"Confirm email"** activado. Supabase no permite apagar solo el registro con contraseña;
  la página no lo ofrece y, con "Confirm email", una cuenta creada así igual exige el correo.
- Desactiva los demás proveedores que no uses.
- Comprobación rápida: `https://TU-PROYECTO.supabase.co/auth/v1/settings?apikey=TU_ANON_KEY` debe mostrar
  `"disable_signup":false`, `"email":true` y `"mailer_autoconfirm":false`.

En **Authentication → URL Configuration**:
- **Site URL**: `https://jorgecaror.github.io/amigo-secreto/`
- **Redirect URLs** (agrega ambas):
  - `https://jorgecaror.github.io/amigo-secreto/**`
  - `http://127.0.0.1:8099/amigo-secreto/**` (solo para pruebas locales; puedes quitarla en producción)

En **Authentication → Emails**, usa las plantillas con el diseño del sitio (D21). Están en `supabase/correos/` y se
generan con `npm run correos`; no las edites a mano:
| Plantilla en Supabase | Asunto | Cuerpo (pega el archivo completo) |
|---|---|---|
| **Magic Link** | `🔑 Tu link para entrar a Amigo Secreto` | [`supabase/correos/login.html`](../supabase/correos/login.html) |
| **Confirm signup** (la primera vez que alguien entra) | `👋 Confirma tu cuenta de Amigo Secreto` | [`supabase/correos/confirmar-registro.html`](../supabase/correos/confirmar-registro.html) |

El asunto también está en el comentario al inicio de cada archivo. Después de guardar, pide un link para probarlo.
Para ver cómo quedan sin enviar nada: `npm run correos:vista`.
> Supabase solo deja editar las plantillas si ya configuraste el SMTP propio (paso 4). Si aún no lo tienes, haz
> este bloque después del paso 4.

En **Authentication → Rate Limits**, deja los valores por defecto o bájalos. Limitan cuántos correos y cuántos
intentos se aceptan por hora.

## 4. Correo propio (SMTP) — necesario para uso público
El correo integrado de Supabase es solo para pruebas: envía muy pocos correos por hora y solo a miembros del
equipo del proyecto. Para que cualquier persona pueda entrar, configura un SMTP:
1. Crea una cuenta en un proveedor de correo transaccional, por ejemplo **Resend** (plan gratis ~3.000/mes) o
   Brevo. Para enviar desde tu propio dominio debes verificarlo; sin dominio propio, revisa qué remitente de
   prueba ofrece el proveedor.
2. En Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP** y copia host, puerto,
   usuario, contraseña/API key y el remitente que te da el proveedor.
3. Envíate un link de prueba.

## 5. Conectar la página
1. **Project Settings → API Keys** (o **Data API**): copia la **Project URL** y la clave pública: **anon** (legacy)
   o **publishable** (`sb_publishable_...`).
2. Pégalas en [`config.js`](../config.js):
   ```js
   window.AMIGO_SECRETO_CONFIG = Object.freeze({
     supabaseUrl: 'https://TU-PROYECTO.supabase.co',
     supabaseAnonKey: 'eyJ...'   // o 'sb_publishable_...'
   });
   ```
3. ⚠️ **Nunca** pongas la `service_role` / `secret` key en `config.js` ni en ningún archivo del sitio: salta
   todas las reglas de seguridad.
4. Publica de nuevo el sitio. Aparecerá "Iniciar sesión" arriba a la derecha.

> Nota: el sitio usa supabase-js 2.45.4 (`vendor/`). Si tu proyecto solo ofrece claves `sb_publishable_` y el
> login falla con error 401, usa la clave **anon (legacy)** o avísame para actualizar la librería.

## 6. Comprobar que funciona (checklist manual)
- [ ] "Iniciar sesión" → llega el correo → al abrirlo, la página muestra tu correo arriba.
- [ ] Guardar una lista, recargar la página: sigue en "Mis listas".
- [ ] Sortear con la lista cargada → "Mi perfil" muestra el sorteo en el historial (solo fecha y cantidad).
- [ ] Con otra cuenta (otro correo, en ventana privada) **no** se ve la lista de la primera.
- [ ] "Eliminar mi cuenta" borra el usuario en **Authentication → Users** y sus filas.

### Verificar RLS en el SQL Editor (opcional)
```sql
-- Debe fallar con "permission denied": un visitante anónimo no tiene acceso.
begin;
set local role anon;
select * from public.listas;
rollback;

-- Ver las políticas activas:
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';
```

## 7. Envío de resultados por correo (Edge Function `enviar-correo`, D20)
Opcional. Sin este paso, el botón "✉️ Correo" responde con un error y WhatsApp sigue funcionando igual.

1. **Base de datos:** vuelve a ejecutar [`supabase/schema.sql`](../supabase/schema.sql) completo en el SQL Editor.
   Crea la tabla `envios_correo`, que solo guarda cuántos correos envió cada usuario y cuándo.
2. **Contraseña de aplicación de Gmail.** En la cuenta Google del SMTP, con la verificación en dos pasos activa:
   <https://myaccount.google.com/apppasswords>. Crea una ("Amigo Secreto") y copia los 16 caracteres. Puede ser la
   misma que usaste en el SMTP del paso 4.
3. **Secretos de la función.** En una terminal en la carpeta del proyecto (pide iniciar sesión en el navegador):
   ```bash
   npx supabase login
   npx supabase secrets set --project-ref afrsrmxkgfztevosnjkw \
     SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=tu-cuenta@gmail.com SMTP_PASS="xxxx xxxx xxxx xxxx" \
     SMTP_FROM='"Amigo Secreto" <tu-cuenta@gmail.com>' \
     SITIO_URLS=https://jorgecaror.github.io/amigo-secreto/ \
     ORIGENES=https://jorgecaror.github.io
   ```
   - En PowerShell, escribe el comando en una sola línea (sin las `\`).
   - Opcional: `CUPO_GLOBAL_DIARIO=450`, el máximo de correos en 24 h para todo el sitio. Gmail permite ~500 al día.
   - Para probar en local, agrega `http://127.0.0.1:8099/amigo-secreto/` a `SITIO_URLS` y `http://127.0.0.1:8099` a
     `ORIGENES`, separados por comas.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase: no los agregues.
4. **Desplegar** (`--use-api` evita necesitar Docker):
   ```bash
   npx supabase functions deploy enviar-correo --project-ref afrsrmxkgfztevosnjkw --use-api
   ```
   Debe aparecer en **Edge Functions** con "Verify JWT" activado.
5. **Probar:** inicia sesión en el sitio, haz un sorteo de 3 personas con correos tuyos y pulsa "✉️ Enviar a todos".
   - Revisa que lleguen los correos (y la carpeta de spam).
   - El botón debe abrir el resultado y el código debe revelarlo.
   - Si falla, revisa **Edge Functions → enviar-correo → Logs**. Ahí solo aparecen códigos de error, nunca
     correos ni links.

> ⚠️ La carpeta **Enviados** de esa cuenta Gmail guardará una copia de cada correo, con su link y su código (D20).
> Usa una cuenta dedicada al sitio y no la revises más de lo necesario. Si el sitio crece, conviene pasar a un
> proveedor transaccional con dominio propio (Resend/Brevo): solo cambia el transporte en `index.ts`.

## 8. Mantención
- Plan gratis: 500 MB de base de datos. Una lista pesa ~1 KB, así que alcanza para cientos de miles de listas.
- Los proyectos gratis se **pausan tras 7 días sin actividad**. Se reactivan desde el panel. Si el sitio tiene
  uso real, esto no ocurre.
- Haz un respaldo cuando quieras con **Database → Backups**. En el plan gratis, exporta con el SQL Editor o con `pg_dump`.
