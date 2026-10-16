-- Cume° — banco na nuvem (Supabase). Rodar no SQL Editor do projeto.
-- Cada linha do IndexedDB vira uma linha aqui (tabela + chave + JSON). Cada pessoa só vê as próprias linhas (RLS).

create table if not exists public.rows (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  tbl text not null,
  pk text not null,
  data jsonb,
  deleted boolean not null default false,
  client_updated_at text not null default '',
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, pk)
);
create index if not exists rows_user_updated on public.rows (user_id, updated_at);

alter table public.rows enable row level security;
drop policy if exists "cada um com o seu" on public.rows;
create policy "cada um com o seu" on public.rows for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.rows from anon;

-- envio em lote: no mesmo registro, só sobrescreve se a mudança for igual ou mais nova que a guardada
create or replace function public.push_rows(items jsonb) returns integer
language sql security invoker set search_path = public as $$
  with up as (
    insert into public.rows (user_id, tbl, pk, data, deleted, client_updated_at)
    select auth.uid(), x->>'tbl', x->>'pk', x->'data', coalesce((x->>'deleted')::boolean, false), coalesce(x->>'cu', '')
    from jsonb_array_elements(items) x
    on conflict (user_id, tbl, pk) do update
      set data = excluded.data, deleted = excluded.deleted,
          client_updated_at = excluded.client_updated_at, updated_at = clock_timestamp()
      where excluded.client_updated_at >= public.rows.client_updated_at
    returning 1
  )
  select count(*)::integer from up;
$$;
revoke execute on function public.push_rows(jsonb) from public, anon;
grant execute on function public.push_rows(jsonb) to authenticated;

-- arquivos (PDFs, fotos): bucket privado, cada pessoa na própria pasta <user_id>/
insert into storage.buckets (id, name, public) values ('arquivos', 'arquivos', false) on conflict (id) do nothing;
drop policy if exists "arquivos: ler os seus" on storage.objects;
drop policy if exists "arquivos: enviar os seus" on storage.objects;
drop policy if exists "arquivos: trocar os seus" on storage.objects;
drop policy if exists "arquivos: apagar os seus" on storage.objects;
create policy "arquivos: ler os seus" on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arquivos: enviar os seus" on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arquivos: trocar os seus" on storage.objects for update to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "arquivos: apagar os seus" on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and (storage.foldername(name))[1] = auth.uid()::text);


-- lembretes no celular: link secreto de calendário (webcal) que o app do celular assina.
-- A função só devolve tarefas e eventos de quem tem o token (32+ caracteres); nada mais é exposto.
create table if not exists public.feeds (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
alter table public.feeds enable row level security;
drop policy if exists "feed: o seu" on public.feeds;
create policy "feed: o seu" on public.feeds for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke all on public.feeds from anon;

create or replace function public.feed_rows(t text) returns table (tbl text, data jsonb)
language sql stable security definer set search_path = public as $$
  select r.tbl, r.data from public.rows r
  join public.feeds f on f.user_id = r.user_id
  where length(t) >= 32 and f.token = t and not r.deleted and r.tbl in ('tasks', 'events');
$$;
revoke execute on function public.feed_rows(text) from public;
grant execute on function public.feed_rows(text) to anon, authenticated;
