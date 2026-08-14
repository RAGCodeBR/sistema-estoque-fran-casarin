-- Estoque só pode ser alterado por uma requisição autenticada do aplicativo.
-- Chamadas com service role, scripts avulsos ou tarefas automáticas sem usuário
-- são recusadas. As funções de sincronização preservam auth.uid() do usuário
-- que iniciou a ação e, portanto, continuam funcionando normalmente.

create or replace function public.exigir_usuario_em_alteracao_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Alterações de estoque exigem uma ação de usuário autenticado.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
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
    execute format('drop trigger if exists exigir_usuario_%I on public.%I', tabela, tabela);
    execute format(
      'create trigger exigir_usuario_%I before insert or update or delete on public.%I for each row execute function public.exigir_usuario_em_alteracao_estoque()',
      tabela,
      tabela
    );
  end loop;
end;
$$;
