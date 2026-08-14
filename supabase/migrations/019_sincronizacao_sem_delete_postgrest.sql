-- O PostgREST do projeto aplica pg_safeupdate tambem aos comandos executados
-- por RPC. A sincronizacao continua atomica, mas nao emite DELETE: as tabelas
-- de movimentos sao truncadas dentro da transacao e os cadastros ausentes sao
-- desativados. Antes disso, a funcao exige usuario autenticado, papel valido e
-- revisao atual do estoque.
do $migration$
declare
  definition text;
  tabela text;
begin
  select pg_get_functiondef('public.sincronizar_estoque_atomico(jsonb,bigint,text)'::regprocedure)
  into definition;

  foreach tabela in array array[
    'itens_manuais_compra', 'pedidos_compra', 'ajustes_fracionados',
    'ajustes_estoque', 'saidas_fracionado', 'producoes',
    'saidas_central', 'entradas_central'
  ] loop
    definition := replace(
      definition,
      format('delete from public.%s;', tabela),
      format('truncate table public.%s;', tabela)
    );
    definition := replace(
      definition,
      format('delete from public.%s where id <> ''00000000-0000-0000-0000-000000000000''::uuid;', tabela),
      format('truncate table public.%s;', tabela)
    );
  end loop;

  definition := replace(
    definition,
    'delete from public.produtos_fracionados pf where not exists (',
    'update public.produtos_fracionados pf set ativo = false where not exists ('
  );
  definition := replace(
    definition,
    'delete from public.produtos_brutos pb where not exists (',
    'update public.produtos_brutos pb set ativo = false where not exists ('
  );
  definition := replace(
    definition,
    'delete from public.locais l where not exists (',
    'update public.locais l set nome = nome where not exists ('
  );
  definition := replace(
    definition,
    'delete from public.categorias c where c.nome <> ''Outros'' and not exists (',
    'update public.categorias c set nome = nome where c.nome <> ''Outros'' and not exists ('
  );

  if position('delete from public.' in definition) > 0 then
    raise exception 'A funcao ainda contem DELETE apos a conversao de seguranca.';
  end if;

  execute definition;
end;
$migration$;
