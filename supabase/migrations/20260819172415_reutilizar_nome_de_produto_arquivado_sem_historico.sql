-- Um produto arquivado e sem qualquer vínculo pode liberar seu nome para um
-- produto ativo. Produtos com movimentos permanecem protegidos, evitando que
-- saldos ou históricos de itens diferentes sejam mesclados.
create or replace function public.atualizar_produto_bruto(
  p_nome_atual text, p_nome text, p_categoria text, p_tipo_produto text,
  p_unidade text, p_estoque_minimo numeric, p_fornecedor text,
  p_preco_medio numeric, p_validade_dias integer
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_produto uuid;
  v_categoria uuid;
  v_conflito uuid;
  v_conflito_ativo boolean;
  v_nome text := nullif(trim(p_nome), '');
begin
  if auth.uid() is null or not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para editar produtos.' using errcode = '42501';
  end if;
  select id into v_produto from public.produtos_brutos where nome = p_nome_atual and ativo = true for update;
  if v_produto is null then raise exception 'Produto bruto nao encontrado.' using errcode = 'P0002'; end if;
  if v_nome is null then raise exception 'Informe o nome do produto.' using errcode = 'P0001'; end if;
  select id, ativo into v_conflito, v_conflito_ativo from public.produtos_brutos where nome = v_nome and id <> v_produto for update;
  if v_conflito is not null then
    if v_conflito_ativo then
      raise exception 'Ja existe outro produto bruto ativo com esse nome.' using errcode = '23505';
    end if;
    if exists (select 1 from public.entradas_central where produto_bruto_id = v_conflito)
      or exists (select 1 from public.saidas_central where produto_bruto_id = v_conflito)
      or exists (select 1 from public.producoes where produto_bruto_id = v_conflito)
      or exists (select 1 from public.ajustes_estoque where produto_bruto_id = v_conflito)
      or exists (select 1 from public.pedidos_compra where produto_bruto_id = v_conflito)
      or exists (select 1 from public.itens_manuais_compra where produto_bruto_id = v_conflito)
      or exists (select 1 from public.produtos_fracionados where origem_bruto_id = v_conflito) then
      raise exception 'Esse nome pertence a um produto arquivado com histórico. Para preservar os saldos, ele não pode ser reutilizado automaticamente.' using errcode = 'P0001';
    end if;
    delete from public.produtos_brutos where id = v_conflito;
  end if;
  select id into v_categoria from public.categorias where nome = p_categoria and ativo = true;
  if v_categoria is null then raise exception 'Categoria nao encontrada.' using errcode = 'P0002'; end if;
  update public.produtos_brutos
  set nome = v_nome, categoria_id = v_categoria,
      tipo_produto = coalesce(nullif(trim(p_tipo_produto), ''), 'Bruto'),
      unidade = coalesce(nullif(trim(p_unidade), ''), 'UN'),
      estoque_minimo = coalesce(p_estoque_minimo, 0), fornecedor = nullif(trim(p_fornecedor), ''),
      preco_medio = coalesce(p_preco_medio, 0), validade_dias = coalesce(p_validade_dias, 0)
  where id = v_produto;
end;
$$;

create or replace function public.atualizar_produto_fracionado(
  p_nome_atual text, p_nome text, p_categoria text, p_tipo_produto text,
  p_unidade text, p_origem text, p_rendimento numeric, p_estoque_minimo numeric,
  p_fornecedor text, p_preco_medio numeric, p_validade_dias integer
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_produto uuid;
  v_categoria uuid;
  v_origem uuid;
  v_conflito uuid;
  v_conflito_ativo boolean;
  v_nome text := nullif(trim(p_nome), '');
begin
  if auth.uid() is null or not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para editar produtos.' using errcode = '42501';
  end if;
  select id into v_produto from public.produtos_fracionados where nome = p_nome_atual and ativo = true for update;
  if v_produto is null then raise exception 'Produto fracionado nao encontrado.' using errcode = 'P0002'; end if;
  if v_nome is null then raise exception 'Informe o nome do produto.' using errcode = 'P0001'; end if;
  select id, ativo into v_conflito, v_conflito_ativo from public.produtos_fracionados where nome = v_nome and id <> v_produto for update;
  if v_conflito is not null then
    if v_conflito_ativo then
      raise exception 'Ja existe outro produto fracionado ativo com esse nome.' using errcode = '23505';
    end if;
    if exists (select 1 from public.producoes where produto_fracionado_id = v_conflito)
      or exists (select 1 from public.saidas_fracionado where produto_fracionado_id = v_conflito)
      or exists (select 1 from public.ajustes_fracionados where produto_fracionado_id = v_conflito) then
      raise exception 'Esse nome pertence a um produto arquivado com histórico. Para preservar os saldos, ele não pode ser reutilizado automaticamente.' using errcode = 'P0001';
    end if;
    delete from public.produtos_fracionados where id = v_conflito;
  end if;
  select id into v_categoria from public.categorias where nome = p_categoria and ativo = true;
  if v_categoria is null then raise exception 'Categoria nao encontrada.' using errcode = 'P0002'; end if;
  if nullif(trim(p_origem), '') is not null then
    select id into v_origem from public.produtos_brutos where nome = p_origem and ativo = true;
    if v_origem is null then raise exception 'Produto bruto de origem nao encontrado.' using errcode = 'P0002'; end if;
  end if;
  update public.produtos_fracionados
  set nome = v_nome, categoria_id = v_categoria,
      tipo_produto = coalesce(nullif(trim(p_tipo_produto), ''), 'Fracionado'),
      unidade = coalesce(nullif(trim(p_unidade), ''), 'UN'), origem_bruto_id = v_origem,
      rendimento_percent = coalesce(nullif(p_rendimento, 0), 100), estoque_minimo = coalesce(p_estoque_minimo, 0),
      fornecedor = nullif(trim(p_fornecedor), ''), preco_medio = coalesce(p_preco_medio, 0),
      validade_dias = coalesce(p_validade_dias, 0)
  where id = v_produto;
end;
$$;

revoke all on function public.atualizar_produto_bruto(text,text,text,text,text,numeric,text,numeric,integer) from public, anon;
revoke all on function public.atualizar_produto_fracionado(text,text,text,text,text,text,numeric,numeric,text,numeric,integer) from public, anon;
grant execute on function public.atualizar_produto_bruto(text,text,text,text,text,numeric,text,numeric,integer) to authenticated;
grant execute on function public.atualizar_produto_fracionado(text,text,text,text,text,text,numeric,numeric,text,numeric,integer) to authenticated;
