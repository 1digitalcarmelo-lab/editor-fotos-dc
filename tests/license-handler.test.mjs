import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve,join } from 'node:path';
const require=createRequire(join(resolve(process.env.DC_TEST_BUILD_TOOLS_PATH || '../auth-polish/runtime'),'package.json'));
const { build }=require('esbuild');
let handler;
before(async()=>{
  const out=await build({ entryPoints:[new URL('../supabase/functions/revelado-licencia/handler.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node' });
  handler=(await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'))).handleLicense;
});
function config({state='product_full',auth=true,error=null,internalRoles=[],roleError=null,result={allowed:true,status:200,transfers_remaining:2}}={}) {
  const calls=[];
  return {calls,url:'https://project.example.invalid',publicKey:'public',secretKey:'server',createClient:(_url,key)=>key==='public'?{
    auth:{getUser:async()=>({data:{user:auth?{id:'user-a'}:null},error:null})},
    rpc:async(name,params)=>{calls.push({name,params});return {data:{can_access:true,access_state:state},error};},
  }:{
    from:table=>{
      const filters=[];
      const q={select:()=>q,eq:(key,value)=>{filters.push([key,value]);return q;},then:(resolve,reject)=>{calls.push({table,filters});return Promise.resolve({data:internalRoles,error:roleError}).then(resolve,reject);}};
      return q;
    },
    rpc:async(name,params)=>{calls.push({name,params});return {data:result,error:null};}
  }};
}
const req=(body={},headers={})=>new Request('https://project.example.invalid/functions/v1/revelado-licencia',{method:'POST',headers:{Origin:'https://editor-fotos-dc.netlify.app',Authorization:'Bearer signed-user','Content-Type':'application/json',...headers},body:JSON.stringify({action:'check',deviceToken:'a'.repeat(64),deviceName:'PC',...body})});
test('valida sesión, usa identidad del servidor y envía solo la huella',async()=>{
  const c=config(); const r=await handler(req({userId:'victim',plan:'free'}),c); assert.equal(r.status,200);
  const data=await r.json(); assert.equal(data.user_id,'user-a'); assert.equal(data.allowed,true);
  const args=c.calls.at(-1).params; assert.equal(args.p_user_id,'user-a');assert.notEqual(args.p_device_hash,'a'.repeat(64));assert.equal(args.p_device_hash.length,64);
  assert.equal('device_hash' in data,false);
});
test('sin JWT o con sesión inválida no consulta la licencia',async()=>{
  const c=config({auth:false});assert.equal((await handler(req(),c)).status,401);assert.equal(c.calls.length,0);
  assert.equal((await handler(req({}, {Authorization:''}),config())).status,401);
});
test('Free, permiso vencido o estado desconocido no activan dispositivos',async()=>{
  for(const state of ['free_active','locked','trial_active','unknown']) {
    const c=config({state});assert.equal((await handler(req({plan:'pro'}),c)).status,403);
    assert.equal(c.calls.some(x=>x.name==='dc_revelado_device_license'),false);
  }
});
test('fallos de permiso cierran el acceso; no usa fallback ante error de permiso',async()=>{
  const c=config({error:{code:'42501'}});assert.equal((await handler(req(),c)).status,503);assert.equal(c.calls.length,1);
});
test('origen no permitido y token malformado se rechazan',async()=>{
  assert.equal((await handler(req({}, {Origin:'https://evil.example.invalid'}),config())).status,403);
  const c=config();assert.equal((await handler(req({deviceToken:'wrong'}),c)).status,400);assert.equal(c.calls.length,0);
});
test('propaga límite y conflicto sin revelar credenciales',async()=>{
  const c=config({result:{allowed:false,status:409,code:'device_in_use',transfers_remaining:1,device_hash:'private'}});
  const r=await handler(req(),c);assert.equal(r.status,409);const d=await r.json();assert.equal(d.code,'device_in_use');assert.equal(d.transfers_remaining,1);assert.equal(d.device_hash,undefined);
});
test('preflight permite preview y enlace de despliegue del proyecto, sin abrir otros orígenes',async()=>{
  for(const origin of ['https://deploy-preview-1--editor-fotos-dc.netlify.app','https://6ade44418678760ac554f03e--editor-fotos-dc.netlify.app']) {
    const c=config();
    const preflight=await handler(new Request('https://project.example.invalid/',{method:'OPTIONS',headers:{Origin:origin}}),c);
    assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal(c.calls.length,0);
    const response=await handler(req({}, {Origin:origin}),c);
    assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),origin);
  }
  for(const origin of ['https://6ade44418678760ac554f03e--otra-app.netlify.app','https://editor-fotos-dc.netlify.app.evil.invalid','http://editor-fotos-dc.netlify.app']) {
    const r=await handler(req({}, {Origin:origin}),config());
    assert.equal(r.status,403);assert.equal(r.headers.has('Access-Control-Allow-Origin'),false);
  }
});
test('administración interna vigente omite activaciones y transferencias',async()=>{
  const internalRoles=[{plan:'internal_admin',status:'active',starts_at:'2020-01-01T00:00:00Z',ends_at:null}];
  for(const action of ['check','transfer']) {
    const c=config({state:'suite_full',internalRoles,result:{allowed:false,status:409,code:'device_in_use'}});
    const r=await handler(req({action,deviceToken:(action==='check'?'a':'b').repeat(64)}),c);
    assert.equal(r.status,200);const data=await r.json();assert.equal(data.allowed,true);assert.equal(data.license_mode,'internal_admin');
    assert.equal(c.calls.some(x=>x.name==='dc_revelado_device_license'),false);
    const query=c.calls.find(x=>x.table==='user_suite_access');assert.deepEqual(query.filters,[['user_id','user-a'],['plan','internal_admin']]);
  }
});
test('Suite paga, rol vencido/inactivo/futuro o enviado por el cliente conservan la restricción',async()=>{
  for(const role of [null,{plan:'monthly',status:'active',starts_at:'2020-01-01',ends_at:null},{plan:'internal_admin',status:'canceled',starts_at:'2020-01-01',ends_at:null},{plan:'internal_admin',status:'active',starts_at:'2020-01-01',ends_at:'2021-01-01'},{plan:'internal_admin',status:'active',starts_at:'2999-01-01',ends_at:null},{plan:'internal_admin',status:'active',starts_at:'bad date',ends_at:null}]) {
    const c=config({state:'suite_full',internalRoles:role?[role]:[],result:{allowed:false,status:409,code:'device_in_use'}});
    const r=await handler(req({plan:'internal_admin',is_admin:true,email:'admin@example.invalid'}),c);
    assert.equal(r.status,409);assert.equal((await r.json()).code,'device_in_use');
    assert.equal(c.calls.some(x=>x.name==='dc_revelado_device_license'),true);
  }
});
test('error leyendo roles no habilita administración ni cambia una activación',async()=>{
  const c=config({state:'suite_full',roleError:{code:'42501'}});
  const r=await handler(req(),c);assert.equal(r.status,503);assert.equal((await r.json()).code,'role_unavailable');
  assert.equal(c.calls.some(x=>x.name==='dc_revelado_device_license'),false);
});

