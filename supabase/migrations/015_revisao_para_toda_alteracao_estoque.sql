-- Toda alteração nos dados de estoque precisa invalidar cópias abertas no
-- navegador. Sem isso, uma aba antiga pode passar pela validação de revisão e
-- substituir movimentos que foram gravados diretamente no banco.

create or replace function public.avancar_revisao_estoque_por_alteracao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.estoque_sync_state
  set revisao = revisao + 1,
      atualizado_em = now()
  where singleton = true;

  return null;
end;
$$;

do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'categorias', 'locais', 'produtos_brutos', 'produtos_fracionados',
    'entradas_central', 'saidas_central', 'producoes', 'saidas_fracionado',
    'ajustes_estoque', 'ajustes_fracionados', 'pedidos_compra',
    'itens_manuais_compra'
  ]
  loop
    execute format('drop trigger if exists avancar_revisao_%I on public.%I', tabela, tabela);
    execute format(
      'create trigger avancar_revisao_%I after insert or update or delete on public.%I for each statement execute function public.avancar_revisao_estoque_por_alteracao()',
      tabela,
      tabela
    );
  end loop;
end;
$$;
