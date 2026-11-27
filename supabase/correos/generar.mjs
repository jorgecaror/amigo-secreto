// Genera las plantillas de login de Supabase desde el mismo diseño que el correo del participante (D21).
// Uso: node supabase/correos/generar.mjs   → escribe login.html y confirmar-registro.html en esta carpeta.
// Luego se pegan en Supabase: Authentication → Emails (ver docs/SUPABASE-SETUP.md).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plantillaLogin, ASUNTOS_LOGIN } from '../functions/enviar-correo/correo.mjs';

export const SITIO = 'https://jorgecaror.github.io/amigo-secreto/';

// El aviso va después del doctype (antes, el navegador entraría en modo quirks).
function conAviso(html, asunto) {
  const aviso = '<!-- Generado por supabase/correos/generar.mjs: no editar a mano.\n     Asunto: ' + asunto + ' -->\n';
  return html.replace('<!doctype html>\n', '<!doctype html>\n' + aviso);
}

export function generar() {
  return {
    'login.html': conAviso(plantillaLogin({ sitioUrl: SITIO, registro: false }), ASUNTOS_LOGIN.magicLink),
    'confirmar-registro.html': conAviso(plantillaLogin({ sitioUrl: SITIO, registro: true }), ASUNTOS_LOGIN.confirmacion)
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [archivo, html] of Object.entries(generar())) {
    writeFileSync(new URL(archivo, import.meta.url), html);
    console.log('✓ supabase/correos/' + archivo);
  }
}
