// Aplica las plantillas de login (D21) en Supabase por la Management API y muestra cómo quedaron.
// Evita errores al pegarlas a mano. Requiere un token personal (https://supabase.com/dashboard/account/tokens).
//
// Uso (PowerShell, en tu propia terminal; el token no se imprime ni se guarda):
//   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
//   node supabase/correos/aplicar.mjs            → aplica y verifica
//   node supabase/correos/aplicar.mjs --ver      → solo muestra qué plantillas tiene hoy el proyecto
import { generar } from './generar.mjs';
import { ASUNTOS_LOGIN } from '../functions/enviar-correo/correo.mjs';

const PROYECTO = 'afrsrmxkgfztevosnjkw';
const API = `https://api.supabase.com/v1/projects/${PROYECTO}/config/auth`;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN. Créalo en https://supabase.com/dashboard/account/tokens y ejecuta:\n  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."');
  process.exit(1);
}
const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

async function leer() {
  const r = await fetch(API, { headers });
  if (!r.ok) throw new Error(`GET config/auth → ${r.status} ${await r.text()}`);
  return r.json();
}

function resumen(c) {
  const nuevo = (html) => (html || '').includes('Generado por supabase/correos/generar.mjs');
  console.log(`  Magic Link     · asunto: ${c.mailer_subjects_magic_link}\n                   cuerpo: ${nuevo(c.mailer_templates_magic_link_content) ? 'diseño NUEVO ✓' : 'diseño antiguo ✗'}`);
  console.log(`  Confirm signup · asunto: ${c.mailer_subjects_confirmation}\n                   cuerpo: ${nuevo(c.mailer_templates_confirmation_content) ? 'diseño NUEVO ✓' : 'diseño antiguo ✗'}`);
  console.log(`  SMTP propio: ${c.smtp_host ? c.smtp_host + ':' + c.smtp_port + ' (' + c.smtp_admin_email + ')' : 'no configurado ✗'}`);
  return nuevo(c.mailer_templates_magic_link_content) && nuevo(c.mailer_templates_confirmation_content);
}

console.log('Antes:');
resumen(await leer());
if (process.argv.includes('--ver')) process.exit(0);

const p = generar();
const r = await fetch(API, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({
    mailer_subjects_magic_link: ASUNTOS_LOGIN.magicLink,
    mailer_templates_magic_link_content: p['login.html'],
    mailer_subjects_confirmation: ASUNTOS_LOGIN.confirmacion,
    mailer_templates_confirmation_content: p['confirmar-registro.html']
  })
});
if (!r.ok) { console.error(`PATCH config/auth → ${r.status} ${await r.text()}`); process.exit(1); }
console.log('\nDespués:');
if (!resumen(await leer())) { console.error('\nLas plantillas no quedaron aplicadas.'); process.exit(1); }
console.log('\n✓ Plantillas aplicadas. Pide un link de login nuevo para verlas (los ya enviados no cambian).');
