begin;
create schema if not exists portfolio_private;
create table if not exists portfolio_private.state (
 id integer primary key check(id=1), revision bigint not null default 0, document jsonb
);
insert into portfolio_private.state(id) values(1) on conflict do nothing;
create table if not exists portfolio_private.history (
 sequence bigint generated always as identity primary key, id text unique not null,
 type text not null, document jsonb not null
);
create table if not exists portfolio_private.backups (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(), document jsonb not null
);
create table if not exists portfolio_private.price_cache (
 key text primary key, fetched_at bigint not null, document jsonb not null
);
create table if not exists portfolio_private.login_attempts (
 key text primary key, attempts integer not null, expires_at timestamptz not null
);
create index if not exists portfolio_history_type_sequence on portfolio_private.history(type,sequence);
alter table portfolio_private.state enable row level security;
alter table portfolio_private.history enable row level security;
alter table portfolio_private.backups enable row level security;
alter table portfolio_private.price_cache enable row level security;
alter table portfolio_private.login_attempts enable row level security;
revoke all on schema portfolio_private from public,anon,authenticated;
revoke all on all tables in schema portfolio_private from public,anon,authenticated;
revoke all on all sequences in schema portfolio_private from public,anon,authenticated;
grant usage on schema portfolio_private to service_role;
grant all on all tables in schema portfolio_private to service_role;
grant usage,select on all sequences in schema portfolio_private to service_role;

-- One server-only RPC. The row lock makes holdings, history, and recovery backups atomic.
create or replace function public.portfolio_rpc(action text,args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_state jsonb; old_revision bigint; result jsonb; item jsonb; counter integer;
begin
 case action
 when 'health' then
  result=jsonb_build_object('ready',true);
 when 'read' then
  select document into result from portfolio_private.state where id=1;
 when 'save' then
  select document,revision into old_state,old_revision from portfolio_private.state where id=1 for update;
  if old_revision <> (args->>'revision')::bigint then raise exception 'portfolio_conflict';end if;
  if (args->'state'->>'revision')::bigint <> old_revision+1 then raise exception 'invalid_revision';end if;
  if coalesce((args->>'backup')::boolean,false) and old_state is not null then
   insert into portfolio_private.backups(document) values(old_state);
   delete from portfolio_private.backups where id not in(select id from portfolio_private.backups order by id desc limit 20);
  end if;
  update portfolio_private.state set document=args->'state',revision=old_revision+1 where id=1;
  for item in select value from jsonb_array_elements(coalesce(args->'records','[]'::jsonb)) loop
   insert into portfolio_private.history(id,type,document) values(item->>'id',item->>'type',item) on conflict(id) do nothing;
  end loop;
  result=args->'state';
 when 'history' then
  select jsonb_build_object('records',coalesce(jsonb_agg(document order by sequence desc),'[]'::jsonb),'nextCursor',case when count(*)>50 then min(sequence) filter(where n=50) else null end)
  into result from (select sequence,document,row_number() over(order by sequence desc) n from portfolio_private.history where sequence < (args->>'cursor')::bigint and ((args->>'scope') <> 'trades' or type in('买入','卖出')) order by sequence desc limit 51) rows;
  result=jsonb_set(result,'{records}',coalesce((select jsonb_agg(value) from jsonb_array_elements(result->'records') with ordinality t(value,n) where n<=50),'[]'::jsonb));
  select result||jsonb_build_object('total',count(*)) into result from portfolio_private.history where (args->>'scope') <> 'trades' or type in('买入','卖出');
 when 'export-history' then
  select coalesce(jsonb_agg(document order by sequence),'[]'::jsonb) into result from portfolio_private.history;
 when 'cache-read' then
  select jsonb_build_object('fetchedAt',fetched_at,'series',document) into result from portfolio_private.price_cache where key=args->>'key';
 when 'cache-save' then
  insert into portfolio_private.price_cache(key,fetched_at,document) values(args->>'key',(extract(epoch from clock_timestamp())*1000)::bigint,args->'series') on conflict(key) do update set fetched_at=excluded.fetched_at,document=excluded.document;
  delete from portfolio_private.price_cache where fetched_at < (extract(epoch from now()-interval '7 days')*1000)::bigint;
  result='true'::jsonb;
 when 'login-attempt' then
  delete from portfolio_private.login_attempts where expires_at<now();
  insert into portfolio_private.login_attempts(key,attempts,expires_at) values(args->>'key',1,now()+interval '15 minutes') on conflict(key) do update set attempts=portfolio_private.login_attempts.attempts+1 returning attempts into counter;
  result=to_jsonb(counter<=10);
 else raise exception 'unknown_action';
 end case;
 return result;
end;
$$;
revoke all on function public.portfolio_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.portfolio_rpc(text,jsonb) to service_role;
commit;
