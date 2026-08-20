-- Permite converter produtos com historico sem apagar ou religar movimentos.
-- O cadastro de origem e arquivado, o destino e criado/reativado e recebe um
-- ajuste de transferencia com o saldo vigente. Toda a operacao e atomica.

create or replace function public.converter_tipo_produto(
  p_origem text,
  p_nome text,
  p_tipo_destino text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_responsavel text;
  v_bruto public.produtos_brutos%rowtype;
  v_fracionado public.produtos_fracionados%rowtype;
  v_destino_bruto public.produtos_brutos%rowtype;
  v_destino_fracionado public.produtos_fracionados%rowtype;
  v_destino_existe boolean := false;
  v_saldo_origem numeric(14,3) := 0;
  v_saldo_destino numeric(14,3) := 0;
begin
  if v_usuario is null
     or not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para converter o tipo do produto.' using errcode = '42501';
  end if;

  if p_origem not in ('bruto','fracionado')
     or p_tipo_destino not in ('Bruto','Fracionado') then
    raise exception 'Dados de conversao invalidos.' using errcode = '22023';
  end if;

  if (p_origem = 'bruto' and p_tipo_destino = 'Bruto')
     or (p_origem = 'fracionado' and p_tipo_destino = 'Fracionado') then
    return;
  end if;

  -- Bloqueia gravacoes concorrentes somente durante os milissegundos da
  -- conversao, evitando que uma movimentacao entre no meio do checkpoint.
  lock table
    public.produtos_brutos,
    public.produtos_fracionados,
    public.entradas_central,
    public.saidas_central,
    public.producoes,
    public.saidas_fracionado,
    public.ajustes_estoque,
    public.ajustes_fracionados,
    public.pedidos_compra,
    public.itens_manuais_compra
  in share row exclusive mode;

  select coalesce(nullif(pg_catalog.btrim(nome), ''), nullif(pg_catalog.btrim(email), ''), 'Sistema')
  into v_responsavel
  from public.perfis
  where user_id = v_usuario and ativo = true;
  v_responsavel := coalesce(v_responsavel, 'Sistema');

  if p_origem = 'bruto' then
    select * into v_bruto
    from public.produtos_brutos
    where nome = p_nome and ativo = true
    for update;
    if not found then
      raise exception 'Produto bruto ativo nao encontrado.' using errcode = 'P0002';
    end if;

    select * into v_destino_fracionado
    from public.produtos_fracionados
    where nome = v_bruto.nome
    for update;
    v_destino_existe := found;
    if v_destino_existe and v_destino_fracionado.ativo then
      raise exception 'Ja existe um produto fracionado ativo com este nome.' using errcode = '23505';
    end if;

    select a.novo_saldo into v_saldo_origem
    from public.ajustes_estoque a
    where a.produto_bruto_id = v_bruto.id
    order by a.data desc, a.ordem desc, a.criado_em desc, a.id desc
    limit 1;
    if not found then
      select
        coalesce((select sum(e.quantidade) from public.entradas_central e where e.produto_bruto_id = v_bruto.id), 0)
        - coalesce((select sum(s.quantidade) from public.saidas_central s where s.produto_bruto_id = v_bruto.id), 0)
        - coalesce((select sum(p.quantidade_utilizada) from public.producoes p where p.produto_bruto_id = v_bruto.id), 0)
      into v_saldo_origem;
    end if;

    if v_destino_existe then
      select a.novo_saldo into v_saldo_destino
      from public.ajustes_fracionados a
      where a.produto_fracionado_id = v_destino_fracionado.id
      order by a.data desc, a.ordem desc, a.criado_em desc, a.id desc
      limit 1;
      if not found then
        select
          coalesce((select sum(p.quantidade_produzida) from public.producoes p where p.produto_fracionado_id = v_destino_fracionado.id), 0)
          - coalesce((select sum(s.quantidade) from public.saidas_fracionado s where s.produto_fracionado_id = v_destino_fracionado.id), 0)
        into v_saldo_destino;
      end if;

      update public.produtos_fracionados
      set categoria_id = v_bruto.categoria_id,
          tipo_produto = 'Fracionado',
          unidade = v_bruto.unidade,
          origem_bruto_id = null,
          rendimento_percent = 100,
          estoque_minimo = v_bruto.estoque_minimo,
          fornecedor = v_bruto.fornecedor,
          preco_medio = v_bruto.preco_medio,
          validade_dias = v_bruto.validade_dias,
          ativo = true
      where id = v_destino_fracionado.id;
    else
      insert into public.produtos_fracionados(
        nome, categoria_id, tipo_produto, unidade, origem_bruto_id,
        rendimento_percent, estoque_minimo, fornecedor, preco_medio,
        validade_dias, ativo
      ) values (
        v_bruto.nome, v_bruto.categoria_id, 'Fracionado', v_bruto.unidade, null,
        100, v_bruto.estoque_minimo, v_bruto.fornecedor, v_bruto.preco_medio,
        v_bruto.validade_dias, true
      ) returning * into v_destino_fracionado;
      v_saldo_destino := 0;
    end if;

    v_saldo_origem := pg_catalog.round(coalesce(v_saldo_origem, 0), 3);
    v_saldo_destino := pg_catalog.round(coalesce(v_saldo_destino, 0), 3);
    if v_saldo_origem < 0 then
      raise exception 'O produto possui saldo negativo. Faca um ajuste de estoque antes de converter.' using errcode = '23514';
    end if;

    update public.produtos_brutos
    set ativo = false, tipo_produto = 'Bruto'
    where id = v_bruto.id;

    insert into public.ajustes_fracionados(
      data, produto_fracionado_id, saldo_anterior, novo_saldo, diferenca,
      motivo, responsavel, criado_por
    ) values (
      current_date, v_destino_fracionado.id, v_saldo_destino, v_saldo_origem,
      v_saldo_origem - v_saldo_destino,
      'CONVERSAO DE TIPO: saldo transferido de Bruto para Fracionado',
      v_responsavel, v_usuario
    );

  else
    select * into v_fracionado
    from public.produtos_fracionados
    where nome = p_nome and ativo = true
    for update;
    if not found then
      raise exception 'Produto fracionado ativo nao encontrado.' using errcode = 'P0002';
    end if;

    select * into v_destino_bruto
    from public.produtos_brutos
    where nome = v_fracionado.nome
    for update;
    v_destino_existe := found;
    if v_destino_existe and v_destino_bruto.ativo then
      raise exception 'Ja existe um produto bruto ativo com este nome.' using errcode = '23505';
    end if;

    select a.novo_saldo into v_saldo_origem
    from public.ajustes_fracionados a
    where a.produto_fracionado_id = v_fracionado.id
    order by a.data desc, a.ordem desc, a.criado_em desc, a.id desc
    limit 1;
    if not found then
      select
        coalesce((select sum(p.quantidade_produzida) from public.producoes p where p.produto_fracionado_id = v_fracionado.id), 0)
        - coalesce((select sum(s.quantidade) from public.saidas_fracionado s where s.produto_fracionado_id = v_fracionado.id), 0)
      into v_saldo_origem;
    end if;

    if v_destino_existe then
      select a.novo_saldo into v_saldo_destino
      from public.ajustes_estoque a
      where a.produto_bruto_id = v_destino_bruto.id
      order by a.data desc, a.ordem desc, a.criado_em desc, a.id desc
      limit 1;
      if not found then
        select
          coalesce((select sum(e.quantidade) from public.entradas_central e where e.produto_bruto_id = v_destino_bruto.id), 0)
          - coalesce((select sum(s.quantidade) from public.saidas_central s where s.produto_bruto_id = v_destino_bruto.id), 0)
          - coalesce((select sum(p.quantidade_utilizada) from public.producoes p where p.produto_bruto_id = v_destino_bruto.id), 0)
        into v_saldo_destino;
      end if;

      update public.produtos_brutos
      set categoria_id = v_fracionado.categoria_id,
          tipo_produto = 'Bruto',
          unidade = v_fracionado.unidade,
          estoque_minimo = v_fracionado.estoque_minimo,
          fornecedor = v_fracionado.fornecedor,
          preco_medio = v_fracionado.preco_medio,
          validade_dias = v_fracionado.validade_dias,
          ativo = true
      where id = v_destino_bruto.id;
    else
      insert into public.produtos_brutos(
        nome, categoria_id, tipo_produto, unidade, estoque_minimo,
        fornecedor, preco_medio, validade_dias, ativo
      ) values (
        v_fracionado.nome, v_fracionado.categoria_id, 'Bruto', v_fracionado.unidade,
        v_fracionado.estoque_minimo, v_fracionado.fornecedor,
        v_fracionado.preco_medio, v_fracionado.validade_dias, true
      ) returning * into v_destino_bruto;
      v_saldo_destino := 0;
    end if;

    v_saldo_origem := pg_catalog.round(coalesce(v_saldo_origem, 0), 3);
    v_saldo_destino := pg_catalog.round(coalesce(v_saldo_destino, 0), 3);
    if v_saldo_origem < 0 then
      raise exception 'O produto possui saldo negativo. Faca um ajuste de estoque antes de converter.' using errcode = '23514';
    end if;

    update public.produtos_fracionados
    set ativo = false, tipo_produto = 'Fracionado'
    where id = v_fracionado.id;

    insert into public.ajustes_estoque(
      data, produto_bruto_id, saldo_anterior, novo_saldo, diferenca,
      motivo, responsavel, criado_por
    ) values (
      current_date, v_destino_bruto.id, v_saldo_destino, v_saldo_origem,
      v_saldo_origem - v_saldo_destino,
      'CONVERSAO DE TIPO: saldo transferido de Fracionado para Bruto',
      v_responsavel, v_usuario
    );
  end if;
end;
$$;

revoke all on function public.converter_tipo_produto(text,text,text) from public, anon;
grant execute on function public.converter_tipo_produto(text,text,text) to authenticated;

notify pgrst, 'reload schema';
