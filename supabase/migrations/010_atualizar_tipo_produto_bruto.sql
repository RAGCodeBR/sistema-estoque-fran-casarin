-- Atualiza somente o tipo de um produto, evitando substituir o estoque inteiro
-- quando o usuário usa o seletor da tela Produtos Brutos.
create or replace function public.atualizar_tipo_produto_bruto(
  p_nome text,
  p_tipo text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para alterar o tipo do produto.' using errcode = '42501';
  end if;
  if p_tipo not in ('Bruto', 'Fracionado') then
    raise exception 'Tipo de produto invalido.' using errcode = '22023';
  end if;
  update public.produtos_brutos
  set tipo_produto = p_tipo, atualizado_em = now()
  where nome = p_nome;
  if not found then
    raise exception 'Produto nao encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.atualizar_tipo_produto_bruto(text, text) from public;
grant execute on function public.atualizar_tipo_produto_bruto(text, text) to authenticated;
