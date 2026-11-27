// Uso: npm run correos:vista
// Genera los 3 correos (participante, login, confirmar registro) con datos de ejemplo en una carpeta temporal y,
// si encuentra Edge/Chrome (variable NAVEGADOR), saca capturas en modo claro y oscuro, a ancho de escritorio y angosto (Edge headless no baja de ~490 px).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { construirCorreo } from '../supabase/functions/enviar-correo/correo.mjs';
import { generar, SITIO } from '../supabase/correos/generar.mjs';

const EDGE = process.env.NAVEGADOR || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const dir = mkdtempSync(join(tmpdir(), 'amigo-secreto-correos-'));
const ejemploLink = SITIO + '#3.U29mw61h.' + 'x'.repeat(160);
const login = generar();
const correos = {
  participante: construirCorreo({ nombre: 'Sofía', url: ejemploLink, codigo: 'K7P-Q2M', organizador: 'organizador@ejemplo.cl', sitioUrl: SITIO }).html,
  login: login['login.html'].replaceAll('{{ .ConfirmationURL }}', SITIO + '?code=ejemplo'),
  registro: login['confirmar-registro.html'].replaceAll('{{ .ConfirmationURL }}', SITIO + '?code=ejemplo')
};

for (const [nombre, html] of Object.entries(correos)) {
  const archivo = join(dir, nombre + '.html');
  writeFileSync(archivo, html);
  console.log('✓ ' + archivo);
  for (const [modo, tema] of [['claro', 1], ['oscuro', 0]]) {
    for (const [ancho, alto] of [[800, 1000], [500, 1100]]) {
      const png = join(dir, `${nombre}-${modo}-${ancho}.png`);
      const r = spawnSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--blink-settings=preferredColorScheme=${tema}`,
        `--window-size=${ancho},${alto}`, `--screenshot=${png}`, `--user-data-dir=${join(dir, 'perfil')}`, pathToFileURL(archivo).href], { timeout: 30000 });
      if (r.error) { console.log('  (sin capturas: no se encontró el navegador)'); break; }
      console.log('  ' + png);
    }
  }
}
