-- Gestao saudavel de acessos pelo Master:
-- atualizar perfil, redefinir senha e excluir/desativar acesso com log.

create or replace function public.log_acesso_sistema(
  p_resumo text,
  p_detalhes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.logs_sistema(usuario_id, resumo, detalhes)
  values (auth.uid(), p_resumo, p_detalhes);
end;
$$;

create or replace function public.atualizar_acesso_sistema(
  p_user_id uuid,
  p_nome text,
  p_papel text,
  p_ativo boolean
)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil public.perfis;
begin
  if not public.usuario_tem_papel(array['master']) then
    raise exception 'Somente Master pode alterar acessos.';
  end if;

  if p_papel not in ('administrador', 'visualizador') then
    raise exception 'Nivel invalido.';
  end if;

  select * into v_perfil from public.perfis where user_id = p_user_id;
  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if v_perfil.papel = 'master' or p_user_id = auth.uid() then
    raise exception 'O acesso Master nao pode ser alterado por aqui.';
  end if;

  update public.perfis
  set nome = coalesce(nullif(trim(p_nome), ''), email),
      papel = p_papel,
      ativo = coalesce(p_ativo, false),
      atualizado_em = now()
  where user_id = p_user_id
  returning * into v_perfil;

  perform public.log_acesso_sistema(
    'Atualizou acesso de ' || v_perfil.email,
    jsonb_build_array(jsonb_build_object(
      'secao', 'Acessos',
      'acao', 'alterou',
      'quantidade', 1,
      'itens', jsonb_build_array(v_perfil.email || ' - ' || v_perfil.papel || case when v_perfil.ativo then ' - ativo' else ' - bloqueado' end)
    ))
  );

  return v_perfil;
end;
$$;

create or replace function public.redefinir_senha_acesso(
  p_user_id uuid,
  p_senha text
)
returns public.perfis
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_perfil public.perfis;
begin
  if not public.usuario_tem_papel(array['master']) then
    raise exception 'Somente Master pode redefinir senhas.';
  end if;

  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter ao menos 6 caracteres.';
  end if;

  select * into v_perfil from public.perfis where user_id = p_user_id;
  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if v_perfil.papel = 'master' or p_user_id = auth.uid() then
    raise exception 'A senha do Master nao pode ser redefinida por aqui.';
  end if;

  if not v_perfil.ativo then
    raise exception 'Nao redefina senha de acesso excluido ou bloqueado.';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      updated_at = now()
  where id = p_user_id;

  perform public.log_acesso_sistema(
    'Redefiniu senha de ' || v_perfil.email,
    jsonb_build_array(jsonb_build_object(
      'secao', 'Acessos',
      'acao', 'alterou',
      'quantidade', 1,
      'itens', jsonb_build_array('Senha redefinida para ' || v_perfil.email)
    ))
  );

  return v_perfil;
end;
$$;

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

  -- O status ativo/bloqueado e controlado pela funcao de atualizacao.
  -- Aqui removemos somente o perfil de acesso: os logs e movimentacoes
  -- existentes permanecem preservados.
  delete from public.perfis
  where user_id = p_user_id;

  perform public.log_acesso_sistema(
    'Excluiu acesso de ' || v_perfil.email,
    jsonb_build_array(jsonb_build_object(
      'secao', 'Acessos',
      'acao', 'removeu',
      'quantidade', 1,
      'itens', jsonb_build_array(v_perfil.email || ' - ' || v_motivo)
    ))
  );

  return v_perfil;
end;
$$;

grant execute on function public.atualizar_acesso_sistema(uuid, text, text, boolean) to authenticated;
grant execute on function public.redefinir_senha_acesso(uuid, text) to authenticated;
grant execute on function public.excluir_acesso_sistema(uuid, text) to authenticated;
