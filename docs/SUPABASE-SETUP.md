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

En **Authentication → Emails → Magic Link**, cambia la plantilla a español, por ejemplo:
- Asunto: `Tu link para entrar a Amigo Secreto`
- Cuerpo:
  ```html
  <h2>Entrar a Amigo Secreto</h2>
  <p>Toca este link para iniciar sesión. Ábrelo en el mismo navegador donde lo pediste:</p>
  <p><a href="{{ .ConfirmationURL }}">Iniciar sesión</a></p>
  <p>Si no pediste este correo, ignóralo.</p>
  ```
Haz lo mismo con la plantilla **Confirm signup**: la primera vez que alguien entra, Supabase envía esa.
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

## 7. Mantención
- Plan gratis: 500 MB de base de datos. Una lista pesa ~1 KB, así que alcanza para cientos de miles de listas.
- Los proyectos gratis se **pausan tras 7 días sin actividad**. Se reactivan desde el panel. Si el sitio tiene
  uso real, esto no ocurre.
- Haz un respaldo cuando quieras con **Database → Backups**. En el plan gratis, exporta con el SQL Editor o con `pg_dump`.
