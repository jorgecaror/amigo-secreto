// Uso: npm run test:e2e   (requiere Microsoft Edge o Chrome; ruta con la variable NAVEGADOR)
// E2E: SEO, red, CSP, vista participante, perfil con Supabase simulado. Navegador headless vía DevTools Protocol.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const EDGE = process.env.NAVEGADOR || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
import { iniciarServidor } from './servidor.mjs';
const srv = await iniciarServidor(8099, { sinConfig: true });
const BASE = 'http://127.0.0.1:8099/amigo-secreto/';
const PORT = 9334;
const perfil = mkdtempSync(join(tmpdir(), 'amigo-secreto-e2e-'));
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${perfil}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.find((t) => t.type === 'page')) break; } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); let consola = []; let red = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Log.entryAdded' && ['error', 'warning'].includes(m.params.entry.level)) consola.push(m.params.entry.text);
  if (m.method === 'Runtime.exceptionThrown') consola.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consola.push('console.error: ' + m.params.args.map((a) => a.value || a.description).join(' '));
  if (m.method === 'Network.requestWillBeSent') red.push(m.params.request.url);
});
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluar = async (expr) => {
  const r = await cmd('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 600));
  return r.result.result.value;
};
await cmd('Runtime.enable'); await cmd('Log.enable'); await cmd('Page.enable'); await cmd('Network.enable');
const ir = async (url) => { await cmd('Page.navigate', { url: 'about:blank' }); await sleep(300); consola = []; red = []; await cmd('Page.navigate', { url }); await sleep(1500); };
const externas = () => red.filter((u) => !/^(file|data|about|blob):/.test(u) && !u.startsWith('http://127.0.0.1:8099/'));
const ok = (m) => console.log('✓ ' + m);

try {
  // ===== 1. Organizador sin config: SEO + sorteo + cero red =====
  await ir(BASE + 'index.html');
  const seo = await evaluar(`
    const meta=(s)=>document.querySelector(s)?.getAttribute('content')||document.querySelector(s)?.getAttribute('href');
    const lds=[...document.querySelectorAll('script[type="application/ld+json"]')].map(s=>JSON.parse(s.textContent));
    const faqLd=lds.find(x=>x['@type']==='FAQPage');
    const faqHtml=[...document.querySelectorAll('#faq details')].map(d=>({q:d.querySelector('summary').textContent.trim(),a:d.querySelector('p').textContent.trim()}));
    return { title:document.title, desc:meta('meta[name="description"]'), canonical:meta('link[rel="canonical"]'),
      og:meta('meta[property="og:image"]'), robots:!!document.querySelector('meta[name="robots"]'),
      h1:[...document.querySelectorAll('h1')].map(h=>h.textContent), tipos:lds.map(x=>x['@type']),
      faqIgual: JSON.stringify(faqLd.mainEntity.map(e=>({q:e.name,a:e.acceptedAnswer.text})))===JSON.stringify(faqHtml),
      nFaq: faqHtml.length, infoVisible: !document.getElementById('info').hidden && document.getElementById('info').offsetHeight>0,
      barraSesion: document.getElementById('barra-sesion').hidden, misListas: document.getElementById('mis-listas-card').hidden,
      lang: document.documentElement.lang, descLen: meta('meta[name="description"]').length };`);
  assert.match(seo.title, /Amigo Secreto Online/); assert.ok(seo.descLen >= 120 && seo.descLen <= 170, 'description ' + seo.descLen);
  assert.equal(seo.h1.length, 1); assert.ok(!seo.robots, 'sin noindex'); assert.deepEqual(seo.tipos, ['WebApplication', 'FAQPage']);
  assert.ok(seo.faqIgual, 'FAQ JSON-LD = FAQ visible'); assert.ok(seo.infoVisible); assert.equal(seo.lang, 'es');
  assert.ok(seo.barraSesion && seo.misListas, 'sin config: perfil oculto');
  ok(`SEO: title, description (${seo.descLen} car.), 1 H1, canonical, OG, JSON-LD WebApplication+FAQPage (${seo.nFaq} preguntas = visibles)`);
  ok('Sin config.js: barra de sesión y "Mis listas" ocultas');

  const org = await evaluar(`
    localStorage.clear(); const $=id=>document.getElementById(id);
    $('nombres').value='Ana\\nBeto\\nCaro\\nDani'; $('nombres').dispatchEvent(new Event('input'));
    let evento=null; document.addEventListener('sorteo-realizado',e=>evento=e.detail);
    $('btn-sortear').click();
    while(!localStorage.getItem('amigo-secreto:ultimo')) await new Promise(r=>setTimeout(r,50));
    const d=JSON.parse(localStorage.getItem('amigo-secreto:ultimo'));
    return { evento, link:d.links[0].url, codigo:d.links[0].codigo, n:d.links.length,
      api: typeof window.AmigoSecretoApp.obtenerFormulario, cargarConResultado: window.AmigoSecretoApp.cargarFormulario({participantes:['x','y','z']}) };`);
  assert.deepEqual(org.evento, { participantes: 4 }, 'evento sorteo-realizado solo con la cantidad');
  assert.equal(org.cargarConResultado, false, 'no carga lista con sorteo en pantalla');
  assert.deepEqual(externas(), [], 'sin requests externos: ' + externas());
  assert.deepEqual(consola, [], 'consola limpia: ' + consola);
  ok('Sorteo OK; evento "sorteo-realizado" = {participantes: 4}; 0 requests externos; consola limpia');

  // ===== 2. Participante: sin red =====
  await ir(org.link);
  const part = await evaluar(`
    const $=id=>document.getElementById(id);
    $('p-codigo').value='${org.codigo}'; $('p-form').requestSubmit();
    while(!$('p-recibe').textContent) await new Promise(r=>setTimeout(r,50));
    let bloqueado=false; document.addEventListener('securitypolicyviolation',()=>bloqueado=true);
    try { await fetch('https://abcdefghijklmnop.supabase.co/rest/v1/listas'); } catch(e) {}
    await new Promise(r=>setTimeout(r,300));
    return { recibe:$('p-recibe').textContent, bloqueado, infoOculta: $('info').offsetHeight===0, topbarOculta: document.querySelector('.topbar').offsetHeight===0,
      perfilCargado: !!window.supabase };`);
  assert.ok(part.recibe && part.bloqueado && part.infoOculta && part.topbarOculta && !part.perfilCargado);
  assert.deepEqual(externas().filter((u) => !u.includes('supabase.co/rest')), []);
  ok('Participante: revela; CSP extra bloquea incluso supabase.co; sin contenido SEO ni barra; Supabase no se carga');

  // ===== 3. Hash que no es "2." → organizador =====
  await ir(BASE + 'index.html#access_token=abc&type=magiclink');
  const ruta = await evaluar(`return { org: !document.getElementById('vista-organizador').hidden, part: !document.getElementById('vista-participante').hidden };`);
  assert.deepEqual(ruta, { org: true, part: false });
  ok('Hash ajeno (#access_token=...) no entra a la vista participante');

  // ===== 4. CSP del organizador sin config: ninguna red =====
  await ir(BASE + 'index.html');
  const csp = await evaluar(`
    const v=[]; document.addEventListener('securitypolicyviolation',e=>v.push(e.blockedURI));
    try{await fetch('https://evil.example.com/x')}catch(e){}
    try{await fetch('https://abcdefghijklmnop.supabase.co/x')}catch(e){}
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/x'; document.head.appendChild(s);
    await new Promise(r=>setTimeout(r,500)); return v;`);
  assert.ok(csp.some((u) => u.includes('evil.example.com')), 'bloquea evil');
  assert.ok(csp.some((u) => u.includes('supabase.co')), 'sin config también bloquea supabase');
  assert.ok(csp.some((u) => u.includes('jsdelivr')), 'bloquea scripts externos');
  ok('CSP organizador sin config: bloquea toda la red (incluido supabase.co) y scripts externos');

  // ===== 4b. Links sin query + compartir sin exponer el código a wa.me =====
  await ir(BASE + 'index.html?utm_source=prueba&code=abc');
  const comp = await evaluar(`
    localStorage.clear(); const $=id=>document.getElementById(id);
    Object.defineProperty(navigator,'share',{value:undefined,configurable:true});
    const abiertos=[]; window.open=(u)=>{abiertos.push(String(u)); return null;};
    let copiado=null; Object.defineProperty(navigator,'clipboard',{value:{writeText:async t=>{copiado=t;}},configurable:true});
    window.prompt=(m,t)=>{copiado=t;};
    $('nombres').value='Ana\\nBeto\\nCaro'; $('nombres').dispatchEvent(new Event('input')); $('btn-sortear').click();
    while(!localStorage.getItem('amigo-secreto:ultimo')) await new Promise(r=>setTimeout(r,50));
    const d=JSON.parse(localStorage.getItem('amigo-secreto:ultimo'));
    const botones=[...document.querySelectorAll('#links li')[0].querySelectorAll('button')];
    botones.find(b=>b.textContent.includes('Link + código')).click(); await new Promise(r=>setTimeout(r,200));
    const trasConCodigo={abiertos:abiertos.slice(), copiadoTieneCodigo:(copiado||'').includes(d.links[0].codigo), texto:botones.find(b=>b.textContent.includes('Copiado'))?.textContent};
    botones.find(b=>b.textContent.includes('Solo link')).click(); await new Promise(r=>setTimeout(r,200));
    return {urls:d.links.map(l=>l.url), trasConCodigo, waSolo:abiertos[0]||'', codigo:d.links[0].codigo};`);
  assert.ok(comp.urls.every((u) => !u.includes('?') && u.startsWith(BASE + 'index.html#2.')), 'links sin query: ' + comp.urls[0]);
  assert.deepEqual(comp.trasConCodigo.abiertos, [], '"Link + código" no abre wa.me');
  assert.ok(comp.trasConCodigo.copiadoTieneCodigo, 'copia el mensaje con el código');
  assert.ok(comp.waSolo.startsWith('https://wa.me/?text=') && !decodeURIComponent(comp.waSolo).includes(comp.codigo), '"Solo link" abre wa.me sin código');
  ok('Links sin query (?utm, ?code); "Link + código" se copia, nunca va a wa.me; "Solo link" a wa.me sin código');

  // ===== 5. Perfil con config simulada: login por link mágico (PKCE) =====
  await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(window,'AMIGO_SECRETO_CONFIG',{value:Object.freeze({supabaseUrl:'https://abcdefghijklmnop.supabase.co',supabaseAnonKey:'anon-de-prueba'}),writable:false});
    window.__llamadas=[]; const f0=window.fetch.bind(window); window.__fetchReal=f0;
    const db={listas:[],sorteos:[]}; let seq=0;
    const resp=(b,s=200)=>new Response(b===null?null:JSON.stringify(b),{status:s,headers:{'Content-Type':'application/json'}});
    window.fetch=async(u,o={})=>{ const url=String(u&&u.url||u); if(!url.includes('supabase.co')) return f0(u,o);
      const metodo=(o.method||'GET').toUpperCase(); let h={}; try{ h=o.headers instanceof Headers?Object.fromEntries(o.headers):(o.headers||{}); }catch(e){}
      window.__llamadas.push({url,metodo,body:o.body,headers:h});
      const uno=/vnd\\.pgrst\\.object/.test(h.Accept||h.accept||'');
      const m=url.match(/\\/rest\\/v1\\/(listas|sorteos)/);
      if(m){ const t=m[1];
        if(metodo==='GET') return resp(db[t]);
        if(metodo==='POST'){ const fila={id:'id-'+(++seq),...JSON.parse(o.body),updated_at:new Date().toISOString(),created_at:new Date().toISOString()}; db[t].push(fila); return uno?resp({id:fila.id},201):resp(null,201); }
        if(metodo==='PATCH'){ const id=decodeURIComponent(url).match(/id=eq\\.([^&]+)/)[1]; const f=db[t].find(x=>x.id===id); Object.assign(f,JSON.parse(o.body)); return resp({id},200); }
        if(metodo==='DELETE'){ db[t]=[]; return resp(null,204); } }
      return resp({}); };` });
  await ir(BASE + 'index.html');
  const login = await evaluar(`
    const $=id=>document.getElementById(id);
    const antes={barra:!$('barra-sesion').hidden, libAntes:!!window.supabase};
    $('btn-login').click();
    $('login-email').value='prueba@ejemplo.cl'; $('login-form').requestSubmit();
    for(let i=0;i<60 && $('login-msg').hidden;i++) await new Promise(r=>setTimeout(r,100));
    const otp=window.__llamadas.find(l=>l.url.includes('/auth/v1/otp'));
    const body=otp?JSON.parse(otp.body):{};
    let verifier=null; try{verifier=localStorage.getItem('amigo-secreto-auth-code-verifier')}catch(e){}
    return {...antes, libDespues:!!window.supabase, msg:$('login-msg').textContent, url:otp&&otp.url,
      email:body.email, challenge:body.code_challenge_method, tieneChallenge:!!body.code_challenge, verifier:!!verifier};`);
  assert.ok(login.barra && !login.libAntes && login.libDespues, 'carga perezosa');
  assert.match(login.msg, /Revisa tu correo/);
  assert.equal(login.email, 'prueba@ejemplo.cl'); assert.ok(login.tieneChallenge && /s256/i.test(login.challenge) && login.verifier, 'PKCE');
  assert.match(login.url, /redirect_to=http%3A%2F%2F127.0.0.1%3A8099%2Famigo-secreto%2F/);
  assert.deepEqual(consola.filter((c) => !/supabase\.co/.test(c)), [], 'consola: ' + consola);
  ok('Perfil: barra visible con config; supabase.js se carga solo al pulsar "Iniciar sesión"; OTP con PKCE (S256), verifier guardado');

  const cspCfg = await evaluar(`
    const v=[]; document.addEventListener('securitypolicyviolation',e=>v.push(e.blockedURI));
    try{await window.__fetchReal('https://abcdefghijklmnop.supabase.co/rest/v1/')}catch(e){}
    try{await window.__fetchReal('https://otroproyectoatacante.supabase.co/x')}catch(e){}
    await new Promise(r=>setTimeout(r,500)); return v;`);
  assert.ok(!cspCfg.some((u) => u.includes('abcdefghijklmnop')), 'permite el proyecto configurado');
  assert.ok(cspCfg.some((u) => u.includes('otroproyectoatacante')), 'bloquea otros proyectos supabase');
  ok('CSP con config: solo el proyecto exacto de config.js; otro *.supabase.co bloqueado');

  // ===== 5b. Sesión simulada: guardar lista, sortear, perfil, salir =====
  await evaluar(`
    const b64=o=>btoa(JSON.stringify(o)).replace(/=+$/,'');
    const exp=Math.floor(Date.now()/1000)+3600;
    const jwt=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:'u1',exp,role:'authenticated',email:'jorge@ejemplo.cl'})+'.firma';
    localStorage.clear();
    localStorage.setItem('amigo-secreto-auth', JSON.stringify({access_token:jwt,token_type:'bearer',expires_in:3600,expires_at:exp,refresh_token:'r',
      user:{id:'u1',email:'jorge@ejemplo.cl',aud:'authenticated',role:'authenticated'}}));`);
  await ir(BASE);
  const flujo = await evaluar(`
    const $=id=>document.getElementById(id); const esperar=async(f,ms=6000)=>{const t=Date.now();while(!f()){if(Date.now()-t>ms)throw new Error('timeout '+f);await new Promise(r=>setTimeout(r,50));}};
    await esperar(()=>!$('sesion-info').hidden);
    const out={email:$('sesion-email').textContent, misListas:!$('mis-listas-card').hidden, loginOculto:$('btn-login').hidden};
    $('nombres').value='Ana\\nBeto\\nCaro\\nDani'; $('nombres').dispatchEvent(new Event('input'));
    $('exc-a').value='Ana'; $('exc-b').value='Beto'; $('exc-agregar').click(); $('ev-lugar').value='Casa';
    $('lista-nombre').value='Familia'; $('btn-guardar-lista').click();
    await esperar(()=>/guardada/.test($('listas-msg').textContent));
    const post=window.__llamadas.find(l=>l.metodo==='POST'&&l.url.includes('/rest/v1/listas'));
    out.bodyLista=JSON.parse(post.body); out.opciones=[...$('sel-lista').options].map(o=>o.textContent);
    $('btn-guardar-lista').click(); await new Promise(r=>setTimeout(r,800));
    out.segundoGuardadoEsPatch=window.__llamadas.some(l=>l.metodo==='PATCH'&&l.url.includes('id=eq.id-1'));
    $('btn-sortear').click();
    await esperar(()=>window.__llamadas.some(l=>l.url.includes('/rest/v1/sorteos')&&l.metodo==='POST'));
    const d=JSON.parse(localStorage.getItem('amigo-secreto:ultimo'));
    out.bodySorteo=JSON.parse(window.__llamadas.find(l=>l.url.includes('/rest/v1/sorteos')&&l.metodo==='POST').body);
    const todo=JSON.stringify(window.__llamadas.map(l=>[l.url,l.body]));
    out.fuga=d.links.some(l=>todo.includes(l.codigo)||todo.includes(l.url.split('#')[1].slice(0,40)));
    $('btn-perfil').click(); await esperar(()=>$('perfil-historial').textContent.length>0);
    out.tablaPerfil=$('perfil-listas').innerText.replace(/\\s+/g,' ').trim(); out.historial=$('perfil-historial').innerText.replace(/\\s+/g,' ').trim();
    $('btn-salir').click(); await esperar(()=>!$('btn-login').hidden);
    out.trasSalir={misListas:$('mis-listas-card').hidden, panel:$('panel-perfil').hidden, sesion:localStorage.getItem('amigo-secreto-auth')};
    return out;`);
  assert.equal(flujo.email, 'jorge@ejemplo.cl'); assert.ok(flujo.misListas && flujo.loginOculto);
  assert.deepEqual(flujo.bodyLista, { nombre: 'Familia', participantes: ['Ana', 'Beto', 'Caro', 'Dani'], exclusiones: [['Ana', 'Beto']], evento: { lugar: 'Casa' } });
  assert.ok(flujo.opciones.includes('Familia (4)')); assert.ok(flujo.segundoGuardadoEsPatch, 'guardar de nuevo actualiza');
  assert.deepEqual(flujo.bodySorteo, { lista_id: 'id-1', participantes: 4 }); assert.equal(flujo.fuga, false);
  assert.match(flujo.tablaPerfil, /Familia 4/); assert.match(flujo.historial, /Familia · 4 personas|Familia.*4 personas/);
  assert.deepEqual(flujo.trasSalir, { misListas: true, panel: true, sesion: null });
  assert.deepEqual(consola, [], 'consola: ' + consola);
  ok('Perfil con sesión: guarda lista (POST), re-guarda (PATCH), historial = {lista_id, participantes:4}, 0 fugas de links/códigos, perfil y salir OK');

  // ===== 5c. Link de login vencido: Supabase vuelve con #error=… =====
  await evaluar(`try{localStorage.clear()}catch(e){} return true;`);
  await ir(BASE + 'index.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  const venc = await evaluar(`const $=id=>document.getElementById(id);
    return { org: !$('vista-organizador').hidden, card: !$('login-card').hidden, msg: $('login-msg').textContent,
      hash: location.hash, libCargada: !!window.supabase };`);
  assert.ok(venc.org && venc.card, 'organizador con tarjeta de login');
  assert.match(venc.msg, /venció o ya se usó/);
  assert.equal(venc.hash, '', 'limpia el #error de la URL');
  assert.ok(!venc.libCargada, 'no carga supabase.js solo para mostrar el error');
  ok('Link vencido (#error=otp_expired): aviso claro, URL limpia, sin cargar Supabase');

  // ===== 6. Páginas auxiliares =====
  await ir(BASE + 'privacidad.html');
  const priv = await evaluar(`return {h1:document.querySelector('h1').textContent, css:getComputedStyle(document.body).backgroundColor}`);
  assert.equal(priv.h1, 'Política de privacidad'); assert.notEqual(priv.css, 'rgba(0, 0, 0, 0)');
  assert.deepEqual(consola, [], 'privacidad consola: ' + consola);
  ok('privacidad.html: carga estilos, consola limpia');

  await ir('http://127.0.0.1:8099/amigo-secreto/no-existe');
  const p404 = await evaluar("return {h1:document.querySelector('h1').textContent, css:getComputedStyle(document.body).backgroundColor, link:document.querySelector('main a').href}");
  assert.equal(p404.h1, 'Esta página no existe'); assert.notEqual(p404.css, 'rgba(0, 0, 0, 0)'); assert.match(p404.link, /amigo-secreto\/$/);
  ok('404.html: estilos y link al inicio OK');
  const m = await (await fetch(BASE + 'manifest.webmanifest')).json(); assert.equal(m.short_name, 'Amigo Secreto');
  const sm = await (await fetch(BASE + 'sitemap.xml')).text(); assert.match(sm, /<urlset/);
  ok('manifest.webmanifest y sitemap.xml válidos');

  console.log('\nOK — E2E completo');
} finally {
  ws.close(); edge.kill(); srv.close();
}
