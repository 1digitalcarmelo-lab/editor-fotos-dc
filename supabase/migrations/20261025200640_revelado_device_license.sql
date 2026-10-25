-- Preparado para revisión. No aplica cambios ni concede accesos hasta ejecutarlo.
begin;

insert into public.products(product_slug,public_name,short_description,app_url,category,is_active,display_order,allows_trial,default_free_usage,allows_free)
select 'editor-fotos-dc','Revelado DC','Editor de fotos por lote con procesamiento local.','https://editor-fotos-dc.netlify.app/',category,true,110,false,0,false
from public.products where product_slug='generador-invitaciones'
on conflict (product_slug) do nothing;

create table if not exists public.revelado_device_licenses (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  device_name text not null check (length(device_name) between 1 and 80),
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  transfer_month date not null,
  transfers_used integer not null default 0 check (transfers_used between 0 and 2)
);
alter table public.revelado_device_licenses enable row level security;
revoke all on public.revelado_device_licenses from public, anon, authenticated;
grant select,insert,update,delete on public.revelado_device_licenses to service_role;

create or replace function public.dc_revelado_device_license(
  p_user_id uuid,p_device_hash text,p_device_name text,p_action text
) returns jsonb language plpgsql security invoker
set search_path = pg_catalog,public
as $$
declare
  existing public.revelado_device_licenses%rowtype;
  month_now date := date_trunc('month',now() at time zone 'America/Argentina/Buenos_Aires')::date;
  used integer;
begin
  if current_user not in ('service_role','postgres') then
    raise insufficient_privilege using message='Operación solo de servidor';
  end if;
  if p_user_id is null or p_device_hash is null or p_device_hash !~ '^[a-f0-9]{64}$'
    or coalesce(length(p_device_name),0) not between 1 and 80
    or p_action is null or p_action not in ('check','transfer') then
    return jsonb_build_object('allowed',false,'code','invalid_request','status',400);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('dc-revelado-device:'||p_user_id::text,0));
  select * into existing from public.revelado_device_licenses where user_id=p_user_id for update;
  if not found then
    insert into public.revelado_device_licenses(user_id,device_hash,device_name,transfer_month)
    values(p_user_id,p_device_hash,p_device_name,month_now);
    return jsonb_build_object('allowed',true,'status',200,'transfers_remaining',2);
  end if;
  used := case when existing.transfer_month=month_now then existing.transfers_used else 0 end;
  if existing.device_hash = p_device_hash then
    update public.revelado_device_licenses set last_seen_at=now(),transfer_month=month_now,transfers_used=used where user_id=p_user_id;
    return jsonb_build_object('allowed',true,'status',200,'transfers_remaining',2-used);
  end if;
  if p_action='check' then
    return jsonb_build_object('allowed',false,'status',409,'code','device_in_use','transfers_remaining',2-used,
      'message','Esta licencia ya está activa en otra instalación. Puedes transferirla a este navegador.');
  end if;
  if used>=2 then
    return jsonb_build_object('allowed',false,'status',403,'code','transfer_limit','transfers_remaining',0,
      'message','Ya usaste las dos transferencias de este mes. Contacta a Digital Carmelo si necesitas ayuda.');
  end if;
  update public.revelado_device_licenses set device_hash=p_device_hash,device_name=p_device_name,activated_at=now(),last_seen_at=now(),transfer_month=month_now,transfers_used=used+1 where user_id=p_user_id;
  return jsonb_build_object('allowed',true,'status',200,'transfers_remaining',1-used);
end;
$$;
revoke execute on function public.dc_revelado_device_license(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.dc_revelado_device_license(uuid,text,text,text) to service_role;
commit;

