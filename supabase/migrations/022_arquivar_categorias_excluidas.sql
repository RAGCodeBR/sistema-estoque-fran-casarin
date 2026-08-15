-- Categorias removidas pela interface sao arquivadas, sem apagar o historico
-- nem depender de DELETE (bloqueado pelo modo seguro do PostgREST).
alter table public.categorias
  add column if not exists ativo boolean not null default true;

update public.categorias set ativo = true where ativo is null;

do $migration$
declare
  definition text;
  old_insert text :=
    '    insert into public.categorias(nome)' || E'\n' ||
    '    select nome from nomes where nome is not null' || E'\n' ||
    '    on conflict (nome) do nothing;';
  new_insert text :=
    '    insert into public.categorias(nome, ativo)' || E'\n' ||
    '    select nome, true from nomes where nome is not null' || E'\n' ||
    '    on conflict (nome) do update set ativo = true;';
  marker text := E'\n\n    insert into public.entradas_central';
  archive_block text := $sql$

    update public.categorias c
    set ativo = false
    where c.nome <> 'Outros'
      and not exists (
        select 1
        from (
          select nullif(trim(x.nome), '') as nome
          from jsonb_to_recordset(coalesce(p_dados->'categorias', '[]'::jsonb)) as x(nome text)
          union
          select nullif(trim(x.categoria), '')
          from jsonb_to_recordset(coalesce(p_dados->'brutos', '[]'::jsonb)) as x(categoria text)
          union
          select nullif(trim(x.categoria), '')
          from jsonb_to_recordset(coalesce(p_dados->'fracionados', '[]'::jsonb)) as x(categoria text)
        ) nomes_ativos
        where nomes_ativos.nome = c.nome
      );
$sql$;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure)
  into definition;

  if position(old_insert in definition) = 0 or position(marker in definition) = 0 then
    raise exception 'A funcao de sincronizacao esperada nao foi encontrada.';
  end if;

  definition := replace(definition, old_insert, new_insert);
  definition := replace(definition, marker, archive_block || marker);
  execute definition;
end;
$migration$;
