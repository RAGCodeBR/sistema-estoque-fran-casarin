-- Move um produto entre os cadastros somente quando ele não possui histórico.
-- A transação preserva a rastreabilidade: qualquer vínculo bloqueia a conversão.
create or replace function public.converter_tipo_produto(
  p_origem text,
  p_nome text,
  p_tipo_destino text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bruto public.produtos_brutos%rowtype;
  fracionado public.produtos_fracionados%rowtype;
  v_historico text[] := array[]::text[];
begin
  if not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para converter o tipo do produto.' using errcode = '42501';
  end if;
  if p_origem not in ('bruto','fracionado') or p_tipo_destino not in ('Bruto','Fracionado') then
    raise exception 'Dados de conversao invalidos.' using errcode = '22023';
  end if;
  if (p_origem = 'bruto' and p_tipo_destino = 'Bruto') or (p_origem = 'fracionado' and p_tipo_destino = 'Fracionado') then
    return;
  end if;

  if p_origem = 'bruto' then
    select * into bruto from public.produtos_brutos where nome = p_nome for update;
    if not found then raise exception 'Produto bruto nao encontrado.' using errcode = 'P0002'; end if;
    if exists(select 1 from public.produtos_fracionados where nome = p_nome) then raise exception 'Já existe um produto fracionado com este nome.' using errcode = '23505'; end if;
    if exists(select 1 from public.entradas_central where produto_bruto_id = bruto.id) then v_historico := array_append(v_historico,'entradas na Central'); end if;
    if exists(select 1 from public.saidas_central where produto_bruto_id = bruto.id) then v_historico := array_append(v_historico,'saídas da Central'); end if;
    if exists(select 1 from public.producoes where produto_bruto_id = bruto.id) then v_historico := array_append(v_historico,'produções'); end if;
    if exists(select 1 from public.ajustes_estoque where produto_bruto_id = bruto.id) then v_historico := array_append(v_historico,'ajustes de estoque'); end if;
    if exists(select 1 from public.pedidos_compra where produto_bruto_id = bruto.id) then v_historico := array_append(v_historico,'pedidos de compra'); end if;
    if exists(select 1 from public.itens_manuais_compra where produto_bruto_id = bruto.id) then v_historico := array_append(v_historico,'itens manuais de compra'); end if;
    if exists(select 1 from public.produtos_fracionados where origem_bruto_id = bruto.id) then v_historico := array_append(v_historico,'produtos fracionados de origem'); end if;
    if cardinality(v_historico)>0 then raise exception 'Nao e possivel converter "%": possui historico vinculado (%).', p_nome, array_to_string(v_historico, ', ') using errcode='P0001'; end if;

    insert into public.produtos_fracionados(nome,categoria_id,tipo_produto,unidade,origem_bruto_id,rendimento_percent,estoque_minimo,validade_dias,ativo)
    values(bruto.nome,bruto.categoria_id,'Fracionado',bruto.unidade,null,100,bruto.estoque_minimo,bruto.validade_dias,bruto.ativo);
    delete from public.produtos_brutos where id=bruto.id;
  else
    select * into fracionado from public.produtos_fracionados where nome = p_nome for update;
    if not found then raise exception 'Produto fracionado nao encontrado.' using errcode = 'P0002'; end if;
    if exists(select 1 from public.produtos_brutos where nome = p_nome) then raise exception 'Já existe um produto bruto com este nome.' using errcode = '23505'; end if;
    if exists(select 1 from public.producoes where produto_fracionado_id = fracionado.id) then v_historico := array_append(v_historico,'produções'); end if;
    if exists(select 1 from public.saidas_fracionado where produto_fracionado_id = fracionado.id) then v_historico := array_append(v_historico,'saídas de fracionados'); end if;
    if exists(select 1 from public.ajustes_fracionados where produto_fracionado_id = fracionado.id) then v_historico := array_append(v_historico,'ajustes de fracionados'); end if;
    if cardinality(v_historico)>0 then raise exception 'Nao e possivel converter "%": possui historico vinculado (%).', p_nome, array_to_string(v_historico, ', ') using errcode='P0001'; end if;

    insert into public.produtos_brutos(nome,categoria_id,tipo_produto,unidade,estoque_minimo,fornecedor,preco_medio,validade_dias,ativo)
    values(fracionado.nome,fracionado.categoria_id,'Bruto',fracionado.unidade,fracionado.estoque_minimo,null,0,fracionado.validade_dias,fracionado.ativo);
    delete from public.produtos_fracionados where id=fracionado.id;
  end if;

  update public.estoque_sync_state set revisao=revisao+1,atualizado_em=now() where singleton=true;
end;
$$;

revoke all on function public.converter_tipo_produto(text,text,text) from public;
grant execute on function public.converter_tipo_produto(text,text,text) to authenticated;
