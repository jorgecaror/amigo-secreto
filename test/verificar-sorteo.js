// Uso: node test/verificar-sorteo.js
// Corre miles de sorteos y verifica las reglas de docs/REQUERIMIENTOS.md (RF2, RF3, RF6).
'use strict';
const assert = require('assert');
const path = require('path');
const S = require(path.join(__dirname, '..', 'sorteo.js'));

const NOMBRES = ['Ana', 'Beto', 'Caro', 'Dani', 'Ema', 'Fran', 'Gabi', 'Hugo', 'Isa', 'Juan',
  'Kari', 'Leo', 'Majo', 'Nico', 'Ñandú', 'Óscar', 'Pía', 'Quique', 'Rosa', 'Sofía'];

function verificar(nombres, exclusiones, res) {
  assert.ok(res, 'el sorteo debería ser posible');
  assert.strictEqual(res.length, nombres.length, 'todos deben regalar');
  const receptores = new Set();
  const prohibidos = new Set();
  exclusiones.forEach(([a, b]) => { prohibidos.add(a + '>' + b); prohibidos.add(b + '>' + a); });
  res.forEach(({ da, recibe }, i) => {
    assert.strictEqual(da, nombres[i], 'orden de quien regala');
    assert.notStrictEqual(da, recibe, 'nadie se regala a sí mismo: ' + da);
    assert.ok(nombres.includes(recibe), 'receptor existe');
    assert.ok(!prohibidos.has(da + '>' + recibe), 'exclusión violada: ' + da + ' > ' + recibe);
    receptores.add(recibe);
  });
  assert.strictEqual(receptores.size, nombres.length, 'receptores únicos y todos reciben');
}

let total = 0;

// 1) Sin exclusiones, de 3 a 20 personas.
for (let n = 3; n <= 20; n++) {
  const nombres = NOMBRES.slice(0, n);
  for (let k = 0; k < 300; k++) { verificar(nombres, [], S.sortear(nombres, [])); total++; }
}

// 2) Con exclusiones (parejas).
for (let n = 4; n <= 20; n++) {
  const nombres = NOMBRES.slice(0, n);
  const exc = [];
  for (let i = 0; i + 1 < n; i += 2) exc.push([nombres[i], nombres[i + 1]]);
  for (let k = 0; k < 300; k++) { verificar(nombres, exc, S.sortear(nombres, exc)); total++; }
}

// 3) Muy restringido (fuerza el backtracking): A solo puede regalarle a B en un grupo de 6.
{
  const nombres = NOMBRES.slice(0, 6);
  const exc = nombres.slice(2).map((x) => ['Ana', x]);
  for (let k = 0; k < 200; k++) {
    const res = S.sortear(nombres, exc);
    verificar(nombres, exc, res);
    assert.strictEqual(res[0].recibe, 'Beto');
    total++;
  }
}

// 4) Casos imposibles -> null.
assert.strictEqual(S.sortear(['Ana', 'Beto', 'Caro'], [['Ana', 'Beto'], ['Ana', 'Caro']]), null);
assert.strictEqual(S.sortear(['Ana', 'Beto', 'Caro'], [['Ana', 'Beto'], ['Beto', 'Caro'], ['Ana', 'Caro']]), null);

// 5) Uniformidad aproximada: con 4 personas hay 9 desarreglos posibles, cada uno ~1/9.
{
  const nombres = NOMBRES.slice(0, 4);
  const cuenta = {};
  const N = 18000;
  for (let k = 0; k < N; k++) {
    const clave = S.sortear(nombres, []).map((x) => x.recibe).join(',');
    cuenta[clave] = (cuenta[clave] || 0) + 1;
  }
  const claves = Object.keys(cuenta);
  assert.strictEqual(claves.length, 9, 'deben aparecer los 9 desarreglos');
  claves.forEach((c) => assert.ok(Math.abs(cuenta[c] - N / 9) < N / 9 * 0.1, 'distribución sesgada: ' + c));
}

// 6) Validación de nombres.
assert.deepStrictEqual(S.validarNombres('Ana\n  \nBeto\nCaro\n').nombres, ['Ana', 'Beto', 'Caro']);
assert.ok(S.validarNombres('Ana\nana\nBeto\nCaro').errores[0].includes('repetidos'));
assert.ok(S.validarNombres('Ana\nBeto').errores[0].includes('al menos 3'));
assert.ok(S.validarNombres(Array.from({ length: 101 }, (_, i) => 'P' + i).join('\n')).errores[0].includes('máximo es 100'));
assert.strictEqual(S.validarNombres(Array.from({ length: 100 }, (_, i) => 'P' + i).join('\n')).errores.length, 0);
assert.ok(S.validarNombres('Ana\nBeto\n' + 'x'.repeat(61)).errores[0].includes('60 caracteres'));
{
  const cien = Array.from({ length: 100 }, (_, i) => 'P' + i);
  verificar(cien, [], S.sortear(cien, []));
}

// 7) Código por persona.
{
  for (let k = 0; k < 500; k++) {
    const c = S.generarCodigo();
    assert.ok(/^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/.test(c), 'formato de código: ' + c);
  }
  assert.strictEqual(S.normalizarCodigo(' k7p q2m '), 'K7PQ2M');
  assert.strictEqual(S.normalizarCodigo('K7P-Q2M'), 'K7PQ2M');
}

// 8) Cifrado del link (async).
async function probarCifrado() {
  const evento = { monto: '$15.000', fecha: '2026-12-20', lugar: 'Casa de la Abuela', mensaje: '¡Ñam!' };
  const codigo = S.generarCodigo();
  const h1 = await S.codificar({ da: 'Sofía', recibe: 'Ñandú', evento }, codigo);
  const h2 = await S.codificar({ da: 'Sofía', recibe: 'Ñandú', evento }, codigo);
  assert.notStrictEqual(h1, h2, 'el link debe variar (salt/iv)');
  assert.ok(/^2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(h1), 'formato 2.<pub>.<cifrado>');

  // La parte pública solo trae quién regala; receptor y evento no aparecen en claro.
  const pub = S.leerPublico('#' + h1);
  assert.strictEqual(pub.da, 'Sofía');
  const pubTexto = Buffer.from(h1.split('.')[1], 'base64url').toString('utf8');
  ['Ñandú', 'Abuela', '15.000', 'Ñam'].forEach((x) => assert.ok(!pubTexto.includes(x), 'fuga en claro: ' + x));
  const crudo = Buffer.from(h1.split('.')[2], 'base64url').toString('latin1');
  ['and', 'Abuela', '15.000'].forEach((x) => assert.ok(!crudo.includes(x), 'fuga en cifrado: ' + x));

  // Código correcto (en cualquier formato) descifra.
  assert.deepStrictEqual(await S.decodificar('#' + h1, codigo), { da: 'Sofía', recibe: 'Ñandú', evento });
  assert.deepStrictEqual(await S.decodificar(h1, codigo.toLowerCase().replace('-', ' ')), { da: 'Sofía', recibe: 'Ñandú', evento });

  // Código incorrecto -> null.
  let otro = S.generarCodigo();
  while (otro === codigo) otro = S.generarCodigo();
  assert.strictEqual(await S.decodificar(h1, otro), null);
  assert.strictEqual(await S.decodificar(h1, ''), null);

  // Nombre alterado (AAD) -> null, aun con el código correcto.
  const pubFalso = Buffer.from(JSON.stringify({ v: 2, d: 'Intruso', i: 600000 })).toString('base64url');
  const alterado = ['2', pubFalso, h1.split('.')[2]].join('.');
  assert.strictEqual(S.leerPublico(alterado).da, 'Intruso');
  assert.strictEqual(await S.decodificar(alterado, codigo), null);

  // Relleno: links del mismo sorteo con receptores de largos muy distintos miden lo mismo.
  const largos = new Set();
  for (const r of ['Al', 'Ñandú', 'Maximiliano Alejandro de la Fuente', '😀'.repeat(60), '"\\'.repeat(30), '\u0001'.repeat(60)]) {
    largos.add((await S.codificar({ da: 'Sofía', recibe: r, evento }, codigo)).length);
  }
  assert.strictEqual(largos.size, 1, 'el largo del link no debe depender del receptor: ' + [...largos]);
  await assert.rejects(S.codificar({ da: 'X', recibe: '\u0001'.repeat(100), evento }, codigo));

  // Iteraciones fuera de rango o basura -> inválido.
  const pubDebil = Buffer.from(JSON.stringify({ v: 2, d: 'Sofía', i: 1 })).toString('base64url');
  assert.strictEqual(S.leerPublico(['2', pubDebil, h1.split('.')[2]].join('.')), null);
  assert.strictEqual(S.leerPublico('#basura'), null);
  assert.strictEqual(S.leerPublico(''), null);
  assert.strictEqual(await S.decodificar('#basura', codigo), null);
}

probarCifrado().then(() => {
  console.log('OK — ' + total + ' sorteos verificados, casos imposibles, uniformidad, nombres, códigos y cifrado AES-GCM.');
}).catch((e) => { console.error(e); process.exit(1); });
