-- Estabiliza a sincronização do legado e impede que a auditoria técnica
-- consuma o banco com cópias completas de movimentos de estoque.

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  -- Upserts do sistema legado repetem linhas já idênticas. Não transforme isso
  -- em uma atualização real (nem em um novo evento de auditoria).
  if (to_jsonb(new) - 'atualizado_em') is not distinct from (to_jsonb(old) - 'atualizado_em') then
    return old;
  end if;
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_id uuid;
  dados_antigos jsonb;
  dados_novos jsonb;
begin
  -- Movimentos e pedidos já possuem histórico operacional próprio. Gravar a
  -- linha inteira antes/depois para cada sincronização em massa não agrega
  -- rastreabilidade e esgota o plano Free.
  if tg_table_name = any (array[
    'entradas_central', 'saidas_central', 'producoes', 'saidas_fracionado',
    'ajustes_estoque', 'pedidos_compra', 'itens_manuais_compra'
  ]) then
    return coalesce(new, old);
  end if;

  dados_antigos := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'atualizado_em' else null end;
  dados_novos := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'atualizado_em' else null end;

  if tg_op = 'UPDATE' and dados_antigos is not distinct from dados_novos then
    return new;
  end if;

  row_id := coalesce(new.id, old.id);
  insert into public.auditoria(tabela, registro_id, operacao, dados_anteriores, dados_novos, usuario_id)
  values (tg_table_name, row_id, tg_op, dados_antigos, dados_novos, auth.uid());
  return coalesce(new, old);
end;
$$;

-- Índices das telas de sugestão e conferência: reduzem o tempo das consultas
-- de saldo e dos pedidos pendentes sem alterar os dados existentes.
create index if not exists idx_entradas_central_produto_data on public.entradas_central(produto_bruto_id, data);
create index if not exists idx_saidas_central_produto_data on public.saidas_central(produto_bruto_id, data);
create index if not exists idx_ajustes_estoque_produto_data on public.ajustes_estoque(produto_bruto_id, data);
create index if not exists idx_pedidos_compra_produto_status on public.pedidos_compra(produto_bruto_id, status);
