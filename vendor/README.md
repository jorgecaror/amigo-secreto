# vendor/

Librerías de terceros copiadas al repo. Así el sitio no depende de un CDN y la CSP puede limitarse a `script-src 'self'`.

| Archivo | Paquete | Versión | Origen | SHA-256 |
|---------|---------|---------|--------|---------|
| `supabase.js` | `@supabase/supabase-js` (UMD) | 2.45.4 | `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js` | `8596965fe918e656600a1b568d3a168f5c0d3d22a600886bb6f44a6555db01e7` |

Solo se carga en la vista del organizador y solo si hay sesión o se pulsa "Iniciar sesión" (`perfil.js`).

## Actualizar
```bash
V=2.x.y
curl -sSfL -o vendor/supabase.js "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@$V/dist/umd/supabase.js"
sha256sum vendor/supabase.js   # anotar en esta tabla
npm run test:e2e
```
