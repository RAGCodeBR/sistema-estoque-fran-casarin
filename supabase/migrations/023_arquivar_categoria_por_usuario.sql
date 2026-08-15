-- Arquivamento individual para a tela Categorias. Evita que uma exclusao
-- dependa da sincronizacao completa do estoque e preserva o historico.
create or replace function public.arquivar_categoria(p_nome text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario uuid := auth.uid();
  v_alteradas integer;
begin
  if v_usuario is null then
    raise exception 'Autenticacao obrigatoria.' using errcode = '42501';
  end if;
  if not public.usuario_tem_papel(array['master','administrador']) then
    raise exception 'Sem permissao para arquivar categorias.' using errcode = '42501';
  end if;

  update public.categorias
  set ativo = false
  where nome = p_nome and ativo = true;
  get diagnostics v_alteradas = row_count;

  if v_alteradas = 0 then
    raise exception 'Categoria nao encontrada ou ja arquivada.' using errcode = 'P0002';
  end if;

end;
$$;

revoke all on function public.arquivar_categoria(text) from public;
grant execute on function public.arquivar_categoria(text) to authenticated;
