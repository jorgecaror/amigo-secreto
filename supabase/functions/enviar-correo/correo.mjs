// Lógica pura de la Edge Function `enviar-correo` (D20, D21): validación y plantillas de correo.
// Sin APIs de Deno ni de Node: se usa desde index.ts (Deno) y desde las pruebas (Node).
// También genera las plantillas de login de Supabase (supabase/correos/), para que los tres correos compartan diseño.

export const MAX_ITEMS = 100;
export const MAX_LARGO_URL = 1500;
const MAX_LARGO_NOMBRE = 60;
const RE_CODIGO = /^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/;
const RE_EMAIL = /^[^\s@,;<>"'()\\]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const COLORES = {
  fondo: '#f6f3ee', tarjeta: '#ffffff', texto: '#1f2328', suave: '#646b73', borde: '#e3ddd3',
  acento: '#b3261e', acentoTexto: '#ffffff', caja: '#f1ece4'
};

export function escaparHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function escaparRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deBase64Url(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// Nombre de quien regala, leído de la parte pública del link (v3: utf8; v2: JSON {v,d,i}). null si no es válido.
// El correo usa este nombre y no uno enviado aparte: así no se puede poner texto arbitrario en el correo.
export function nombreDelLink(hash) {
  try {
    const [v, pub] = hash.split('.');
    const bytes = deBase64Url(pub);
    let nombre;
    if (v === '3') nombre = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    else {
      const o = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!o || o.v !== 2 || typeof o.d !== 'string') return null;
      nombre = o.d;
    }
    nombre = nombre.trim();
    // eslint-disable-next-line no-control-regex
    if (!nombre || nombre.length > MAX_LARGO_NOMBRE || /[\u0000-\u001f\u007f]/.test(nombre)) return null;
    return nombre;
  } catch {
    return null;
  }
}

// body: { items: [{ email, url, codigo }] }, sitios: URLs base permitidas (ej. 'https://x.github.io/amigo-secreto/')
// -> { items: [{ email, url, codigo, nombre }] } o { error }
export function validarEnvio(body, sitios) {
  const items = body && body.items;
  if (!Array.isArray(items) || items.length < 1) return { error: 'No hay correos para enviar.' };
  if (items.length > MAX_ITEMS) return { error: 'Se pueden enviar hasta ' + MAX_ITEMS + ' correos a la vez.' };
  if (!Array.isArray(sitios) || !sitios.length) return { error: 'Servicio de correo no configurado.' };
  const reUrl = new RegExp('^(?:' + sitios.map(escaparRegex).join('|') + ')(?:index\\.html)?#([23]\\.[A-Za-z0-9_-]{1,400}\\.[A-Za-z0-9_-]{40,1200})$');
  const limpios = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') return { error: 'Datos inválidos.' };
    const email = typeof it.email === 'string' ? it.email.trim() : '';
    const url = typeof it.url === 'string' ? it.url : '';
    const codigo = typeof it.codigo === 'string' ? it.codigo.trim().toUpperCase() : '';
    if (email.length > 254 || !RE_EMAIL.test(email)) return { error: 'Correo inválido: ' + email.slice(0, 80) };
    const m = url.length <= MAX_LARGO_URL && url.match(reUrl);
    if (!m) return { error: 'Link inválido: solo se envían links de este sitio.' };
    if (!RE_CODIGO.test(codigo)) return { error: 'Código inválido.' };
    const nombre = nombreDelLink(m[1]);
    if (!nombre) return { error: 'Link inválido.' };
    limpios.push({ email, url, codigo, nombre });
  }
  return { items: limpios };
}

// ---------- Diseño común de los correos ----------
// Tablas + estilos inline (Gmail, Outlook, Apple Mail). Ancho máx. 560 px. Modo oscuro: los clientes que lo
// soportan usan el bloque <style>; el resto muestra la versión clara, que es legible al invertirse.
function boton(href, texto) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:8px auto 4px">
  <tr><td align="center" bgcolor="${COLORES.acento}" style="border-radius:10px">
    <a href="${href}" target="_blank" class="boton" style="display:inline-block;padding:15px 30px;font:700 17px/1.2 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${COLORES.acentoTexto};text-decoration:none;border-radius:10px;background:${COLORES.acento}">${texto}</a>
  </td></tr>
</table>`;
}

// href: ya escapado (o una variable de plantilla de Supabase). cuerpo: HTML ya escapado.
function envolver({ titulo, preheader, cuerpo, pie, sitioUrl }) {
  const s = COLORES;
  const fuente = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${titulo}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .fondo { background:#16181b !important; }
    .tarjeta { background:#1f2226 !important; border-color:#33373d !important; }
    .texto { color:#e8e6e3 !important; }
    .suave { color:#a0a6ad !important; }
    .caja { background:#272a2f !important; border-color:#33373d !important; }
    .codigo { color:#ffffff !important; }
  }
  @media (max-width: 600px) { .pad { padding:24px 20px !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${s.fondo}" class="fondo">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" class="fondo" style="background:${s.fondo}">
<tr><td align="center" style="padding:28px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 14px;font:800 20px/1.2 ${fuente};color:${s.acento}">🎁 Amigo Secreto</td></tr>
    <tr><td class="tarjeta" style="background:${s.tarjeta};border:1px solid ${s.borde};border-radius:16px;overflow:hidden">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td style="height:6px;background:${s.acento};font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td class="pad texto" style="padding:32px 36px;font:16px/1.55 ${fuente};color:${s.texto}">
${cuerpo}
        </td></tr>
      </table>
    </td></tr>
    <tr><td class="suave" align="center" style="padding:18px 16px 0;font:12px/1.5 ${fuente};color:${s.suave}">
      ${pie}<br>
      <a href="${sitioUrl}" style="color:${s.suave}">Amigo Secreto</a> · <a href="${sitioUrl}privacidad.html" style="color:${s.suave}">Privacidad</a>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>
`;
}

function parrafo(html, extra = '') {
  return `<p class="texto" style="margin:0 0 16px;${extra}">${html}</p>`;
}

function respaldo(href) {
  return `<p class="suave" style="margin:20px 0 0;font-size:13px;color:${COLORES.suave}">¿No funciona el botón? Copia este link en tu navegador:<br>
<a href="${href}" style="color:${COLORES.acento};word-break:break-all">${href}</a></p>`;
}

// Correo al participante. Todo lo variable se escapa. -> { asunto, html, texto }
export function construirCorreo({ nombre, url, codigo, organizador, sitioUrl }) {
  const n = escaparHtml(nombre), u = escaparHtml(url), c = escaparHtml(codigo), o = escaparHtml(organizador || '');
  const cuerpo = [
    `<h1 class="texto" style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${COLORES.texto}">¡Hola, ${n}! 🎄</h1>`,
    parrafo(`Ya se hizo el sorteo del amigo secreto${o ? ` que organizó <strong>${o}</strong>` : ''}. Toca el botón para descubrir a quién le regalas.`),
    boton(u, 'Ver mi amigo secreto'),
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 6px">
  <tr><td class="caja" align="center" style="background:${COLORES.caja};border:1px dashed ${COLORES.borde};border-radius:12px;padding:16px">
    <div class="suave" style="font-size:13px;color:${COLORES.suave};margin-bottom:4px">Tu código secreto</div>
    <div class="codigo" style="font:700 28px/1.2 ui-monospace,'Cascadia Mono',Consolas,Menlo,monospace;letter-spacing:4px;color:${COLORES.texto}">${c}</div>
  </td></tr>
</table>`,
    parrafo('Al abrir el link, escribe este código para ver tu resultado.', 'margin-top:14px'),
    parrafo(`🤫 <strong>No reenvíes este correo:</strong> con el link y el código cualquiera puede ver a quién le regalas.`, `font-size:14px;color:${COLORES.suave}`),
    respaldo(u)
  ].join('\n');
  const pie = `Recibiste este correo porque ${o || 'alguien'} te incluyó en un sorteo de amigo secreto.` +
    (o ? ' Si respondes, le llega a quien lo organizó.' : '');
  return {
    asunto: `🎁 ${nombre}, ya puedes ver tu amigo secreto`,
    html: envolver({ titulo: 'Tu amigo secreto', preheader: `Tu código secreto es ${c}. Toca el botón para ver a quién le regalas.`, cuerpo, pie, sitioUrl: escaparHtml(sitioUrl) }),
    texto: `¡Hola, ${nombre}!\n\nYa se hizo el sorteo del amigo secreto${organizador ? ' que organizó ' + organizador : ''}.\n\n` +
      `Abre tu link: ${url}\nTu código secreto: ${codigo}\n\nNo reenvíes este correo: con el link y el código cualquiera puede ver a quién le regalas.\n`
  };
}

// Plantillas de login para Supabase (Authentication → Emails). {{ .ConfirmationURL }} la reemplaza Supabase.
export function plantillaLogin({ sitioUrl, registro }) {
  const href = '{{ .ConfirmationURL }}';
  const titulo = registro ? 'Confirma tu cuenta' : 'Entrar a Amigo Secreto';
  const cuerpo = [
    `<h1 class="texto" style="margin:0 0 12px;font-size:24px;line-height:1.25;color:${COLORES.texto}">${registro ? '¡Te damos la bienvenida! 👋' : 'Tu link para entrar 🔑'}</h1>`,
    parrafo(registro
      ? 'Confirma tu correo para crear tu cuenta en Amigo Secreto. Con ella puedes guardar tus listas y enviar los resultados por correo.'
      : 'Toca el botón para iniciar sesión en Amigo Secreto. No necesitas contraseña.'),
    boton(href, registro ? 'Confirmar y entrar' : 'Iniciar sesión'),
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0 4px">
  <tr><td class="caja" style="background:${COLORES.caja};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.5;color:${COLORES.texto}">
    <span class="texto">📱 <strong>Ábrelo en el mismo navegador</strong> donde lo pediste (por seguridad no funciona en otro).<br>
    ⏱️ El link vence en 1 hora y sirve una sola vez.</span>
  </td></tr>
</table>`,
    respaldo(href)
  ].join('\n');
  return envolver({
    titulo,
    preheader: registro ? 'Confirma tu correo para empezar a usar Amigo Secreto.' : 'Tu link para iniciar sesión. Vence en 1 hora.',
    cuerpo,
    pie: 'Si no pediste este correo, ignóralo: nadie podrá entrar sin abrir este link.',
    sitioUrl: escaparHtml(sitioUrl)
  });
}

export const ASUNTOS_LOGIN = {
  magicLink: '🔑 Tu link para entrar a Amigo Secreto',
  confirmacion: '👋 Confirma tu cuenta de Amigo Secreto'
};
