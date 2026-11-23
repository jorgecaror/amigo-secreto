/*
 * Perfiles opcionales con Supabase (D12–D14, D16).
 * - Solo en la vista organizador y solo si config.js tiene URL + anon key.
 * - vendor/supabase.js se carga de forma perezosa: al pulsar "Iniciar sesión", al volver del link mágico
 *   (?code=...) o si ya hay una sesión guardada.
 * - Se guardan listas (nombres, exclusiones, evento) e historial (fecha + cantidad). NUNCA resultados,
 *   links ni códigos.
 */
(function () {
  'use strict';
  var cfg = window.AMIGO_SECRETO_CONFIG || {};
  var app = window.AmigoSecretoApp;
  if (!app || app.vista !== 'organizador') return; // la vista participante ya tiene connect-src 'none'

  // CSP adicional en tiempo de ejecución (se intersecta con la del <meta>, SEGURIDAD.md H3): la red queda fijada
  // al proyecto exacto de config.js, o cerrada por completo si no hay perfiles configurados.
  function fijarRed(origen) {
    var m = document.createElement('meta');
    m.httpEquiv = 'Content-Security-Policy';
    m.content = 'connect-src ' + origen;
    document.head.appendChild(m);
  }
  var urlValida = typeof cfg.supabaseUrl === 'string' && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.supabaseUrl);
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !urlValida) {
    if (cfg.supabaseUrl && !urlValida) console.warn('[perfil] supabaseUrl inválida en config.js; perfiles desactivados.');
    fijarRed("'none'");
    return; // perfiles desactivados
  }
  fijarRed(cfg.supabaseUrl);

  var STORAGE_KEY = 'amigo-secreto-auth';
  var $ = function (id) { return document.getElementById(id); };
  var cliente = null, promesaCliente = null, usuario = null;
  var listas = [], listaActualId = null;

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') n.textContent = props[k]; else if (k === 'onclick') n.onclick = props[k]; else n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function msg(id, texto, esError) {
    var m = $(id);
    m.textContent = texto || '';
    m.hidden = !texto;
    if (m.classList) m.classList.toggle('done', !!texto && !esError);
  }

  // No mostrar detalles internos; solo los mensajes propios de los triggers (código P0001).
  function textoError(e) {
    console.warn('[perfil]', e);
    if (e && e.code === 'P0001' && e.message) return e.message;
    var m = (e && e.message) || '';
    if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espera unos minutos y vuelve a intentar.';
    if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Por ahora no se están creando cuentas nuevas.';
    if (/sending .*email|smtp/i.test(m)) return 'No pudimos enviar el correo. Intenta de nuevo en unos minutos.';
    if (/invalid.*email|email.*invalid/i.test(m)) return 'Ese correo no parece válido. Revísalo.';
    return 'No se pudo completar la operación. Revisa tu conexión e intenta de nuevo.';
  }

  function haySesionGuardada() {
    try { return !!localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
  }

  function fecha(iso) {
    try { return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }

  // ---------- Carga perezosa del cliente ----------
  function cargarLibreria() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = 'vendor/supabase.js';
      s.onload = ok;
      s.onerror = function () { fail(new Error('No se pudo cargar vendor/supabase.js')); };
      document.head.appendChild(s);
    });
  }

  function obtenerCliente() {
    if (cliente) return Promise.resolve(cliente);
    if (!promesaCliente) {
      promesaCliente = cargarLibreria().then(function () {
        cliente = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: STORAGE_KEY }
        });
        cliente.auth.onAuthStateChange(function (_evento, sesion) {
          // Diferido: no llamar a Supabase dentro del callback (recomendación de supabase-js).
          setTimeout(function () { aplicarSesion(sesion); }, 0);
        });
        return cliente;
      });
    }
    return promesaCliente;
  }

  // ---------- Sesión ----------
  function aplicarSesion(sesion) {
    var nuevo = sesion && sesion.user ? sesion.user : null;
    var cambio = (nuevo && nuevo.id) !== (usuario && usuario.id);
    usuario = nuevo;
    $('btn-login').hidden = !!usuario;
    $('sesion-info').hidden = !usuario;
    $('sesion-email').textContent = usuario ? usuario.email || '' : '';
    $('mis-listas-card').hidden = !usuario;
    if (usuario) {
      $('login-card').hidden = true;
      if (cambio) cargarListas();
    } else {
      listas = []; listaActualId = null;
      $('panel-perfil').hidden = true;
      renderListas();
    }
  }

  function limpiarUrl() {
    var p = new URLSearchParams(location.search);
    if (p.has('code') || p.has('error') || p.has('error_description')) {
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }

  async function retomarSesion() {
    var vieneDeLink = new URLSearchParams(location.search).has('code');
    var errorUrl = new URLSearchParams(location.search).get('error_description');
    try {
      var c = await obtenerCliente();
      var r = await c.auth.getSession(); // espera el canje del ?code= (PKCE)
      limpiarUrl();
      aplicarSesion(r.data && r.data.session);
      if ((vieneDeLink || errorUrl) && !(r.data && r.data.session)) {
        $('login-card').hidden = false;
        msg('login-msg', 'No se pudo iniciar sesión con ese link. Debe abrirse en el mismo navegador donde lo pediste y solo sirve una vez. Pide uno nuevo.', true);
      }
    } catch (e) {
      limpiarUrl();
      console.warn('[perfil]', e);
    }
  }

  async function enviarLink(ev) {
    ev.preventDefault();
    var email = $('login-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      msg('login-msg', 'Escribe un correo válido.', true);
      return;
    }
    var btn = $('btn-login-enviar');
    btn.disabled = true;
    try {
      var c = await obtenerCliente();
      var r = await c.auth.signInWithOtp({ email: email, options: { emailRedirectTo: location.origin + location.pathname } });
      if (r.error) throw r.error;
      msg('login-msg', '📬 Listo. Revisa tu correo (y spam) y abre el link en este mismo navegador.');
      setTimeout(function () { btn.disabled = false; }, 60000); // evita reenvíos seguidos
    } catch (e) {
      msg('login-msg', textoError(e), true);
      btn.disabled = false;
    }
  }

  async function salir() {
    try { var c = await obtenerCliente(); await c.auth.signOut(); } catch (e) { console.warn('[perfil]', e); }
    aplicarSesion(null);
  }

  // ---------- Listas ----------
  async function cargarListas() {
    try {
      var c = await obtenerCliente();
      var r = await c.from('listas').select('id,nombre,participantes,exclusiones,evento,updated_at').order('updated_at', { ascending: false });
      if (r.error) throw r.error;
      listas = r.data || [];
      if (listaActualId && !listas.some(function (l) { return l.id === listaActualId; })) listaActualId = null;
    } catch (e) {
      msg('listas-msg', textoError(e), true);
    }
    renderListas();
  }

  function renderListas() {
    var sel = $('sel-lista');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', text: listas.length ? 'Elegir lista guardada…' : 'Aún no tienes listas guardadas' }));
    listas.forEach(function (l) {
      sel.appendChild(el('option', { value: l.id, text: l.nombre + ' (' + (l.participantes || []).length + ')' }));
    });
    sel.value = listaActualId || '';
    if (!$('panel-perfil').hidden) renderPerfil();
  }

  function usarLista(id) {
    var l = listas.find(function (x) { return x.id === id; });
    if (!l) return;
    if (!app.cargarFormulario(l)) {
      msg('listas-msg', 'Hay un sorteo en pantalla. Pulsa "Nuevo sorteo" para cargar otra lista.', true);
      $('sel-lista').value = listaActualId || '';
      return;
    }
    listaActualId = l.id;
    $('lista-nombre').value = l.nombre;
    $('sel-lista').value = l.id;
    msg('listas-msg', '');
  }

  async function guardarLista() {
    var nombre = $('lista-nombre').value.trim().replace(/\s+/g, ' ');
    if (!nombre) { msg('listas-msg', 'Ponle un nombre a la lista.', true); $('lista-nombre').focus(); return; }
    var f = app.obtenerFormulario();
    var v = Sorteo.validarNombres(f.participantes.join('\n'));
    if (v.errores.length) { msg('listas-msg', v.errores[0], true); return; }
    var datos = { nombre: nombre.slice(0, 80), participantes: v.nombres, exclusiones: f.exclusiones, evento: f.evento };
    var btn = $('btn-guardar-lista');
    btn.disabled = true;
    try {
      var c = await obtenerCliente();
      var r;
      if (listaActualId) {
        r = await c.from('listas').update(datos).eq('id', listaActualId).select('id').single();
      } else {
        r = await c.from('listas').insert(datos).select('id').single();
      }
      if (r.error) throw r.error;
      listaActualId = r.data.id;
      await cargarListas();
      msg('listas-msg', '✓ Lista "' + nombre + '" guardada.');
    } catch (e) {
      msg('listas-msg', textoError(e), true);
    } finally {
      btn.disabled = false;
    }
  }

  function listaNueva() {
    if (!app.cargarFormulario({ participantes: [], exclusiones: [], evento: {} })) {
      msg('listas-msg', 'Hay un sorteo en pantalla. Pulsa "Nuevo sorteo" primero.', true);
      return;
    }
    listaActualId = null;
    $('lista-nombre').value = '';
    $('sel-lista').value = '';
    msg('listas-msg', '');
  }

  async function registrarSorteo(ev) {
    if (!usuario) return;
    var n = ev.detail && ev.detail.participantes;
    if (!(n >= 3 && n <= 100)) return;
    try {
      var c = await obtenerCliente();
      var r = await c.from('sorteos').insert({ lista_id: listaActualId || null, participantes: n });
      if (r.error) throw r.error;
    } catch (e) {
      console.warn('[perfil] no se pudo registrar el sorteo en el historial', e);
    }
  }

  // ---------- Panel de perfil ----------
  async function abrirPerfil() {
    $('panel-perfil').hidden = false;
    $('perfil-email').textContent = usuario ? 'Sesión iniciada como ' + (usuario.email || '') : '';
    msg('perfil-msg', '');
    renderPerfil();
    await cargarHistorial();
    $('panel-perfil').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPerfil() {
    var cont = $('perfil-listas');
    cont.innerHTML = '';
    if (!listas.length) { cont.appendChild(el('p', { class: 'hint', text: 'No tienes listas guardadas.' })); return; }
    var tbody = el('tbody');
    listas.forEach(function (l) {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: l.nombre }),
        el('td', { text: String((l.participantes || []).length) }),
        el('td', { text: fecha(l.updated_at) }),
        el('td', {}, [
          el('button', { type: 'button', class: 'link', text: 'Cargar', onclick: function () { usarLista(l.id); $('panel-perfil').hidden = true; } }),
          el('button', { type: 'button', class: 'link', text: 'Borrar', onclick: function () { borrarLista(l); } })
        ])
      ]));
    });
    cont.appendChild(el('table', { class: 'tabla' }, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Lista' }), el('th', { text: 'Personas' }), el('th', { text: 'Actualizada' }), el('th', { text: '' })])]),
      tbody
    ]));
  }

  async function cargarHistorial() {
    var cont = $('perfil-historial');
    cont.innerHTML = '';
    try {
      var c = await obtenerCliente();
      var r = await c.from('sorteos').select('id,lista_id,participantes,created_at').order('created_at', { ascending: false }).limit(50);
      if (r.error) throw r.error;
      if (!r.data.length) { cont.appendChild(el('p', { class: 'hint', text: 'Aún no hay sorteos registrados.' })); return; }
      var ul = el('ul', { class: 'list' });
      r.data.forEach(function (s) {
        var l = listas.find(function (x) { return x.id === s.lista_id; });
        ul.appendChild(el('li', {}, [
          el('span', { text: fecha(s.created_at) + ' · ' + (l ? l.nombre : 'Sin lista guardada') }),
          el('span', { class: 'muted', text: s.participantes + ' personas' })
        ]));
      });
      cont.appendChild(ul);
    } catch (e) {
      cont.appendChild(el('p', { class: 'hint', text: textoError(e) }));
    }
  }

  async function borrarLista(l) {
    if (!confirm('¿Borrar la lista "' + l.nombre + '"? Esto no se puede deshacer.')) return;
    try {
      var c = await obtenerCliente();
      var r = await c.from('listas').delete().eq('id', l.id);
      if (r.error) throw r.error;
      if (listaActualId === l.id) { listaActualId = null; $('lista-nombre').value = ''; }
      await cargarListas();
      await cargarHistorial();
    } catch (e) {
      msg('perfil-msg', textoError(e), true);
    }
  }

  async function borrarDatos() {
    if (!confirm('¿Borrar TODAS tus listas y tu historial? Tu cuenta seguirá existiendo.')) return;
    try {
      var c = await obtenerCliente();
      var r1 = await c.from('sorteos').delete().eq('user_id', usuario.id);
      if (r1.error) throw r1.error;
      var r2 = await c.from('listas').delete().eq('user_id', usuario.id);
      if (r2.error) throw r2.error;
      listaActualId = null; $('lista-nombre').value = '';
      await cargarListas();
      await cargarHistorial();
      msg('perfil-msg', '✓ Tus listas e historial fueron borrados.');
    } catch (e) {
      msg('perfil-msg', textoError(e), true);
    }
  }

  async function eliminarCuenta() {
    var t = prompt('Esto borra tu cuenta, tus listas y tu historial para siempre.\nEscribe ELIMINAR para confirmar:');
    if ((t || '').trim().toUpperCase() !== 'ELIMINAR') return;
    try {
      var c = await obtenerCliente();
      var r = await c.rpc('eliminar_mi_cuenta');
      if (r.error) throw r.error;
      await c.auth.signOut({ scope: 'local' });
      aplicarSesion(null);
      alert('Tu cuenta fue eliminada.');
    } catch (e) {
      msg('perfil-msg', textoError(e), true);
    }
  }

  // ---------- Inicio ----------
  $('barra-sesion').hidden = false;
  $('btn-login').onclick = function () {
    $('login-card').hidden = false;
    msg('login-msg', '');
    $('login-email').focus();
    obtenerCliente().catch(function (e) { msg('login-msg', textoError(e), true); }); // precarga
  };
  $('btn-login-cancelar').onclick = function () { $('login-card').hidden = true; };
  $('login-form').addEventListener('submit', enviarLink);
  $('btn-salir').onclick = salir;
  $('btn-perfil').onclick = abrirPerfil;
  $('btn-perfil-cerrar').onclick = function () { $('panel-perfil').hidden = true; };
  $('sel-lista').addEventListener('change', function () { if (this.value) usarLista(this.value); });
  $('btn-guardar-lista').onclick = guardarLista;
  $('btn-lista-nueva').onclick = listaNueva;
  $('btn-borrar-datos').onclick = borrarDatos;
  $('btn-eliminar-cuenta').onclick = eliminarCuenta;
  document.addEventListener('sorteo-realizado', registrarSorteo);

  var p = new URLSearchParams(location.search);
  if (p.has('code') || p.has('error_description') || haySesionGuardada()) retomarSesion();
})();
