-- Locais usados em movimentacoes nao podem ser apagados sem destruir a
-- referencia historica. O campo ativo permite retira-los das telas sem tocar
-- nas saidas existentes.
alter table public.locais
add column if not exists ativo boolean not null default true;

-- A unicidade normalizada considera apenas os locais ativos. A restricao
-- legada de nome exato continua preservada para manter compatibilidade com a
-- restauracao de backups por upsert.
drop index if exists public.locais_nome_normalizado_uidx;

create unique index locais_nome_ativo_normalizado_uidx
on public.locais (public.normalizar_nome_catalogo(nome))
where ativo = true;

create or replace function public.arquivar_local(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_alteradas integer;
begin
  if auth.uid() is null
     or not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para arquivar locais.' using errcode = '42501';
  end if;

  update public.locais
  set ativo = false
  where id = p_id
    and ativo = true;

  get diagnostics v_alteradas = row_count;
  if v_alteradas = 0 then
    raise exception 'Local ativo nao encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.arquivar_local(uuid) from public, anon;
grant execute on function public.arquivar_local(uuid) to authenticated;

notify pgrst, 'reload schema';
