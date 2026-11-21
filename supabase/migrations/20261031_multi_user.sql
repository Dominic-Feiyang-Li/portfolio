begin;
-- Preserve every existing document, revision, audit row and backup under a reserved legacy owner.
create table if not exists portfolio_private.users(id text primary key,username text unique not null,password_hash text not null,created_at timestamptz not null default now());
create table if not exists portfolio_private.sessions(token_hash text primary key,user_id text not null references portfolio_private.users(id) on delete cascade,expires_at bigint not null,remember boolean not null);
create index if not exists portfolio_sessions_user on portfolio_private.sessions(user_id);
alter table portfolio_private.users enable row level security;
alter table portfolio_private.sessions enable row level security;
alter table portfolio_private.state add column if not exists user_id text not null default 'legacy-owner';
alter table portfolio_private.state drop constraint if exists state_pkey;
alter table portfolio_private.state add constraint state_pkey primary key(user_id);
alter table portfolio_private.history add column if not exists user_id text not null default 'legacy-owner';
alter table portfolio_private.history drop constraint if exists history_id_key;
create unique index if not exists portfolio_history_owner_id on portfolio_private.history(user_id,id);
create index if not exists portfolio_history_owner_sequence on portfolio_private.history(user_id,sequence);
alter table portfolio_private.backups add column if not exists user_id text not null default 'legacy-owner';
revoke all on all tables in schema portfolio_private from public,anon,authenticated;
grant all on all tables in schema portfolio_private to service_role;

create or replace function public.portfolio_auth_rpc(action text,args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; counter integer; item jsonb;
begin
 case action
 when 'create-user' then
  item=args->'user';
  if (item->>'id') !~ '^[a-z0-9_]{3,32}$' or item->>'id' <> item->>'username' or (item->>'passwordHash') !~ '^scrypt-v1:[a-f0-9]{48}:[a-f0-9]{128}$' then raise exception 'invalid_user';end if;
  insert into portfolio_private.users(id,username,password_hash) values(item->>'id',item->>'username',item->>'passwordHash');
  insert into portfolio_private.state(id,user_id) values(1,item->>'id') on conflict(user_id) do nothing;
  result='true'::jsonb;
 when 'find-user' then
  select jsonb_build_object('id',id,'username',username,'passwordHash',password_hash) into result from portfolio_private.users where username=args->>'username';
 when 'session-create' then
  delete from portfolio_private.sessions where expires_at <= (extract(epoch from now())*1000)::bigint;
  insert into portfolio_private.sessions(token_hash,user_id,expires_at,remember) values(args->>'hash',args->>'userId',(args->>'expiresAt')::bigint,(args->>'remember')::boolean);result='true'::jsonb;
 when 'session-read' then
  select jsonb_build_object('id',u.id,'username',u.username,'expiresAt',s.expires_at,'remember',s.remember) into result from portfolio_private.sessions s join portfolio_private.users u on u.id=s.user_id where s.token_hash=args->>'hash' and s.expires_at>(args->>'now')::bigint;
 when 'session-renew' then
  update portfolio_private.sessions set expires_at=(args->>'expiresAt')::bigint where token_hash=args->>'hash';result='true'::jsonb;
 when 'session-delete' then
  delete from portfolio_private.sessions where token_hash=args->>'hash';result='true'::jsonb;
 when 'login-attempt' then
  delete from portfolio_private.login_attempts where expires_at<now();
  insert into portfolio_private.login_attempts(key,attempts,expires_at) values(args->>'key',1,now()+interval '15 minutes') on conflict(key) do update set attempts=portfolio_private.login_attempts.attempts+1 returning attempts into counter;
  result=to_jsonb(counter<=least(60,greatest(1,(args->>'limit')::integer)));
 else raise exception 'unknown_auth_action';
 end case;
 return result;
end;
$$;
revoke all on function public.portfolio_auth_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.portfolio_auth_rpc(text,jsonb) to service_role;

create or replace function public.portfolio_rpc(action text,args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare old_state jsonb; old_revision bigint; result jsonb; item jsonb; owner_id text;
begin
 if action in('read','save','history','export-history') then
  owner_id=args->>'userId';
  if owner_id is null or not exists(select 1 from portfolio_private.users where id=owner_id) then raise exception 'missing_or_invalid_owner';end if;
  insert into portfolio_private.state(id,user_id) values(1,owner_id) on conflict(user_id) do nothing;
 end if;
 case action
 when 'health' then result=jsonb_build_object('ready',true);
 when 'read' then select document into result from portfolio_private.state where user_id=owner_id;
 when 'save' then
  select document,revision into old_state,old_revision from portfolio_private.state where user_id=owner_id for update;
  if old_revision <> (args->>'revision')::bigint then raise exception 'portfolio_conflict';end if;
  if (args->'state'->>'revision')::bigint <> old_revision+1 then raise exception 'invalid_revision';end if;
  if coalesce((args->>'backup')::boolean,false) and old_state is not null then
   insert into portfolio_private.backups(user_id,document) values(owner_id,old_state);
   delete from portfolio_private.backups where user_id=owner_id and id not in(select id from portfolio_private.backups where user_id=owner_id order by id desc limit 20);
  end if;
  update portfolio_private.state set document=args->'state',revision=old_revision+1 where user_id=owner_id;
  for item in select value from jsonb_array_elements(coalesce(args->'records','[]'::jsonb)) loop
   insert into portfolio_private.history(user_id,id,type,document) values(owner_id,item->>'id',item->>'type',item) on conflict(user_id,id) do nothing;
  end loop;
  result=args->'state';
 when 'history' then
  select jsonb_build_object('records',coalesce(jsonb_agg(document order by sequence desc),'[]'::jsonb),'nextCursor',case when count(*)>50 then min(sequence) filter(where n=50) else null end)
  into result from (select sequence,document,row_number() over(order by sequence desc) n from portfolio_private.history where user_id=owner_id and sequence < (args->>'cursor')::bigint and ((args->>'scope') <> 'trades' or type in('买入','卖出')) order by sequence desc limit 51) rows;
  result=jsonb_set(result,'{records}',coalesce((select jsonb_agg(value) from jsonb_array_elements(result->'records') with ordinality t(value,n) where n<=50),'[]'::jsonb));
  select result||jsonb_build_object('total',count(*)) into result from portfolio_private.history where user_id=owner_id and ((args->>'scope') <> 'trades' or type in('买入','卖出'));
 when 'export-history' then select coalesce(jsonb_agg(document order by sequence),'[]'::jsonb) into result from portfolio_private.history where user_id=owner_id;
 when 'cache-read' then select jsonb_build_object('fetchedAt',fetched_at,'series',document) into result from portfolio_private.price_cache where key=args->>'key';
 when 'cache-save' then
  insert into portfolio_private.price_cache(key,fetched_at,document) values(args->>'key',(extract(epoch from clock_timestamp())*1000)::bigint,args->'series') on conflict(key) do update set fetched_at=excluded.fetched_at,document=excluded.document;
  delete from portfolio_private.price_cache where fetched_at < (extract(epoch from now()-interval '7 days')*1000)::bigint;result='true'::jsonb;
 else raise exception 'unknown_action';
 end case;
 return result;
end;
$$;
revoke all on function public.portfolio_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.portfolio_rpc(text,jsonb) to service_role;
commit;
