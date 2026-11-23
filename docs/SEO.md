# SEO — que encuentren la página

## Búsquedas objetivo
| Intención | Términos |
|-----------|----------|
| Principal | amigo secreto online, sorteo amigo secreto, amigo secreto gratis |
| Sinónimos regionales | amigo invisible (España), intercambio de regalos (México), amigo secreto navidad |
| Diferenciadores | amigo secreto por whatsapp, amigo secreto sin registro, sorteo amigo secreto con exclusiones |

Están en el `<title>`, `meta description`, H1, "Cómo funciona", beneficios y preguntas frecuentes. Las
preguntas frecuentes también van como datos estructurados `FAQPage`, y el test E2E verifica que coincidan
con el texto visible: si cambias una, cambia la otra.

## Qué está implementado
- `<title>` (≈70 car.) y `meta description` (144 car.), con un solo `<h1>`.
- `canonical`, Open Graph y Twitter Card con `img/og-image.png` (1200×630). Al compartir el link en
  WhatsApp o redes se ve una tarjeta.
- JSON-LD `WebApplication` (gratis, en español) + `FAQPage`.
- Contenido indexable debajo de la app. En la vista del participante se oculta.
- `robots.txt`, `sitemap.xml`, `manifest.webmanifest` (instalable), íconos y `404.html`.
- Página liviana y sin dependencias externas. supabase.js se carga solo si alguien inicia sesión.

## URL pública
`https://jorgecaror.github.io/amigo-secreto/` aparece en `index.html` (canonical, og:url, og:image, JSON-LD),
`privacidad.html` (canonical), `robots.txt` y `sitemap.xml`. Si cambias a dominio propio, actualízala en todos.

> En un sitio de proyecto (`usuario.github.io/amigo-secreto/`), los buscadores solo leen `robots.txt` en la raíz
> del dominio (`usuario.github.io/robots.txt`), no en la subcarpeta. Por eso el sitemap se envía a mano en Search
> Console. Con dominio propio, `robots.txt` sí queda en la raíz.

## Después de publicar
1. **Google Search Console** (<https://search.google.com/search-console>):
   - Agrega la propiedad con el prefijo de URL `https://jorgecaror.github.io/amigo-secreto/`.
   - Verifica con **etiqueta HTML**: agrega el `<meta name="google-site-verification" ...>` en el `<head>` de
     `index.html`. Es solo una meta, así que la CSP no la afecta.
   - **Sitemaps** → envía `sitemap.xml`.
   - **Inspección de URL** → "Solicitar indexación".
2. **Bing Webmaster Tools**: importa desde Search Console. También cubre DuckDuckGo y Yahoo.
3. Prueba los resultados enriquecidos en <https://search.google.com/test/rich-results>.
4. Prueba la tarjeta para redes pegando el link en WhatsApp.

## Para posicionar mejor (siguientes pasos)
- **Dominio propio** (ej. `amigosecreto.cl`): pesa bastante para el posicionamiento y la confianza. GitHub Pages
  lo soporta. Al migrar, actualiza `canonical`, el sitemap y Search Console, y en Supabase el Site URL y las
  Redirect URLs.
- **Temporada**: las búsquedas suben fuerte entre octubre y diciembre. Publica e indexa antes de octubre.
- **Enlaces entrantes**: compártela en foros, grupos y blogs de Navidad u organización de eventos.
- **Contenido extra** (opcional): páginas como "ideas de regalos por monto" o "reglas del amigo secreto" atraen
  búsquedas relacionadas.
