// Uso: npm install && node test/verificar-rls.mjs
// Prueba supabase/schema.sql en Postgres real (PGlite, WASM) emulando lo mínimo de Supabase:
// roles anon/authenticated, auth.users y auth.uid().
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const schema = readFileSync(fileURLToPath(new URL('../supabase/schema.sql', import.meta.url)), 'utf8');
const db = new PGlite();

// --- Emulación de Supabase: roles, auth.users, auth.uid(), privilegios por defecto ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`);

await db.exec(schema);
await db.exec(schema); // idempotente
console.log('✓ schema.sql se ejecuta dos veces sin error');

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}','a@x.cl'), ('${B}','b@x.cl')`);

async function como(rol, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${rol};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
const q = (sql, p) => db.query(sql, p);
async function falla(promesa, patron, desc) {
  try { await promesa; } catch (e) { assert.match(e.message, patron, desc + ' → ' + e.message); return e.message; }
  assert.fail('debería fallar: ' + desc);
}
const P = JSON.stringify(['Ana', 'Beto', 'Caro']);

// --- A crea una lista ---
const idA = await como('authenticated', A, async () => {
  const r = await q(`insert into public.listas (nombre, participantes) values ($1, $2) returning id, user_id`, ['Familia', P]);
  assert.equal(r.rows[0].user_id, A, 'user_id por defecto = auth.uid()');
  assert.equal((await q('select count(*)::int n from public.listas')).rows[0].n, 1);
  await q(`insert into public.sorteos (lista_id, participantes) values ($1, 3)`, [r.rows[0].id]);
  return r.rows[0].id;
});
console.log('✓ A crea lista y registra sorteo');

// --- B no ve ni toca lo de A ---
await como('authenticated', B, async () => {
  assert.equal((await q('select count(*)::int n from public.listas')).rows[0].n, 0, 'B no ve listas de A');
  assert.equal((await q('select count(*)::int n from public.sorteos')).rows[0].n, 0, 'B no ve sorteos de A');
  assert.equal((await q(`update public.listas set nombre='hack' where id=$1`, [idA])).affectedRows, 0, 'B no edita a A');
  assert.equal((await q(`delete from public.listas where id=$1`, [idA])).affectedRows, 0, 'B no borra a A');
  await falla(q(`insert into public.listas (user_id, nombre, participantes) values ($1,'x',$2)`, [A, P]), /row-level security/, 'B inserta a nombre de A');
  await falla(q(`insert into public.sorteos (lista_id, participantes) values ($1, 3)`, [idA]), /row-level security/, 'B referencia lista de A');
});
console.log('✓ RLS: B no puede ver, editar, borrar ni suplantar a A');

// --- A no puede regalar su lista a B ---
await como('authenticated', A, async () => {
  await falla(q(`update public.listas set user_id=$1 where id=$2`, [B, idA]), /row-level security|dueño/, 'A cambia dueño');
});
console.log('✓ No se puede cambiar el dueño de una lista');

// --- Validaciones ---
await como('authenticated', A, async () => {
  await falla(q(`insert into public.listas (nombre, participantes) values ('x', $1)`, [JSON.stringify(['a', 'b'])]), /check constraint/, '2 participantes');
  await falla(q(`insert into public.listas (nombre, participantes) values ('x', $1)`, [JSON.stringify(Array.from({ length: 101 }, (_, i) => 'p' + i))]), /check constraint/, '101 participantes');
  await falla(q(`insert into public.listas (nombre, participantes) values ('   ', $1)`, [P]), /check constraint/, 'nombre vacío');
  await falla(q(`insert into public.listas (nombre, participantes) values ($1, $2)`, ['x'.repeat(81), P]), /check constraint/, 'nombre largo');
  await falla(q(`insert into public.listas (nombre, participantes, evento) values ('x', $1, '[]')`, [P]), /check constraint/, 'evento no objeto');
  await falla(q(`insert into public.listas (nombre, participantes, evento) values ('x', $1, $2)`, [P, JSON.stringify({ m: 'x'.repeat(40000) })]), /check constraint/, 'jsonb gigante');
  await falla(q(`insert into public.sorteos (participantes) values (2)`), /check constraint/, 'sorteo de 2');
  await falla(q(`update public.sorteos set participantes = 5`), /permission denied/, 'editar historial');
});
console.log('✓ Validaciones: tamaños, tipos y historial no editable');

// --- Límite de 50 listas ---
await como('authenticated', A, async () => {
  for (let i = 1; i < 50; i++) await q(`insert into public.listas (nombre, participantes) values ($1, $2)`, ['L' + i, P]);
  await falla(q(`insert into public.listas (nombre, participantes) values ('L51', $1)`, [P]), /máximo de 50 listas/, 'lista 51');
});
console.log('✓ Límite de 50 listas por usuario');

// B no puede usar el límite como oráculo: al insertar a nombre de A (que tiene 50) recibe error de RLS, no de límite.
await como('authenticated', B, async () => {
  const m = await falla(q(`insert into public.listas (user_id, nombre, participantes) values ($1,'x',$2)`, [A, P]), /row-level security/, 'oráculo de límite');
  assert.doesNotMatch(m, /máximo/);
});
console.log('✓ El límite no revela datos de otros usuarios');

// --- Recorte de historial a 200 ---
await como('authenticated', A, async () => {
  for (let i = 0; i < 210; i++) await q(`insert into public.sorteos (participantes) values (4)`);
  assert.equal((await q('select count(*)::int n from public.sorteos')).rows[0].n, 200);
});
console.log('✓ Historial recortado a 200');

// --- updated_at ---
await como('authenticated', A, async () => {
  const antes = (await q('select updated_at from public.listas where id=$1', [idA])).rows[0].updated_at;
  await new Promise((r) => setTimeout(r, 20));
  await q(`update public.listas set nombre='Familia 2' where id=$1`, [idA]);
  const despues = (await q('select updated_at from public.listas where id=$1', [idA])).rows[0].updated_at;
  assert.ok(despues > antes, 'updated_at avanza');
});
console.log('✓ updated_at automático');

// --- anon sin acceso ---
await como('anon', null, async () => {
  await falla(q('select * from public.listas'), /permission denied/, 'anon lee listas');
  await falla(q('select * from public.sorteos'), /permission denied/, 'anon lee sorteos');
  await falla(q('select public.eliminar_mi_cuenta()'), /permission denied/, 'anon elimina cuenta');
});
console.log('✓ anon sin acceso a tablas ni a eliminar_mi_cuenta()');

// --- authenticated no puede llamar funciones de trigger ni ver auth.users ---
await como('authenticated', B, async () => {
  await falla(q('select public.recortar_historial()'), /permission denied|trigger/, 'llamar trigger');
  await falla(q('select * from auth.users'), /permission denied/, 'leer auth.users');
});
console.log('✓ Funciones de trigger y auth.users no expuestas');

// --- B crea una lista; A elimina su cuenta ---
await como('authenticated', B, () => q(`insert into public.listas (nombre, participantes) values ('De B', $1)`, [P]));
await como('authenticated', A, () => q('select public.eliminar_mi_cuenta()'));
const r = await q(`select (select count(*)::int from auth.users) usuarios,
                          (select count(*)::int from public.listas where user_id='${A}') listasA,
                          (select count(*)::int from public.sorteos where user_id='${A}') sorteosA,
                          (select count(*)::int from public.listas where user_id='${B}') listasB`);
assert.equal(r.rows[0].usuarios, 1); assert.equal(r.rows[0].listasa, 0); assert.equal(r.rows[0].sorteosa, 0); assert.equal(r.rows[0].listasb, 1);
console.log('✓ eliminar_mi_cuenta(): borra a A con sus listas e historial; B intacto');

console.log('\nOK — schema.sql verificado en Postgres', (await q('show server_version')).rows[0].server_version);
