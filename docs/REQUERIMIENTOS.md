# Requerimientos — Amigo Secreto

## Solicitud original (2026-11-23)
> Necesito crear una plataforma para realizar una distribución del clásico "amigo secreto" donde se
> ingresa una lista de personas, a una de estas personas les puede salir cualquiera de esa lista
> (excepto ella misma) como persona que debe realizar un regalo. Nadie puede saber a quién le tocó el
> otro, y no se pueden repetir las personas, es decir, que no puede salir 2 veces una persona. Todas
> deben quedar con una persona para regalar. [...] la cual debo compartir con las personas para que
> vean a quién le tocó cada una. [...] Puede ser algo super sencillo, busco lo funcional.

## Requerimientos funcionales
| ID | Requerimiento | Estado |
|----|---------------|--------|
| RF1 | Ingresar una lista de participantes (mínimo 3, sin repetidos) | Hecho |
| RF2 | Nadie puede regalarse a sí mismo | Hecho |
| RF3 | Cada persona aparece exactamente una vez como receptor (todos dan y todos reciben) | Hecho |
| RF4 | Cada participante ve **solo** a quién le toca a él/ella | Hecho (link personal) |
| RF5 | El organizador también participa y no ve resultados ajenos | Hecho |
| RF6 | Exclusiones: pares que no pueden tocarse entre sí (ej. parejas) | Hecho |
| RF7 | Datos del evento (monto máximo, fecha, lugar, mensaje) visibles junto al resultado | Hecho |
| RF8 | Recuperar el link de alguien que lo perdió, sin re-sortear | Hecho (localStorage del organizador) |
| RF9 | Compartir fácil: copiar link / enviar por WhatsApp | Hecho |
| RF10 | Ningún extraño puede ver el resultado ni el evento de otro: cifrado con código por persona (D10) | Hecho |
| RF11 | El organizador elige si envía el código junto al link o por separado | Hecho |
| RF12 | Que la página se encuentre al buscar "amigo secreto online" y similares (SEO) | Hecho (falta publicar + Search Console) |
| RF13 | Perfil opcional (link mágico por correo) para guardar y reutilizar listas | Hecho (falta crear proyecto Supabase) |
| RF14 | Historial de sorteos en el perfil, sin resultados | Hecho |
| RF15 | El usuario puede borrar sus datos y eliminar su cuenta | Hecho |
| RF16 | Máximo 100 participantes y 60 caracteres por nombre | Hecho |

## Requerimientos no funcionales
- Simple: sin backend propio. Sortear no requiere cuenta; la base de datos (Supabase) es solo para perfiles opcionales.
- Se abre desde el celular sin instalar nada.
- Publicable gratis (GitHub Pages).
- Aleatoriedad con `crypto.getRandomValues` (no `Math.random`).

## Fuera de alcance (por ahora)
- Protección frente a un organizador curioso: ve los códigos (ver D10 en `DECISIONES.md`).
- Envío automático por correo.
- Lista de deseos de cada participante.
- Guardar resultados, links o códigos en la base de datos (D14).
