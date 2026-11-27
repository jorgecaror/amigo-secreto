// Uso: node test/verificar-correo.mjs
// Prueba la lógica de la Edge Function enviar-correo (validación y plantillas) y que las plantillas de login
// de supabase/correos/ estén al día con el generador.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { validarEnvio, construirCorreo, nombreDelLink, escaparHtml, MAX_ITEMS } from '../supabase/functions/enviar-correo/correo.mjs';
import { generar } from '../supabase/correos/generar.mjs';

const S = createRequire(import.meta.url)('../sorteo.js');
const SITIO = 'https://jorgecaror.github.io/amigo-secreto/';
const SITIOS = [SITIO, 'http://127.0.0.1:8099/amigo-secreto/'];
const codigo = S.generarCodigo();
const hash = await S.codificar({ da: 'Sofía', recibe: 'Ana', evento: { lugar: 'Casa' } }, codigo, { relleno: 8 });
const url = SITIO + '#' + hash;
const ok = (m) => console.log('✓ ' + m);

// --- validarEnvio ---
{
  const r = validarEnvio({ items: [{ email: ' ana@ejemplo.cl ', url, codigo: codigo.toLowerCase(), nombre: 'IGNORADO <b>' }] }, SITIOS);
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.items, [{ email: 'ana@ejemplo.cl', url, codigo, nombre: 'Sofía' }], 'el nombre sale del link, no del cliente');
  assert.ok(!validarEnvio({ items: [{ email: 'a@b.cl', url: SITIOS[1] + 'index.html#' + hash, codigo }] }, SITIOS).error, 'index.html y sitio local');
  const v2 = await S._codificarV2({ da: 'Beto', recibe: 'Ana', evento: {} }, codigo);
  assert.equal(validarEnvio({ items: [{ email: 'a@b.cl', url: SITIO + '#' + v2, codigo }] }, SITIOS).items[0].nombre, 'Beto', 'links v2');
}
const malo = (item, patron, desc) => {
  const r = validarEnvio({ items: [{ email: 'ana@ejemplo.cl', url, codigo, ...item }] }, SITIOS);
  assert.match(r.error || '', patron, desc);
};
malo({ url: 'https://evil.example.com/amigo-secreto/#' + hash }, /Link inválido/, 'otro dominio');
malo({ url: 'https://jorgecaror.github.io/amigo-secreto.evil.com/#' + hash }, /Link inválido/, 'sufijo de dominio');
malo({ url: SITIO + 'otra.html#' + hash }, /Link inválido/, 'otra página');
malo({ url: SITIO + '#' + hash + '"><script>' }, /Link inválido/, 'inyección en url');
malo({ url: SITIO + '?x=1#' + hash }, /Link inválido/, 'query');
malo({ url: SITIO + '#4.' + hash.slice(2) }, /Link inválido/, 'versión desconocida');
malo({ url: SITIO + '#3.' + Buffer.from('x'.repeat(61)).toString('base64url') + '.' + hash.split('.')[2] }, /Link inválido/, 'nombre de más de 60');
malo({ url: SITIO + '#3.' + Buffer.from('Ana\nBcc: x@y.cl').toString('base64url') + '.' + hash.split('.')[2] }, /Link inválido/, 'saltos de línea en el nombre');
malo({ url: SITIO + '#' + hash + 'A'.repeat(1500) }, /Link inválido/, 'link gigante');
malo({ email: 'no-es-correo' }, /Correo inválido/, 'email sin @');
malo({ email: 'a@b.cl, c@d.cl' }, /Correo inválido/, 'dos correos');
malo({ email: 'a@b.cl\r\nBcc: x@y.cl' }, /Correo inválido/, 'inyección de cabeceras');
malo({ email: 'x'.repeat(250) + '@b.cl' }, /Correo inválido/, 'correo largo');
malo({ codigo: 'ABC-DE1' }, /Código inválido/, 'código con caracteres ambiguos');
malo({ codigo: '' }, /Código inválido/, 'sin código');
assert.match(validarEnvio({ items: [] }, SITIOS).error, /No hay correos/);
assert.match(validarEnvio({}, SITIOS).error, /No hay correos/);
assert.match(validarEnvio({ items: Array(MAX_ITEMS + 1).fill({ email: 'a@b.cl', url, codigo }) }, SITIOS).error, /hasta 100/);
assert.match(validarEnvio({ items: [{ email: 'a@b.cl', url, codigo }] }, []).error, /no configurado/);
assert.equal(nombreDelLink('3.%%%.abc'), null);
ok('validarEnvio: solo links de este sitio, nombre tomado del link, correos y códigos válidos, sin inyección de cabeceras');

// --- construirCorreo ---
{
  const c = construirCorreo({ nombre: 'Sofía <img src=x>', url, codigo, organizador: 'org"@ejemplo.cl', sitioUrl: SITIO });
  assert.ok(c.html.includes('href="' + url + '"'), 'botón con el link');
  assert.ok(c.html.includes(codigo), 'código en el correo');
  assert.ok(!c.html.includes('<img src=x>') && c.html.includes('Sofía &lt;img src=x&gt;'), 'nombre escapado');
  assert.ok(!c.html.includes('org"@') && c.html.includes('org&quot;@ejemplo.cl'), 'organizador escapado');
  assert.ok(!c.html.includes('Ana'), 'el correo no trae al receptor en claro');
  assert.ok(c.texto.includes(url) && c.texto.includes(codigo), 'versión en texto plano');
  assert.match(c.asunto, /Sofía/);
  assert.equal(escaparHtml(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
}
ok('construirCorreo: botón al link, código, todo escapado, sin el receptor en claro, versión texto');

// --- Plantillas de login al día ---
for (const [archivo, html] of Object.entries(generar())) {
  const enDisco = readFileSync(new URL('../supabase/correos/' + archivo, import.meta.url), 'utf8');
  assert.equal(enDisco, html, `supabase/correos/${archivo} desactualizado: corre node supabase/correos/generar.mjs`);
  assert.equal(html.split('{{ .ConfirmationURL }}').length - 1, 3, 'ConfirmationURL en botón y respaldo');
}
ok('supabase/correos/*.html al día con el generador y con {{ .ConfirmationURL }}');

console.log('\nOK — correo verificado');
