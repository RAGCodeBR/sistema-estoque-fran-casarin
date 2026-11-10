-- Corrige apenas o cadastro de usuarios: o gatilho de auth.users cria o
-- perfil antes desta funcao inserir o mesmo user_id. Nenhuma tabela de estoque
-- ou produto e alterada por esta migracao.

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

  -- O gatilho de auth.users ja cria o perfil para contas novas.
  -- Atualize esse perfil com o nivel escolhido; para contas antigas sem perfil,
  -- a insercao continua criando um novo registro.
  insert into public.perfis(user_id, email, nome, papel, ativo)
  values (v_user_id, v_email, coalesce(nullif(trim(p_nome), ''), v_email), p_papel, true)
  on conflict (user_id) do update
    set email = excluded.email,
        nome = excluded.nome,
        papel = excluded.papel,
        ativo = true,
        atualizado_em = now()
  returning * into v_perfil;

  return v_perfil;
end;
$$;
