const PRODUCT = 'editor-fotos-dc';
const FULL = new Set(['product_full','bundle_full','suite_full']);
const allowedOrigin = (origin: string) => /^https:\/\/(editor-fotos-dc\.netlify\.app|(?:deploy-preview-\d+|[a-f0-9]{24})--editor-fotos-dc\.netlify\.app)$/.test(origin);
type Config = { url: string; publicKey: string; secretKey: string; createClient: (...args: any[]) => any };

export async function handleLicense(req: Request, config: Config) {
  const origin = req.headers.get('Origin');
  const cors: Record<string,string> = {
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS', 'Vary':'Origin',
  };
  if (origin && allowedOrigin(origin)) cors['Access-Control-Allow-Origin'] = origin;
  const reply = (status: number, data: object) => new Response(JSON.stringify(data), {
    status,headers:{ ...cors,'Content-Type':'application/json','Cache-Control':'no-store' },
  });
  if (origin && !allowedOrigin(origin)) return reply(403,{ allowed:false,code:'origin_denied',message:'Abre Revelado DC desde su dirección oficial.' });
  if (req.method==='OPTIONS') return new Response(null,{ status:204,headers:cors });
  if (req.method!=='POST') return reply(405,{ allowed:false,code:'method_not_allowed' });
  if (!config.url || !config.publicKey || !config.secretKey) return reply(503,{ allowed:false,code:'not_configured',message:'La verificación de licencias no está disponible. Intenta más tarde.' });
  const auth = req.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(auth)) return reply(401,{ allowed:false,code:'not_authenticated',message:'Inicia sesión para continuar.' });
  try {
    const userClient = config.createClient(config.url,config.publicKey,{
      global:{ headers:{ Authorization:auth } },auth:{ persistSession:false,autoRefreshToken:false },
    });
    const { data:{ user },error:authError } = await userClient.auth.getUser(auth.slice(7));
    if (authError || !user) return reply(401,{ allowed:false,code:'not_authenticated',message:'Tu sesión venció. Vuelve a ingresar.' });
    const raw = await req.text();
    if (raw.length>4096) return reply(413,{ allowed:false,code:'request_too_large' });
    let body;
    try { body=JSON.parse(raw); } catch { return reply(400,{ allowed:false,code:'invalid_request' }); }
    if (!body || !['check','transfer'].includes(body.action) || typeof body.deviceToken!=='string' || !/^[a-f0-9]{64}$/.test(body.deviceToken) || typeof body.deviceName!=='string' || !body.deviceName.trim() || body.deviceName.length>80) return reply(400,{ allowed:false,code:'invalid_request',message:'Los datos de activación no son válidos.' });
    let access = await userClient.rpc('get_my_product_access_v2',{ p_product_slug:PRODUCT });
    if (access.error?.code==='PGRST202') access = await userClient.rpc('get_my_product_access',{ p_product_slug:PRODUCT });
    if (access.error) return reply(503,{ allowed:false,code:'access_unavailable',message:'No pudimos comprobar tu permiso. Vuelve a intentar.' });
    const row = Array.isArray(access.data) ? access.data[0] : access.data;
    if (row?.can_access!==true || !FULL.has(row.access_state)) return reply(403,{ allowed:false,code:'no_access',message:'Tu cuenta no tiene una licencia completa vigente de Revelado DC.' });
    const admin = config.createClient(config.url,config.secretKey,{ auth:{ persistSession:false,autoRefreshToken:false } });
    // La excepción pertenece al rol interno de la base, no al correo, al JWT editable
    // ni a un indicador enviado por el navegador. Una Suite de pago no es administración.
    const { data:internalRoles,error:roleError } = await admin.from('user_suite_access')
      .select('plan,status,starts_at,ends_at').eq('user_id',user.id).eq('plan','internal_admin');
    if (roleError || !Array.isArray(internalRoles)) return reply(503,{ allowed:false,code:'role_unavailable',message:'No pudimos comprobar tu tipo de acceso. Vuelve a intentar.' });
    const now = Date.now();
    const internalAdmin = internalRoles.some((r: any) => r.plan==='internal_admin' && r.status==='active'
      && Number.isFinite(Date.parse(r.starts_at)) && Date.parse(r.starts_at)<=now
      && (r.ends_at===null || (Number.isFinite(Date.parse(r.ends_at)) && Date.parse(r.ends_at)>now)));
    if (internalAdmin) return reply(200,{ allowed:true,user_id:user.id,license_mode:'internal_admin' });
    const bytes = new TextEncoder().encode(body.deviceToken);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const { data,error } = await admin.rpc('dc_revelado_device_license',{
      p_user_id:user.id,p_device_hash:hash,p_device_name:body.deviceName.trim(),p_action:body.action,
    });
    if (error || !data || typeof data.allowed!=='boolean') return reply(503,{ allowed:false,code:'license_unavailable',message:'No pudimos verificar la activación. Vuelve a intentar.' });
    // No devolver tokens ni huellas de activaciones al cliente.
    return reply(data.status || 200,{ allowed:data.allowed,user_id:user.id,code:data.code,transfers_remaining:data.transfers_remaining,message:data.message });
  } catch {
    return reply(503,{ allowed:false,code:'unavailable',message:'No pudimos verificar tu licencia. Vuelve a intentar.' });
  }
}

