// Servidor estático mínimo que imita GitHub Pages: sirve el proyecto en /amigo-secreto/ y 404.html en rutas inexistentes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const PREFIJO = '/amigo-secreto/';
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };

// opciones.sinConfig: sirve un config.js vacío (perfiles desactivados) para que el E2E no dependa del proyecto real.
const CONFIG_VACIA = "window.AMIGO_SECRETO_CONFIG = Object.freeze({ supabaseUrl: '', supabaseAnonKey: '' });\n";

export function iniciarServidor(puerto, opciones = {}) {
  const srv = createServer(async (req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let archivo = null;
    if (ruta === '/robots.txt' || ruta.startsWith(PREFIJO)) {
      let rel = ruta.startsWith(PREFIJO) ? ruta.slice(PREFIJO.length) : 'robots.txt';
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const abs = normalize(join(RAIZ, rel));
      if (abs.startsWith(normalize(RAIZ)) && !/node_modules|[\\/]\./.test(abs.slice(RAIZ.length))) archivo = abs;
    }
    try {
      if (!archivo) throw new Error('fuera');
      if (opciones.sinConfig && archivo === join(RAIZ, 'config.js')) {
        res.writeHead(200, { 'Content-Type': TIPOS['.js'] });
        return res.end(CONFIG_VACIA);
      }
      const datos = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' });
      res.end(datos);
    } catch {
      res.writeHead(404, { 'Content-Type': TIPOS['.html'] });
      res.end(await readFile(join(RAIZ, '404.html')));
    }
  });
  return new Promise((r) => srv.listen(puerto, '127.0.0.1', () => r(srv)));
}
