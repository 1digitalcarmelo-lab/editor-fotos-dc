import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve,join } from 'node:path';
const require = createRequire(join(resolve(process.env.DC_TEST_TOOLS_PATH || '../invitation-publish/runtime'),'package.json'));
const { PGlite } = require('@electric-sql/pglite');
let db;
const u='11111111-1111-4111-8111-111111111111', v='22222222-2222-4222-8222-222222222222';
before(async()=>{
  db=new PGlite(); await db.waitReady;
  await db.exec(`create schema auth; create table auth.users(id uuid primary key);
    create role anon; create role authenticated; create role service_role bypassrls;
    create table products(product_slug text primary key,public_name text,short_description text,app_url text,category text,is_active boolean,display_order integer,allows_trial boolean,default_free_usage integer,allows_free boolean);
    insert into products(product_slug,category) values('generador-invitaciones','creacion');
    insert into auth.users values('${u}'),('${v}');`);
  const migration=readFileSync(new URL('../supabase/migrations/20261025200640_revelado_device_license.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
});
after(async()=>db?.close());
beforeEach(async()=>db.exec('truncate revelado_device_licenses;'));
const check=async(user,device,action='check')=>(await db.query('select dc_revelado_device_license($1,$2,$3,$4) as r',[user,device.repeat(64),'PC de prueba',action])).rows[0].r;
test('primera activación; la segunda no puede entrar ni reemplazar la primera',async()=>{
  assert.equal((await check(u,'a')).allowed,true);
  assert.equal((await check(u,'b')).code,'device_in_use');
  assert.equal((await check(u,'a')).allowed,true);
  assert.equal((await check(v,'b')).allowed,true);
});
test('dos transferencias mensuales; reintentar el mismo destino no consume otra',async()=>{
  await check(u,'a');
  assert.equal((await check(u,'b','transfer')).transfers_remaining,1);
  assert.equal((await check(u,'b','transfer')).transfers_remaining,1);
  assert.equal((await check(u,'a')).allowed,false);
  assert.equal((await check(u,'c','transfer')).transfers_remaining,0);
  assert.equal((await check(u,'d','transfer')).code,'transfer_limit');
  assert.equal((await check(u,'c')).allowed,true);
});
test('el cambio de mes recupera dos transferencias',async()=>{
  await check(u,'a'); await check(u,'b','transfer'); await check(u,'c','transfer');
  await db.exec("update revelado_device_licenses set transfer_month=transfer_month-interval '1 month'");
  assert.equal((await check(u,'d','transfer')).transfers_remaining,1);
});
test('solicitudes juntas conservan una sola activación (PGlite las encola)',async()=>{
  const results=await Promise.all(['a','b','c','d'].map(d=>check(u,d)));
  assert.equal(results.filter(x=>x.allowed).length,1);
  assert.equal((await db.query('select count(*)::int as n from revelado_device_licenses')).rows[0].n,1);
});
test('sin acceso directo desde visitantes o usuarios; la RPC es solo del servidor',async()=>{
  for(const role of ['anon','authenticated']) {
    const r=await db.query("select has_function_privilege($1,'dc_revelado_device_license(uuid,text,text,text)','EXECUTE') as fn,has_table_privilege($1,'revelado_device_licenses','UPDATE') as wr",[role]);
    assert.equal(r.rows[0].fn,false); assert.equal(r.rows[0].wr,false);
  }
  assert.equal((await db.query("select relrowsecurity as enabled from pg_class where oid='revelado_device_licenses'::regclass")).rows[0].enabled,true);
  assert.equal((await db.query("select allows_free from products where product_slug='editor-fotos-dc'")).rows[0].allows_free,false);
});
test('rechaza hash o acciones inválidas sin crear activación',async()=>{
  const r=await db.query('select dc_revelado_device_license($1,$2,$3,$4) as r',[u,'short','PC','erase']);
  assert.equal(r.rows[0].r.status,400);
  assert.equal((await db.query('select count(*)::int as n from revelado_device_licenses')).rows[0].n,0);
});

