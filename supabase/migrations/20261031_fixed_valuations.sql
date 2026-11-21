begin;
create table if not exists portfolio_private.daily_valuations(user_id text not null references portfolio_private.users(id),timestamp timestamptz not null,document jsonb not null,primary key(user_id,timestamp));
alter table portfolio_private.daily_valuations enable row level security;
revoke all on portfolio_private.daily_valuations from public,anon,authenticated;
grant all on portfolio_private.daily_valuations to service_role;
create or replace function public.portfolio_valuation_rpc(action text,args jsonb default '{}'::jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;owner_id text;point jsonb;stamp timestamptz;
begin
 if action='users' then select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'createdAt',created_at)),'[]'::jsonb) into result from portfolio_private.users;return result;end if;
 owner_id=args->>'userId';if owner_id is null or not exists(select 1 from portfolio_private.users where id=owner_id) then raise exception 'invalid_owner';end if;
 if action='read' then select coalesce(jsonb_agg(document order by timestamp),'[]'::jsonb) into result from portfolio_private.daily_valuations where user_id=owner_id;
 elsif action='save' then
  point=args->'point';stamp=(point->>'timestamp')::timestamptz;
  if (stamp at time zone 'Asia/Shanghai')::time <> '00:00:00'::time or stamp>now() or point->>'basis'<>'scheduled' then raise exception 'invalid_boundary';end if;
  insert into portfolio_private.daily_valuations(user_id,timestamp,document) values(owner_id,stamp,point) on conflict(user_id,timestamp) do nothing;
  result='true'::jsonb;
 else raise exception 'unknown_action';end if;
 return result;
end;
$$;
revoke all on function public.portfolio_valuation_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.portfolio_valuation_rpc(text,jsonb) to service_role;
commit;
