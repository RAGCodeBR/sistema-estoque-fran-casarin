-- Separa bloqueio de exclusao: o status do perfil e alterado pela tela de
-- usuarios; esta funcao remove o perfil de acesso sem apagar logs ou dados de
-- estoque associados ao usuario.
create or replace function public.excluir_acesso_sistema(
  p_user_id uuid,
  p_motivo text default 'Acesso removido pelo Master'
)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil public.perfis;
  v_motivo text := coalesce(nullif(trim(p_motivo), ''), 'Acesso removido pelo Master');
begin
  if not public.usuario_tem_papel(array['master']) then
    raise exception 'Somente Master pode excluir acessos.';
  end if;

  select * into v_perfil from public.perfis where user_id = p_user_id;
  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;
  if v_perfil.papel = 'master' or p_user_id = auth.uid() then
    raise exception 'O acesso Master nao pode ser excluido por aqui.';
  end if;

  delete from public.perfis where user_id = p_user_id;

  perform public.log_acesso_sistema(
    'Excluiu acesso de ' || v_perfil.email,
    jsonb_build_array(jsonb_build_object(
      'secao', 'Acessos', 'acao', 'removeu', 'quantidade', 1,
      'itens', jsonb_build_array(v_perfil.email || ' - ' || v_motivo)
    ))
  );
  return v_perfil;
end;
$$;

grant execute on function public.excluir_acesso_sistema(uuid, text) to authenticated;
