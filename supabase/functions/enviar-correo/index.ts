// Edge Function `enviar-correo` (D20): envía a cada participante su link + código por correo.
//
// - Solo usuarios con sesión (no basta verify_jwt: la clave anon también es un JWT).
// - Solo links de este sitio (SITIO_URLS) y el nombre sale del propio link: no sirve para spam/phishing.
// - Cupo por usuario en public.envios_correo (RLS + trigger) y cupo global diario (SMTP de Gmail ~500/día).
// - No guarda ni registra en logs links, códigos ni correos.
//
// Secretos (npx supabase secrets set ...): SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM,
// SITIO_URLS (coma), ORIGENES (coma), CUPO_GLOBAL_DIARIO (opcional, 450 por defecto).
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
import nodemailer from 'npm:nodemailer@6.9.16';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { validarEnvio, construirCorreo } from './correo.mjs';

const env = (k: string) => Deno.env.get(k) ?? '';
const lista = (k: string) => env(k).split(',').map((s) => s.trim()).filter(Boolean);
const ORIGENES = lista('ORIGENES');
const SITIOS = lista('SITIO_URLS');
const CUPO_GLOBAL = Number(env('CUPO_GLOBAL_DIARIO')) || 450;

function respuesta(cuerpo: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  const origen = req.headers.get('Origin') ?? '';
  const permitido = ORIGENES.includes(origen);
  const cors: Record<string, string> = permitido
    ? {
        'Access-Control-Allow-Origin': origen,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin'
      }
    : { Vary: 'Origin' };

  if (req.method === 'OPTIONS') return new Response(null, { status: permitido ? 204 : 403, headers: cors });
  if (req.method !== 'POST') return respuesta({ error: 'Método no permitido.' }, 405, cors);
  if (!permitido) return respuesta({ error: 'Origen no permitido.' }, 403, cors);

  // 1) Usuario real.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return respuesta({ error: 'Inicia sesión para enviar por correo.' }, 401, cors);
  const comoUsuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: u, error: errUsuario } = await comoUsuario.auth.getUser(auth.slice(7));
  const usuario = u?.user;
  if (errUsuario || !usuario || !usuario.email) return respuesta({ error: 'Tu sesión venció. Inicia sesión de nuevo.' }, 401, cors);

  // 2) Datos.
  let body: unknown;
  try { body = await req.json(); } catch { return respuesta({ error: 'Datos inválidos.' }, 400, cors); }
  const v = validarEnvio(body, SITIOS);
  if (v.error) return respuesta({ error: v.error }, 400, cors);
  const items = v.items!;

  // 3) Cupo global (todas las cuentas): lo cuenta la service_role, que nunca sale de la función.
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: usados, error: errCupo } = await admin.from('envios_correo').select('cantidad').gte('creado_en', desde);
  if (errCupo) {
    console.error('[enviar-correo] no se pudo leer el cupo global', errCupo.code);
    return respuesta({ error: 'No se pudo enviar. Intenta más tarde.' }, 500, cors);
  }
  const totalHoy = (usados ?? []).reduce((s: number, r: { cantidad: number }) => s + r.cantidad, 0);
  if (totalHoy + items.length > CUPO_GLOBAL) {
    return respuesta({ error: 'El servicio de correo llegó a su límite diario. Intenta mañana o envía por WhatsApp.' }, 429, cors);
  }

  // 4) Cupo por usuario: insert con el JWT del usuario (RLS); el trigger rechaza si se pasa del límite diario.
  const { error: errIns } = await comoUsuario.from('envios_correo').insert({ cantidad: items.length });
  if (errIns) {
    if (errIns.code === 'P0001') return respuesta({ error: errIns.message }, 429, cors);
    console.error('[enviar-correo] no se pudo registrar el envío', errIns.code);
    return respuesta({ error: 'No se pudo enviar. Intenta más tarde.' }, 500, cors);
  }

  // 5) Envío. Puerto 465 (TLS implícito): Supabase bloquea la salida por 25 y 587.
  const puerto = Number(env('SMTP_PORT')) || 465;
  const transporte = nodemailer.createTransport({
    host: env('SMTP_HOST') || 'smtp.gmail.com',
    port: puerto,
    secure: puerto === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') }
  });
  const resultados: { ok: boolean; error?: string }[] = [];
  for (const it of items) {
    const c = construirCorreo({ nombre: it.nombre, url: it.url, codigo: it.codigo, organizador: usuario.email, sitioUrl: SITIOS[0] });
    try {
      await transporte.sendMail({
        from: env('SMTP_FROM') || env('SMTP_USER'),
        to: it.email,
        replyTo: usuario.email,
        subject: c.asunto,
        html: c.html,
        text: c.texto
      });
      resultados.push({ ok: true });
    } catch (e) {
      // Sin datos personales en el log: solo el código de error SMTP.
      console.error('[enviar-correo] fallo SMTP', (e as { code?: string; responseCode?: number })?.responseCode ?? (e as { code?: string })?.code ?? '');
      resultados.push({ ok: false, error: 'No se pudo enviar a este correo.' });
    }
  }
  transporte.close();
  return respuesta({ resultados }, 200, cors);
});
