// Uso: npm run test:funcion   (requiere Deno 2)
// Prueba de humo de supabase/functions/enviar-correo/index.ts corriendo en Deno de verdad, con Supabase y un
// servidor SMTP simulados: CORS, sesión, validación, envío por nodemailer, cupo con el JWT, cupo global y logs limpios.
import { createServer } from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
const S = createRequire(raiz + '/package.json')('./sorteo.js');
const correos = []; const inserts = []; let usados = 0;

// Supabase simulado
const supa = createServer((req, res) => {
  let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
    const j = (o, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url.startsWith('/auth/v1/user')) {
      if (req.headers.authorization !== 'Bearer jwt-valido') return j({ msg: 'invalid JWT' }, 401);
      return j({ id: 'u1', email: 'org@ejemplo.cl', aud: 'authenticated', role: 'authenticated' });
    }
    if (req.url.startsWith('/rest/v1/envios_correo') && req.method === 'GET') return j(usados ? [{ cantidad: usados }] : []);
    if (req.url.startsWith('/rest/v1/envios_correo') && req.method === 'POST') {
      inserts.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      return j(null, 201);
    }
    j({}, 404);
  });
}).listen(54321);

// SMTP simulado (sin TLS)
const smtp = net.createServer((s) => {
  let data = false, buf = '', msg = { rcpt: [] };
  s.write('220 prueba\r\n');
  s.on('data', (d) => {
    buf += d.toString('latin1');
    let i;
    while (true) {
      if (data) {
        i = buf.indexOf('\r\n.\r\n'); if (i < 0) return;
        msg.data = Buffer.from(buf.slice(0, i), 'latin1').toString('utf8'); buf = buf.slice(i + 5); data = false;
        correos.push(msg); msg = { rcpt: [] }; s.write('250 ok\r\n'); continue;
      }
      i = buf.indexOf('\r\n'); if (i < 0) return;
      const l = buf.slice(0, i); buf = buf.slice(i + 2);
      if (/^EHLO/i.test(l)) s.write('250-prueba\r\n250 AUTH PLAIN LOGIN\r\n');
      else if (/^AUTH/i.test(l)) s.write('235 ok\r\n');
      else if (/^MAIL FROM/i.test(l)) { msg.from = l; s.write('250 ok\r\n'); }
      else if (/^RCPT TO/i.test(l)) { msg.rcpt.push(l); s.write('250 ok\r\n'); }
      else if (/^DATA/i.test(l)) { data = true; s.write('354 go\r\n'); }
      else if (/^QUIT/i.test(l)) { s.write('221 bye\r\n'); s.end(); return; }
      else s.write('250 ok\r\n');
    }
  });
}).listen(2525);

const env = { ...process.env, SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM: '"Amigo Secreto" <sitio@ejemplo.cl>',
  SITIO_URLS: 'https://jorgecaror.github.io/amigo-secreto/', ORIGENES: 'https://jorgecaror.github.io', CUPO_GLOBAL_DIARIO: '450' };
const deno = spawn('deno', ['run', '--node-modules-dir=none', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', 'index.ts'],
  { cwd: raiz + '/supabase/functions/enviar-correo', env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; deno.stdout.on('data', (d) => log += d); deno.stderr.on('data', (d) => log += d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 100 && !/Listening/.test(log); i++) await sleep(200);

const F = 'http://127.0.0.1:8000/';
const ORIGEN = 'https://jorgecaror.github.io';
const post = (body, auth = 'Bearer jwt-valido', origen = ORIGEN) => fetch(F, { method: 'POST', headers: { Origin: origen, Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
try {
  const codigo = S.generarCodigo();
  const hash = await S.codificar({ da: 'Sofía', recibe: 'Ana', evento: {} }, codigo, { relleno: 8 });
  const url = 'https://jorgecaror.github.io/amigo-secreto/#' + hash;
  const items = [{ email: 'ana@ejemplo.cl', url, codigo }, { email: 'beto@ejemplo.cl', url, codigo }];

  const pre = await fetch(F, { method: 'OPTIONS', headers: { Origin: ORIGEN } });
  assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), ORIGEN);
  assert.equal((await fetch(F, { method: 'OPTIONS', headers: { Origin: 'https://evil.com' } })).status, 403);
  assert.equal((await post({ items }, 'Bearer jwt-valido', 'https://evil.com')).status, 403);
  assert.equal((await post({ items }, 'Bearer anon')).status, 401);
  assert.equal((await post({ items }, '')).status, 401);
  const malo = await post({ items: [{ email: 'a@b.cl', url: 'https://evil.com/#' + hash, codigo }] });
  assert.equal(malo.status, 400); assert.match((await malo.json()).error, /Link inválido/);
  console.log('✓ CORS, sesión y validación');

  const r = await post({ items });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { resultados: [{ ok: true }, { ok: true }] });
  assert.equal(correos.length, 2);
  assert.deepEqual(inserts, [{ auth: 'Bearer jwt-valido', body: { cantidad: 2 } }], 'cupo con el JWT del usuario');
  const m = correos[0].data;
  assert.ok(correos[0].rcpt[0].includes('ana@ejemplo.cl'));
  assert.match(m, /Reply-To: org@ejemplo.cl/i);
  assert.match(m, /Subject: /);
  assert.ok(m.includes(codigo), 'código en el correo');
  assert.ok(/multipart\/alternative/i.test(m), 'html + texto');
  console.log('✓ Envío: 2 correos por SMTP con Reply-To del organizador, cupo registrado con el JWT');

  usados = 449;
  const lleno = await post({ items });
  assert.equal(lleno.status, 429); assert.match((await lleno.json()).error, /límite diario/);
  assert.equal(correos.length, 2);
  console.log('✓ Cupo global: 429 sin enviar');
  assert.ok(!/ejemplo\.cl|#3\./.test(log), 'los logs no tienen correos ni links: ' + log);
  console.log('✓ Logs sin datos personales\nOK — humo de la función');
} finally { deno.kill(); supa.close(); smtp.close(); }
