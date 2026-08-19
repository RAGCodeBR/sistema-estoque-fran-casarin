-- Impede categorias ativas e locais equivalentes, inclusive quando o nome
-- difere apenas por acentos, maiusculas, espacos repetidos ou espacos nas pontas.
-- Nenhum registro existente e alterado por esta migracao.

create or replace function public.normalizar_nome_catalogo(p_nome text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.translate(
    pg_catalog.lower(
      pg_catalog.regexp_replace(pg_catalog.btrim(p_nome), '[[:space:]]+', ' ', 'g')
    ),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
$$;

create or replace function public.limpar_nome_catalogo_antes_salvar()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.nome := pg_catalog.regexp_replace(pg_catalog.btrim(new.nome), '[[:space:]]+', ' ', 'g');
  return new;
end;
$$;

drop trigger if exists categorias_limpar_nome on public.categorias;
create trigger categorias_limpar_nome
before insert or update of nome on public.categorias
for each row execute function public.limpar_nome_catalogo_antes_salvar();

drop trigger if exists locais_limpar_nome on public.locais;
create trigger locais_limpar_nome
before insert or update of nome on public.locais
for each row execute function public.limpar_nome_catalogo_antes_salvar();

create unique index categorias_nome_ativo_normalizado_uidx
on public.categorias (public.normalizar_nome_catalogo(nome))
where ativo = true;

create unique index locais_nome_normalizado_uidx
on public.locais (public.normalizar_nome_catalogo(nome));

revoke all on function public.limpar_nome_catalogo_antes_salvar() from public, anon, authenticated;

notify pgrst, 'reload schema';
