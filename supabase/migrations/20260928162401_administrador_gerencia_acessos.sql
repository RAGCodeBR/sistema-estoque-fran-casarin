-- O Administrador passa a gerenciar acessos junto com o Master: ver a tela de
-- usuarios e logs, criar, alterar, redefinir senha e excluir acessos.
-- Continuam protegidos em todas as funcoes: o acesso Master e o proprio
-- usuario que executa a acao.

create or replace function public.criar_usuario_sistema(
  p_email text,
  p_senha text,
  p_nome text default null,
  p_papel text default 'visualizador'
)
returns public.perfis
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(p_email));
  v_user_id uuid;
  v_perfil public.perfis;
  v_identity_id_type text;
begin
  if not public.usuario_tem_papel(array['master', 'administrador']) then
    raise exception 'Somente Master ou Administrador pode criar acessos.';
  end if;

  if p_papel not in ('administrador', 'controle_fracionados', 'visualizador') then
    raise exception 'Papel inválido.';
  end if;

  if coalesce(v_email, '') = '' then
    raise exception 'Informe o e-mail do acesso.';
  end if;

  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter ao menos 6 caracteres.';
  end if;

  select id into v_user_id from auth.users where lower(email) = v_email limit 1;

  -- Antes, um e-mail existente tinha a senha e o nivel sobrescritos. Com o
  -- Administrador criando acessos, isso permitiria assumir a conta do Master
  -- ou de qualquer usuario. Acessos existentes devem ser ajustados na lista;
  -- somente um acesso excluido (sem perfil) pode ser recriado.
  if v_user_id is not null and exists (select 1 from public.perfis where user_id = v_user_id) then
    raise exception 'Já existe um acesso com este e-mail. Ajuste o nível ou a senha dele na lista de acessos.';
  end if;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    )
    values (
      v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt(p_senha, extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', coalesce(nullif(trim(p_nome), ''), v_email)),
      now(), now(), '', '', '', ''
    );

    select data_type into v_identity_id_type
    from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'id';

    if v_identity_id_type = 'uuid' then
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      values (
        v_user_id, v_user_id, v_email,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
    else
      insert into auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
      )
      values (
        v_user_id::text, v_user_id, v_email,
        jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
    end if;
  else
    update auth.users
    set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('name', coalesce(nullif(trim(p_nome), ''), v_email)),
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.perfis(user_id, email, nome, papel, ativo)
  values (v_user_id, v_email, coalesce(nullif(trim(p_nome), ''), v_email), p_papel, true)
  returning * into v_perfil;

  return v_perfil;
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
  if not public.usuario_tem_papel(array['master', 'administrador']) then
    raise exception 'Somente Master ou Administrador pode alterar acessos.';
  end if;

  if p_papel not in ('administrador', 'controle_fracionados', 'visualizador') then
    raise exception 'Nivel invalido.';
  end if;

  select * into v_perfil from public.perfis where user_id = p_user_id;
  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if v_perfil.papel = 'master' then
    raise exception 'O acesso Master nao pode ser alterado por aqui.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Voce nao pode alterar o proprio acesso por aqui.';
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
  if not public.usuario_tem_papel(array['master', 'administrador']) then
    raise exception 'Somente Master ou Administrador pode redefinir senhas.';
  end if;

  if length(coalesce(p_senha, '')) < 6 then
    raise exception 'A senha precisa ter ao menos 6 caracteres.';
  end if;

  select * into v_perfil from public.perfis where user_id = p_user_id;
  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if v_perfil.papel = 'master' then
    raise exception 'A senha do Master nao pode ser redefinida por aqui.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Voce nao pode redefinir a propria senha por aqui.';
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
  p_motivo text default 'Acesso removido pela gestao de acessos'
)
returns public.perfis
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil public.perfis;
  v_motivo text := coalesce(nullif(trim(p_motivo), ''), 'Acesso removido pela gestao de acessos');
begin
  if not public.usuario_tem_papel(array['master', 'administrador']) then
    raise exception 'Somente Master ou Administrador pode excluir acessos.';
  end if;

  select * into v_perfil from public.perfis where user_id = p_user_id;
  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if v_perfil.papel = 'master' then
    raise exception 'O acesso Master nao pode ser excluido por aqui.';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'Voce nao pode excluir o proprio acesso.';
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

revoke all on function public.criar_usuario_sistema(text, text, text, text) from public, anon;
revoke all on function public.atualizar_acesso_sistema(uuid, text, text, boolean) from public, anon;
revoke all on function public.redefinir_senha_acesso(uuid, text) from public, anon;
revoke all on function public.excluir_acesso_sistema(uuid, text) from public, anon;
grant execute on function public.criar_usuario_sistema(text, text, text, text) to authenticated;
grant execute on function public.atualizar_acesso_sistema(uuid, text, text, boolean) to authenticated;
grant execute on function public.redefinir_senha_acesso(uuid, text) to authenticated;
grant execute on function public.excluir_acesso_sistema(uuid, text) to authenticated;

-- A tela lista todos os perfis e os logs resumidos; sem estas leituras o
-- Administrador veria apenas a propria linha e nenhum log.
drop policy if exists "perfis_select_master_ou_proprio" on public.perfis;
drop policy if exists "perfis_select_gestor_ou_proprio" on public.perfis;
create policy "perfis_select_gestor_ou_proprio" on public.perfis
for select to authenticated
using (user_id = auth.uid() or public.usuario_tem_papel(array['master', 'administrador']));

drop policy if exists "logs_sistema_select_master" on public.logs_sistema;
drop policy if exists "logs_sistema_select_master_admin" on public.logs_sistema;
create policy "logs_sistema_select_master_admin" on public.logs_sistema
for select to authenticated
using (public.usuario_tem_papel(array['master', 'administrador']));
