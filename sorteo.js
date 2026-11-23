/*
 * Lógica pura del amigo secreto (sin DOM). Funciona en el navegador (window.Sorteo)
 * y en Node (require('./sorteo.js')). Ver docs/DECISIONES.md (D7, D10).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sorteo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN_PARTICIPANTES = 3;
  var MAX_PARTICIPANTES = 100;   // igual que el CHECK de supabase/schema.sql
  var MAX_LARGO_NOMBRE = 60;
  var INTENTOS_RECHAZO = 5000;
  var ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  var LARGO_CODIGO = 6;
  var ITERACIONES = 600000;          // PBKDF2-SHA256 (recomendación OWASP)
  var MIN_ITERACIONES = 100000;
  var MAX_ITERACIONES = 5000000;

  // ---------- Aleatoriedad ----------
  function getCrypto() {
    if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
      return globalThis.crypto;
    }
    return require('crypto').webcrypto; // Node antiguo
  }

  // Entero uniforme en [0, n) sin sesgo de módulo.
  function randInt(n) {
    var limite = Math.floor(0x100000000 / n) * n;
    var buf = new Uint32Array(1);
    var x;
    do {
      getCrypto().getRandomValues(buf);
      x = buf[0];
    } while (x >= limite);
    return x % n;
  }

  function barajar(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = randInt(i + 1);
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // ---------- Nombres ----------
  function normalizar(nombre) {
    return String(nombre).trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
  }

  // Texto (un nombre por línea) -> { nombres, errores }
  function validarNombres(texto) {
    var nombres = String(texto || '')
      .split(/\r?\n/)
      .map(function (s) { return s.trim().replace(/\s+/g, ' '); })
      .filter(function (s) { return s.length > 0; });
    var errores = [];
    var vistos = {};
    var repetidos = [];
    nombres.forEach(function (n) {
      var k = normalizar(n);
      if (vistos[k] && repetidos.indexOf(n) === -1) repetidos.push(n);
      vistos[k] = true;
    });
    if (repetidos.length) errores.push('Nombres repetidos: ' + repetidos.join(', ') + '. Agrega un apellido o inicial para distinguirlos.');
    if (nombres.length < MIN_PARTICIPANTES) errores.push('Se necesitan al menos ' + MIN_PARTICIPANTES + ' participantes.');
    if (nombres.length > MAX_PARTICIPANTES) errores.push('El máximo es ' + MAX_PARTICIPANTES + ' participantes.');
    var largos = nombres.filter(function (n) { return n.length > MAX_LARGO_NOMBRE; });
    if (largos.length) errores.push('Cada nombre puede tener hasta ' + MAX_LARGO_NOMBRE + ' caracteres.');
    return { nombres: nombres, errores: errores };
  }

  // ---------- Sorteo ----------
  // nombres: string[]; exclusiones: [nombreA, nombreB][] (bidireccionales)
  // Devuelve [{ da, recibe }] en el orden de `nombres`, o null si es imposible.
  function sortear(nombres, exclusiones) {
    var n = nombres.length;
    if (n < 2) return null;
    var idx = {};
    nombres.forEach(function (nom, i) { idx[normalizar(nom)] = i; });

    // prohibido[i][j] = true si i no puede regalarle a j
    var prohibido = [];
    for (var i = 0; i < n; i++) {
      prohibido.push([]);
      for (var j = 0; j < n; j++) prohibido[i].push(i === j);
    }
    (exclusiones || []).forEach(function (par) {
      var a = idx[normalizar(par[0])], b = idx[normalizar(par[1])];
      if (a === undefined || b === undefined) return;
      prohibido[a][b] = true;
      prohibido[b][a] = true;
    });

    function valida(asig) {
      for (var k = 0; k < n; k++) if (prohibido[k][asig[k]]) return false;
      return true;
    }

    // 1) Muestreo por rechazo: uniforme entre todas las asignaciones válidas.
    var base = [];
    for (var b0 = 0; b0 < n; b0++) base.push(b0);
    var asig = null;
    for (var intento = 0; intento < INTENTOS_RECHAZO; intento++) {
      var perm = barajar(base);
      if (valida(perm)) { asig = perm; break; }
    }

    // 2) Respaldo: backtracking exhaustivo (decide también si es imposible).
    if (!asig) asig = backtracking(n, prohibido);
    if (!asig) return null;

    return nombres.map(function (nom, k) { return { da: nom, recibe: nombres[asig[k]] }; });
  }

  function backtracking(n, prohibido) {
    var asig = new Array(n).fill(-1);
    var usado = new Array(n).fill(false);

    function opciones(g) {
      var ops = [];
      for (var r = 0; r < n; r++) if (!usado[r] && !prohibido[g][r]) ops.push(r);
      return ops;
    }

    function paso(asignados) {
      if (asignados === n) return true;
      // Elegir el que regala con menos opciones (MRV); empates al azar.
      var mejor = -1, mejorOps = null;
      barajar(Array.from({ length: n }, function (_, k) { return k; })).forEach(function (g) {
        if (asig[g] !== -1) return;
        var ops = opciones(g);
        if (mejorOps === null || ops.length < mejorOps.length) { mejor = g; mejorOps = ops; }
      });
      if (mejorOps.length === 0) return false;
      var cand = barajar(mejorOps);
      for (var c = 0; c < cand.length; c++) {
        asig[mejor] = cand[c]; usado[cand[c]] = true;
        if (paso(asignados + 1)) return true;
        asig[mejor] = -1; usado[cand[c]] = false;
      }
      return false;
    }

    return paso(0) ? asig : null;
  }

  // ---------- Código por persona (D10) ----------
  // Sin caracteres ambiguos (0/O, 1/I/L). 31^6 ≈ 8,9e8 combinaciones (~30 bits).
  function generarCodigo() {
    var s = '';
    for (var i = 0; i < LARGO_CODIGO; i++) s += ALFABETO_CODIGO[randInt(ALFABETO_CODIGO.length)];
    return s.slice(0, 3) + '-' + s.slice(3);
  }

  // 'k7p q2m' / 'K7P-Q2M' / 'k7pq2m' -> 'K7PQ2M'
  function normalizarCodigo(codigo) {
    return String(codigo || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  // ---------- Cifrado del link (D10) ----------
  // Hash: "2.<b64url(JSON público)>.<b64url(salt|iv|ciphertext)>"
  //   público  = {v:2, d:quienRegala, i:iteraciones}  (va como AAD: no se puede alterar)
  //   cifrado  = {r:receptor, e:evento, n:nonce}      (AES-256-GCM, clave PBKDF2-SHA256 del código)
  function subtle() { return getCrypto().subtle; }

  function aleatorios(n) {
    var b = new Uint8Array(n);
    getCrypto().getRandomValues(b);
    return b;
  }

  function derivarClave(codigo, salt, iteraciones) {
    return subtle().importKey('raw', new TextEncoder().encode(normalizarCodigo(codigo)), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return subtle().deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iteraciones },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  function aBase64Url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function deBase64Url(str) {
    var b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var s = atob(b64);
    var bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
  }

  // Relleno (SEGURIDAD.md H1): el largo del cifrado no debe revelar el largo del nombre del receptor.
  // Se rellena `p` para que JSON(r) + p ocupe siempre BYTES_RECEPTOR bytes UTF-8. Como el evento es igual para
  // todos los links de un sorteo, todos los links de ese sorteo quedan del mismo largo.
  // Peor caso de JSON(r): 60 caracteres × 6 bytes (escape \u00XX) + 2 comillas = 362 < 512.
  var BYTES_RECEPTOR = 512;

  function bytesUtf8(s) { return new TextEncoder().encode(s).length; }

  // datos: { da, recibe, evento }, codigo: string -> Promise<string> (hash sin '#')
  function codificar(datos, codigo) {
    var largoR = bytesUtf8(JSON.stringify(String(datos.recibe)));
    if (largoR > BYTES_RECEPTOR) return Promise.reject(new Error('Nombre del receptor demasiado largo'));
    var publico = JSON.stringify({ v: 2, d: datos.da, i: ITERACIONES });
    var publicoB64 = aBase64Url(new TextEncoder().encode(publico));
    var relleno = new Array(BYTES_RECEPTOR - largoR + 1).join(' ');
    var secreto = new TextEncoder().encode(JSON.stringify({ r: String(datos.recibe), p: relleno, e: datos.evento || {} }));
    var salt = aleatorios(16), iv = aleatorios(12);
    return derivarClave(codigo, salt, ITERACIONES)
      .then(function (clave) {
        return subtle().encrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(publicoB64) }, clave, secreto);
      })
      .then(function (ct) {
        var c = new Uint8Array(ct);
        var todo = new Uint8Array(salt.length + iv.length + c.length);
        todo.set(salt, 0); todo.set(iv, salt.length); todo.set(c, salt.length + iv.length);
        return '2.' + publicoB64 + '.' + aBase64Url(todo);
      });
  }

  // Lee la parte pública (sin código). hash -> { da, iteraciones, publicoB64, cifrado } o null
  function leerPublico(hash) {
    try {
      var partes = String(hash || '').replace(/^#/, '').split('.');
      if (partes.length !== 3 || partes[0] !== '2') return null;
      var pub = JSON.parse(new TextDecoder().decode(deBase64Url(partes[1])));
      if (!pub || pub.v !== 2 || typeof pub.d !== 'string' || !pub.d) return null;
      if (typeof pub.i !== 'number' || pub.i < MIN_ITERACIONES || pub.i > MAX_ITERACIONES) return null;
      var cifrado = deBase64Url(partes[2]);
      if (cifrado.length < 16 + 12 + 16) return null;
      return { da: pub.d, iteraciones: pub.i, publicoB64: partes[1], cifrado: cifrado };
    } catch (e) {
      return null;
    }
  }

  // hash + codigo -> Promise<{ da, recibe, evento } | null>  (null: código incorrecto o link inválido/alterado)
  function decodificar(hash, codigo) {
    var pub = leerPublico(hash);
    if (!pub || normalizarCodigo(codigo).length !== LARGO_CODIGO) return Promise.resolve(null);
    var salt = pub.cifrado.slice(0, 16), iv = pub.cifrado.slice(16, 28), ct = pub.cifrado.slice(28);
    return derivarClave(codigo, salt, pub.iteraciones)
      .then(function (clave) {
        return subtle().decrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(pub.publicoB64) }, clave, ct);
      })
      .then(function (claro) {
        var obj = JSON.parse(new TextDecoder().decode(claro));
        if (!obj || typeof obj.r !== 'string') return null;
        return { da: pub.da, recibe: obj.r, evento: obj.e && typeof obj.e === 'object' ? obj.e : {} };
      })
      .catch(function () { return null; });
  }

  return {
    MIN_PARTICIPANTES: MIN_PARTICIPANTES,
    MAX_PARTICIPANTES: MAX_PARTICIPANTES,
    MAX_LARGO_NOMBRE: MAX_LARGO_NOMBRE,
    LARGO_CODIGO: LARGO_CODIGO,
    normalizar: normalizar,
    validarNombres: validarNombres,
    sortear: sortear,
    generarCodigo: generarCodigo,
    normalizarCodigo: normalizarCodigo,
    codificar: codificar,
    leerPublico: leerPublico,
    decodificar: decodificar
  };
});
