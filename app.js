/*
 * UI del amigo secreto. Usa window.Sorteo (sorteo.js).
 * Sin hash -> vista organizador. Con hash -> vista participante. Ver docs/DECISIONES.md.
 */
(function () {
  'use strict';
  var STORAGE_KEY = 'amigo-secreto:ultimo';
  var STORAGE_VERSION = 2;
  var INTENTOS_LIBRES = 5;
  var ESPERA_BASE_MS = 30000;
  var $ = function (id) { return document.getElementById(id); };
  var exclusiones = []; // [[a, b], ...]

  // ---------- Almacenamiento (puede fallar en modo privado) ----------
  function leerLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function escribirLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function borrarLS(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else if (k === 'onclick') n.onclick = props[k]; else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function formatearFecha(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso;
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function copiar(texto) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(texto);
    return new Promise(function (ok, fail) {
      var t = el('textarea', {}); t.value = texto; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { if (document.execCommand('copy')) ok(); else fail(); } catch (e) { fail(e); }
      document.body.removeChild(t);
    });
  }

  // ======================= ORGANIZADOR =======================
  function nombresActuales() { return Sorteo.validarNombres($('nombres').value).nombres; }

  function refrescarExclusiones() {
    var nombres = nombresActuales();
    var claves = nombres.map(Sorteo.normalizar);
    $('conteo').textContent = nombres.length + (nombres.length === 1 ? ' participante' : ' participantes');
    exclusiones = exclusiones.filter(function (p) {
      return claves.indexOf(Sorteo.normalizar(p[0])) !== -1 && claves.indexOf(Sorteo.normalizar(p[1])) !== -1;
    });
    ['exc-a', 'exc-b'].forEach(function (id) {
      var sel = $(id), previo = sel.value;
      sel.innerHTML = '';
      sel.appendChild(el('option', { value: '', text: 'Elegir…' }));
      nombres.forEach(function (n) { sel.appendChild(el('option', { value: n, text: n })); });
      if (nombres.indexOf(previo) !== -1) sel.value = previo;
    });
    var ul = $('exc-lista');
    ul.innerHTML = '';
    exclusiones.forEach(function (p, i) {
      ul.appendChild(el('li', {}, [
        el('span', { text: p[0] + ' ↔ ' + p[1] }),
        el('button', { type: 'button', text: 'Quitar', onclick: function () { exclusiones.splice(i, 1); refrescarExclusiones(); } })
      ]));
    });
  }

  function agregarExclusion() {
    var a = $('exc-a').value, b = $('exc-b').value;
    if (!a || !b || a === b) return;
    var ya = exclusiones.some(function (p) { return (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a); });
    if (!ya) exclusiones.push([a, b]);
    $('exc-a').value = ''; $('exc-b').value = '';
    refrescarExclusiones();
  }

  function leerEvento() {
    var ev = {};
    [['monto', 'ev-monto'], ['fecha', 'ev-fecha'], ['lugar', 'ev-lugar'], ['mensaje', 'ev-mensaje']].forEach(function (x) {
      var v = $(x[1]).value.trim();
      if (v) ev[x[0]] = v;
    });
    return ev;
  }

  function mostrarErrores(lista) {
    var box = $('errores');
    box.hidden = !lista.length;
    box.innerHTML = '';
    lista.forEach(function (t) { box.appendChild(el('div', { text: '⚠️ ' + t })); });
  }

  async function sortear() {
    var v = Sorteo.validarNombres($('nombres').value);
    if (v.errores.length) return mostrarErrores(v.errores);
    var res = Sorteo.sortear(v.nombres, exclusiones);
    if (!res) return mostrarErrores(['Con estas exclusiones no es posible armar el sorteo. Quita alguna exclusión e intenta de nuevo.']);
    mostrarErrores([]);

    var btn = $('btn-sortear');
    btn.disabled = true;
    var evento = leerEvento();
    // Sin query (?utm, ?code=…) ni hash: solo origen + ruta (SEGURIDAD.md H5). Vale también para file://.
    var base = location.href.split(/[?#]/)[0];
    var links = [];
    // Relleno común a todos los links del sorteo (D19): el largo del link no depende del receptor.
    var relleno = Sorteo.rellenoPara(v.nombres);
    try {
      for (var i = 0; i < res.length; i++) {
        btn.textContent = '🔒 Cifrando ' + (i + 1) + ' de ' + res.length + '…';
        var codigo = Sorteo.generarCodigo();
        var hash = await Sorteo.codificar({ da: res[i].da, recibe: res[i].recibe, evento: evento }, codigo, { relleno: relleno });
        links.push({ nombre: res[i].da, url: base + '#' + hash, codigo: codigo, enviado: false });
      }
    } catch (e) {
      mostrarErrores(['No se pudo cifrar en este navegador. Abre la página desde https (GitHub Pages) o usa un navegador actualizado.']);
      return;
    } finally {
      res = null; // no conservar el resultado en memoria
      btn.disabled = false;
      btn.textContent = '🎲 Sortear';
    }

    var datos = {
      version: STORAGE_VERSION,
      creado: new Date().toISOString(),
      nombres: v.nombres,
      exclusiones: exclusiones.slice(),
      evento: evento,
      links: links
    };
    escribirLS(STORAGE_KEY, datos);
    mostrarResultado(datos);
    // Para el perfil (perfil.js): solo la cantidad, nunca resultados, links ni códigos.
    document.dispatchEvent(new CustomEvent('sorteo-realizado', { detail: { participantes: links.length } }));
  }

  // ---------- Ganchos para perfil.js ----------
  function obtenerFormulario() {
    return { participantes: nombresActuales(), exclusiones: exclusiones.map(function (p) { return p.slice(); }), evento: leerEvento() };
  }

  // Devuelve false si hay un sorteo en pantalla (hay que hacer "Nuevo sorteo" antes).
  function cargarFormulario(lista) {
    if ($('form-sorteo').hidden) return false;
    $('nombres').value = (lista.participantes || []).join('\n');
    exclusiones = (lista.exclusiones || []).filter(function (p) {
      return Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string';
    }).map(function (p) { return p.slice(); });
    var ev = lista.evento || {};
    $('ev-monto').value = ev.monto || ''; $('ev-fecha').value = ev.fecha || '';
    $('ev-lugar').value = ev.lugar || ''; $('ev-mensaje').value = ev.mensaje || '';
    mostrarErrores([]);
    refrescarExclusiones();
    return true;
  }

  function mostrarResultado(datos) {
    $('form-sorteo').hidden = true;
    $('resultado').hidden = false;
    $('res-info').textContent = datos.links.length + ' participantes · sorteado el ' +
      new Date(datos.creado).toLocaleString('es') +
      (datos.exclusiones.length ? ' · ' + datos.exclusiones.length + ' exclusión(es)' : '');
    var ul = $('links');
    ul.innerHTML = '';
    datosActuales = datos;
    filasCorreo = [];
    mostrarMsgCorreo('');
    $('btn-correo-todos').onclick = function () {
      var pendientes = filasCorreo.filter(function (f) { return f.leerEmail(); });
      if (!pendientes.length) return mostrarMsgCorreo('Escribe el correo de al menos una persona.', true);
      enviarPorCorreo(pendientes);
    };
    datos.links.forEach(function (l) {
      var estado = el('span', { class: 'done', text: l.correoEnviado ? '✓ correo enviado' : l.enviado ? '✓ enviado' : '' });
      var marcar = function (texto) {
        l.enviado = true; estado.className = 'done'; estado.textContent = texto || '✓ enviado';
        escribirLS(STORAGE_KEY, datos);
      };

      function botonCopiar(etiqueta, valor, queEs) {
        var b = el('button', { type: 'button', text: etiqueta });
        b.onclick = function () {
          copiar(valor).then(function () { b.textContent = '✓ Copiado'; marcar(); },
            function () { window.prompt('Copia ' + queEs + ' de ' + l.nombre + ':', valor); marcar(); });
        };
        return b;
      }
      // Compartir (D17): primero el menú nativo del sistema (navigator.share), que entrega el texto directo a la
      // app sin pasar por una URL web. Si no existe:
      //  - "solo link": se abre wa.me (el link sin código no sirve para descifrar);
      //  - "link + código": NUNCA por wa.me (la URL con link y código llegaría a servidores de Meta y quedaría
      //    en el historial del navegador); se copia el mensaje para pegarlo en WhatsApp.
      function botonCompartir(etiqueta, mensaje, incluyeCodigo) {
        var b = el('button', { type: 'button', text: etiqueta });
        b.onclick = function () {
          if (navigator.share) {
            navigator.share({ text: mensaje }).then(marcar, function (e) {
              if (e && e.name === 'AbortError') return; // el usuario canceló
              copiarMensaje();
            });
          } else if (!incluyeCodigo) {
            window.open('https://wa.me/?text=' + encodeURIComponent(mensaje), '_blank', 'noopener,noreferrer');
            marcar();
          } else {
            copiarMensaje();
          }
        };
        function copiarMensaje() {
          copiar(mensaje).then(function () { b.textContent = '✓ Copiado: pégalo en WhatsApp'; marcar(); },
            function () { window.prompt('Copia este mensaje para ' + l.nombre + ':', mensaje); marcar(); });
        }
        return b;
      }

      var msgSoloLink = 'Hola ' + l.nombre + '! 🎁 Este es tu link del amigo secreto: ' + l.url +
        '\n\nTe mando tu código por separado. No compartas el link ni el código con nadie.';
      var msgConCodigo = 'Hola ' + l.nombre + '! 🎁 Este es tu link del amigo secreto: ' + l.url +
        '\n\nTu código es: ' + l.codigo + '\nNo compartas este mensaje con nadie.';

      // Correo (D20): el correo de cada persona queda solo en este navegador (localStorage), nunca en la base.
      var inputEmail = el('input', { type: 'email', class: 'correo-input', maxlength: '254', autocomplete: 'off',
        placeholder: 'Correo de ' + l.nombre + ' (opcional)', 'aria-label': 'Correo de ' + l.nombre });
      inputEmail.value = l.email || '';
      inputEmail.addEventListener('change', function () {
        var v = inputEmail.value.trim();
        if (v) l.email = v; else delete l.email;
        escribirLS(STORAGE_KEY, datos);
      });
      var botonCorreo = el('button', { type: 'button', text: '✉️ Correo' });
      var fila = {
        link: l, boton: botonCorreo, input: inputEmail,
        leerEmail: function () { return inputEmail.value.trim(); },
        resultado: function (ok, error) {
          if (ok) { l.correoEnviado = true; marcar('✓ correo enviado'); return; }
          estado.className = 'err-inline'; estado.textContent = '⚠️ ' + (error || 'No se pudo enviar');
        }
      };
      filasCorreo.push(fila);
      botonCorreo.onclick = function () {
        if (!fila.leerEmail()) { inputEmail.focus(); return mostrarMsgCorreo('Escribe el correo de ' + l.nombre + '.', true); }
        enviarPorCorreo([fila]);
      };

      ul.appendChild(el('li', {}, [
        el('div', { class: 'fila-top' }, [
          el('span', {}, [el('span', { class: 'who', text: l.nombre + ' ' }), estado]),
          el('code', { class: 'codigo', title: 'Código de ' + l.nombre, text: l.codigo })
        ]),
        el('div', { class: 'actions' }, [
          botonCopiar('📋 Link', l.url, 'el link'),
          botonCopiar('📋 Código', l.codigo, 'el código'),
          botonCompartir('💬 Solo link', msgSoloLink, false),
          botonCompartir('💬 Link + código', msgConCodigo, true)
        ]),
        el('div', { class: 'fila-correo solo-correo' }, [inputEmail, botonCorreo])
      ]));
    });
  }

  // ---------- Envío por correo (D20) ----------
  // app.js no habla con Supabase: usa window.AmigoSecretoCorreo, que define perfil.js solo si hay config.
  // Los links y códigos salen del navegador únicamente aquí, tras un clic explícito del organizador.
  var filasCorreo = [];
  var datosActuales = null;
  var LOTE_CORREO = 10;
  var enviandoCorreo = false;

  function mostrarMsgCorreo(texto, esError) {
    var m = $('correo-msg');
    m.textContent = texto || '';
    m.hidden = !texto;
    m.className = esError ? 'err' : 'hint';
  }

  async function enviarPorCorreo(filas) {
    var api = window.AmigoSecretoCorreo;
    if (!api || enviandoCorreo) return;
    var malos = filas.filter(function (f) { return !/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(f.leerEmail()); });
    if (malos.length) {
      malos[0].input.focus();
      return mostrarMsgCorreo('Revisa el correo de ' + malos.map(function (f) { return f.link.nombre; }).join(', ') + '.', true);
    }
    filas.forEach(function (f) { f.link.email = f.leerEmail(); });
    enviandoCorreo = true;
    var botones = filasCorreo.map(function (f) { return f.boton; }).concat([$('btn-correo-todos')]);
    botones.forEach(function (b) { b.disabled = true; });
    var enviados = 0, fallidos = 0;
    try {
      for (var i = 0; i < filas.length; i += LOTE_CORREO) {
        var lote = filas.slice(i, i + LOTE_CORREO);
        mostrarMsgCorreo('✉️ Enviando ' + (i + 1) + '–' + (i + lote.length) + ' de ' + filas.length + '…');
        var res = await api.enviar(lote.map(function (f) {
          return { email: f.link.email, url: f.link.url, codigo: f.link.codigo };
        }));
        lote.forEach(function (f, k) {
          var r = res[k] || {};
          f.resultado(!!r.ok, r.error);
          if (r.ok) enviados++; else fallidos++;
        });
      }
      mostrarMsgCorreo(fallidos
        ? 'Se enviaron ' + enviados + ' correo(s); ' + fallidos + ' fallaron. Revisa esos correos e intenta de nuevo.'
        : '✓ ' + (enviados === 1 ? 'Correo enviado.' : 'Se enviaron ' + enviados + ' correos.') + ' Pide que revisen también la carpeta de spam.', !!fallidos);
    } catch (e) {
      if (e && e.message === 'sin-sesion') {
        mostrarMsgCorreo('Para enviar por correo tienes que iniciar sesión (es gratis y sin contraseña). Tus correos escritos quedan guardados.', true);
        if (api.pedirLogin) api.pedirLogin();
      } else {
        mostrarMsgCorreo((enviados ? 'Se enviaron ' + enviados + ' correo(s), pero ' : '') +
          ((e && e.message) || 'No se pudo enviar. Intenta de nuevo.'), true);
      }
    } finally {
      enviandoCorreo = false;
      botones.forEach(function (b) { b.disabled = false; });
      if (datosActuales) escribirLS(STORAGE_KEY, datosActuales);
    }
  }

  function nuevoSorteo() {
    if (!confirm('¿Hacer un nuevo sorteo? Los links y códigos enviados antes dejarán de valer para el nuevo sorteo.')) return;
    var previo = leerLS(STORAGE_KEY);
    borrarLS(STORAGE_KEY);
    if (previo) {
      $('nombres').value = (previo.nombres || []).join('\n');
      exclusiones = previo.exclusiones || [];
      var ev = previo.evento || {};
      $('ev-monto').value = ev.monto || ''; $('ev-fecha').value = ev.fecha || '';
      $('ev-lugar').value = ev.lugar || ''; $('ev-mensaje').value = ev.mensaje || '';
    }
    refrescarExclusiones();
    $('resultado').hidden = true;
    $('form-sorteo').hidden = false;
  }

  function iniciarOrganizador() {
    $('vista-participante').hidden = true;
    $('vista-organizador').hidden = false;
    // No tocar document.title: el <title> del HTML es el título SEO.
    $('nombres').addEventListener('input', refrescarExclusiones);
    $('exc-agregar').onclick = agregarExclusion;
    $('btn-sortear').onclick = sortear;
    $('btn-nuevo').onclick = nuevoSorteo;
    refrescarExclusiones();
    var previo = leerLS(STORAGE_KEY);
    if (previo && previo.version !== STORAGE_VERSION) { borrarLS(STORAGE_KEY); previo = null; }
    if (previo && previo.links && previo.links.length) mostrarResultado(previo);
  }

  // ======================= PARTICIPANTE =======================
  // Freno de interfaz ante intentos repetidos (la protección real es PBKDF2 + código).
  function claveIntentos(pub) { return 'amigo-secreto:intentos:' + pub.id; }

  function esperaRestante(estado) {
    return estado && estado.hasta ? Math.max(0, estado.hasta - Date.now()) : 0;
  }

  // La vista participante no necesita red: se agrega una CSP extra (se intersecta con la del <meta>).
  function bloquearRed() {
    var m = document.createElement('meta');
    m.httpEquiv = 'Content-Security-Policy';
    m.content = "connect-src 'none'";
    document.head.appendChild(m);
  }

  function iniciarParticipante(hash) {
    bloquearRed();
    document.body.classList.add('modo-participante');
    $('vista-organizador').hidden = true;
    $('vista-participante').hidden = false;
    var pub = Sorteo.leerPublico(hash);
    $('p-confirmar').hidden = !pub;
    $('p-resultado').hidden = true;
    $('p-error').hidden = !!pub;
    if (!pub) return;

    document.title = 'Amigo Secreto de ' + pub.da;
    $('p-nombre').textContent = pub.da;
    var btn = $('btn-revelar'), input = $('p-codigo'), msg = $('p-msg');
    var kIntentos = claveIntentos(pub);
    var temporizador = null;

    function mostrarMsg(t) { msg.textContent = t; msg.hidden = !t; }

    function actualizarBloqueo() {
      clearTimeout(temporizador);
      var ms = esperaRestante(leerLS(kIntentos));
      if (ms > 0) {
        btn.disabled = true;
        mostrarMsg('Demasiados intentos. Espera ' + Math.ceil(ms / 1000) + ' s para volver a intentar.');
        temporizador = setTimeout(actualizarBloqueo, 1000);
      } else {
        btn.disabled = false;
        if (msg.dataset.bloqueo) { mostrarMsg(''); delete msg.dataset.bloqueo; }
      }
      if (ms > 0) msg.dataset.bloqueo = '1';
    }

    async function revelar(ev) {
      if (ev) ev.preventDefault();
      if (btn.disabled) return;
      var codigo = input.value;
      if (Sorteo.normalizarCodigo(codigo).length !== Sorteo.LARGO_CODIGO) {
        mostrarMsg('El código tiene ' + Sorteo.LARGO_CODIGO + ' caracteres (ej: K7P-Q2M).');
        return;
      }
      btn.disabled = true;
      btn.textContent = '🔓 Verificando…';
      var d = await Sorteo.decodificar(hash, codigo);
      btn.textContent = 'Revelar';
      if (!d) {
        var est = leerLS(kIntentos) || { fallos: 0 };
        est.fallos += 1;
        if (est.fallos >= INTENTOS_LIBRES) est.hasta = Date.now() + ESPERA_BASE_MS * Math.pow(2, est.fallos - INTENTOS_LIBRES);
        escribirLS(kIntentos, est);
        mostrarMsg('Código incorrecto.');
        btn.disabled = false;
        actualizarBloqueo();
        input.select();
        return;
      }
      borrarLS(kIntentos);
      mostrarMsg('');
      input.value = '';
      btn.disabled = false;
      $('p-hola').textContent = d.da;
      $('p-recibe').textContent = d.recibe;
      var dl = $('p-evento');
      dl.innerHTML = '';
      var e = d.evento || {};
      [['💰 Monto máx.', e.monto], ['📅 Fecha', e.fecha && formatearFecha(e.fecha)], ['📍 Lugar', e.lugar], ['✉️ Mensaje', e.mensaje]]
        .forEach(function (x) {
          if (!x[1]) return;
          dl.appendChild(el('dt', { text: x[0] }));
          dl.appendChild(el('dd', { text: String(x[1]) }));
        });
      $('p-confirmar').hidden = true;
      $('p-resultado').hidden = false;
    }

    $('p-form').addEventListener('submit', revelar);
    $('btn-ocultar').onclick = function () {
      // Al ocultar se borra lo mostrado: para volver a verlo hay que ingresar el código otra vez.
      $('p-recibe').textContent = ''; $('p-evento').innerHTML = '';
      $('p-resultado').hidden = true; $('p-confirmar').hidden = false;
    };
    actualizarBloqueo();
  }

  // Solo los hash "3.<...>" (D19) y "2.<...>" (links enviados antes) son de participante; cualquier otro se ignora.
  function esLinkParticipante(hash) { return /^[23]\./.test(hash); }

  function iniciar() {
    var hash = location.hash.replace(/^#/, '');
    if (esLinkParticipante(hash)) iniciarParticipante(hash); else iniciarOrganizador();
  }
  window.addEventListener('hashchange', function () {
    if (esLinkParticipante(location.hash.replace(/^#/, ''))) location.reload();
  });

  window.AmigoSecretoApp = {
    vista: esLinkParticipante(location.hash.replace(/^#/, '')) ? 'participante' : 'organizador',
    obtenerFormulario: obtenerFormulario,
    cargarFormulario: cargarFormulario
  };
  iniciar();
})();
