"use client";

import { memo, useEffect, useState, type CSSProperties } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  createPerfilUser,
  deletePerfilUser,
  getCurrentPerfil,
  installCloudSync,
  listAuditLogs,
  listPerfis,
  loadConsistentLegacyState,
  resetPerfilPassword,
  STORAGE_KEY,
  updatePerfilUser,
  type PerfilSistema,
} from "../lib/estoqueSync";

declare global {
  interface Window {
    __estoqueFranCasarinLoaded?: boolean;
    __estoqueCloudSync?: {
      save: (db: unknown, options?: { immediate?: boolean }) => void;
      isSaving: () => boolean;
      setRemoteState: (db: unknown, revision: number) => void;
      updateProductType: (nome: string, tipo: "Bruto" | "Fracionado") => Promise<void>;
      updateFractionedProductType: (nome: string, tipo: "Bruto" | "Fracionado") => Promise<void>;
      convertProductType: (origem: "bruto" | "fracionado", nome: string, tipo: "Bruto" | "Fracionado") => Promise<void>;
    };
    __estoqueLegacy?: {
      getDB: () => unknown;
      replaceDB: (db: unknown) => void;
      render: () => void;
    };
    __estoqueAccess?: {
      profile: PerfilSistema;
      canEdit: boolean;
      canManageUsers: boolean;
      listUsers: () => Promise<PerfilSistema[]>;
      createUser: (input: { email: string; senha: string; nome?: string; papel: "administrador" | "controle_fracionados" | "visualizador" }) => Promise<unknown>;
      updateUser: (input: { user_id: string; nome?: string; papel: "administrador" | "controle_fracionados" | "visualizador"; ativo: boolean }) => Promise<void>;
      deleteUser: (input: { user_id: string; motivo?: string }) => Promise<unknown>;
      resetPassword: (input: { user_id: string; senha: string }) => Promise<unknown>;
      listAudit: () => Promise<unknown[]>;
    };
    __estoqueSessionEmail?: string;
  }
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
// Alterar este sufixo quando uma correção crítica for feita no script legado.
// Assim navegadores que ainda tinham o JavaScript antigo carregam a versão nova.
const assetVersion = `${process.env.NEXT_PUBLIC_APP_VERSION ?? "local"}-produto-fracionado-pesquisa-7`;
const defaultEmail = "";

function authErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== "{}") return error.message;
  if (error && typeof error === "object") {
    const detail = error as { message?: unknown; error_description?: unknown; msg?: unknown; code?: unknown; name?: unknown; status?: unknown };
    const message = detail.message ?? detail.error_description ?? detail.msg;
    if (typeof message === "string" && message && message !== "{}") return message;
    if (typeof detail.code === "string" && detail.code) return `Falha na autenticação (código ${detail.code}).`;
    if (detail.name === "AuthRetryableFetchError" || detail.status === 0) {
      return "O navegador bloqueou ou interrompeu a comunicação com o login. Desative bloqueadores de anúncio/privacidade para esta página ou tente em uma janela anônima.";
    }
  }
  return "O navegador não recebeu uma resposta válida do login. Desative bloqueadores de anúncio/privacidade para esta página ou tente em uma janela anônima.";
}

const LegacyHost = memo(function LegacyHost({ markup }: { markup: string }) {
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
});

export default function LegacyStockSystem() {
  const [markup, setMarkup] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [bootState, setBootState] = useState("Conectando ao banco de dados...");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setMarkup("");
        window.__estoqueFranCasarinLoaded = false;
      }
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    let cancelled = false;
    let channel: ReturnType<typeof installCloudSync> | undefined;
    let refreshInterval: number | undefined;
    let refreshWhenVisible: (() => void) | undefined;
    let refreshingFromCloud = false;

    async function refreshFromCloud(showUpdate = false) {
      if (cancelled || refreshingFromCloud || window.__estoqueCloudSync?.isSaving()) return;
      refreshingFromCloud = true;
      try {
        const { db: freshDB, revision: freshRevision } = await loadConsistentLegacyState(supabase);
        if (cancelled) return;
        const currentDB = window.__estoqueLegacy?.getDB();
        if (currentDB && JSON.stringify(currentDB) === JSON.stringify(freshDB)) return;

        window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(freshDB));
        window.__estoqueCloudSync?.setRemoteState(freshDB, freshRevision);
        if (window.__estoqueLegacy) {
          window.__estoqueLegacy.replaceDB(freshDB);
          if (showUpdate) showToast("Atualizado");
        }
      } catch (error) {
        // A próxima atualização em tempo real ou a próxima verificação tentará de novo.
        console.warn("Não foi possível atualizar o estoque do Supabase.", error);
      } finally {
        refreshingFromCloud = false;
      }
    }

    async function boot(user: User) {
      try {
        setBootState("Carregando estoque do Supabase...");
        const perfil = await getCurrentPerfil(supabase, user);
        window.__estoqueAccess = {
          profile: perfil,
          canEdit: perfil.ativo && (perfil.papel === "master" || perfil.papel === "administrador"),
          canManageUsers: perfil.ativo && perfil.papel === "master",
          listUsers: () => listPerfis(supabase),
          createUser: (input) => createPerfilUser(supabase, input),
          updateUser: (input) => updatePerfilUser(supabase, input),
          deleteUser: (input) => deletePerfilUser(supabase, input),
          resetPassword: (input) => resetPerfilPassword(supabase, input),
          listAudit: () => listAuditLogs(supabase),
        };
        if (!perfil.ativo) {
          throw new Error("Este acesso esta bloqueado. Fale com o Master do sistema.");
        }
        const { db: cloudDB, revision: cloudRevision } = await loadConsistentLegacyState(supabase);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudDB));
        channel = installCloudSync(
          supabase,
          user,
          () => refreshFromCloud(true),
          perfil.papel === "controle_fracionados" ? "controle_fracionados_ampliado" : "full",
          cloudRevision,
        );

        refreshWhenVisible = () => {
          if (document.visibilityState === "visible") void refreshFromCloud();
        };
        window.addEventListener("focus", refreshWhenVisible);
        document.addEventListener("visibilitychange", refreshWhenVisible);
        refreshInterval = window.setInterval(refreshWhenVisible, 15_000);

        const response = await fetch(`${basePath}/legacy-body.html?v=${assetVersion}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Nao foi possivel carregar a interface.");
        const html = await response.text();
        if (!cancelled) {
          setMarkup(html);
          setBootState("");
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Erro desconhecido.";
          setBootState(`Erro ao carregar sistema: ${message}`);
        }
      }
    }

    boot(session.user);

    const statusListener = (event: Event) => {
      const detail = (event as CustomEvent<{ status: string; message?: string }>).detail;
      if (detail.status === "salvo") showToast("Salvo");
      if (detail.status === "erro") showToast(detail.message ? `Falha ao salvar: ${detail.message}` : "Falha ao salvar");
    };
    window.addEventListener("estoque-cloud-status", statusListener);

    return () => {
      cancelled = true;
      window.removeEventListener("estoque-cloud-status", statusListener);
      if (refreshWhenVisible) {
        window.removeEventListener("focus", refreshWhenVisible);
        document.removeEventListener("visibilitychange", refreshWhenVisible);
      }
      if (refreshInterval) window.clearInterval(refreshInterval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [session]);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout((window as any).__estoqueToastTimer);
    (window as any).__estoqueToastTimer = window.setTimeout(() => setToast(""), 2200);
  }

  useEffect(() => {
    if (!markup) return;
    if (window.__estoqueLegacy) {
      window.__estoqueLegacy.render();
      return;
    }

    document.getElementById("legacy-stock-script")?.remove();
    window.__estoqueFranCasarinLoaded = false;
    const script = document.createElement("script");
    script.id = "legacy-stock-script";
    script.src = `${basePath}/legacy-app.js?v=${assetVersion}`;
    script.async = false;
    script.onload = () => {
      window.__estoqueFranCasarinLoaded = true;
      window.__estoqueLegacy?.render();
    };
    script.onerror = () => {
      window.__estoqueFranCasarinLoaded = false;
      showToast("Erro ao abrir o sistema");
    };
    document.body.appendChild(script);
  }, [markup]);

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("Verificando acesso...");

    const credentials = { email: email.trim(), password };
    try {
      const result =
        authMode === "login"
          ? await supabase.auth.signInWithPassword(credentials)
          : await supabase.auth.signUp({ ...credentials, options: { data: { name: email.trim() } } });

      if (result.error) {
        console.error("Falha na autenticação do Supabase:", result.error);
        setAuthMessage(authErrorMessage(result.error));
        return;
      }

      if (authMode === "signup" && !result.data.session) {
        setAuthMessage("Cadastro criado. Confira o e-mail para confirmar o acesso e depois entre novamente.");
        return;
      }

      setAuthMessage("Acesso liberado. Abrindo sistema...");
    } catch (error) {
      console.error("Erro inesperado ao autenticar no Supabase:", error);
      setAuthMessage(authErrorMessage(error));
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  useEffect(() => {
    window.__estoqueSessionEmail = session?.user.email ?? "";
    const onLegacyLogout = () => {
      void handleLogout();
    };
    window.addEventListener("estoque:logout", onLegacyLogout);
    return () => window.removeEventListener("estoque:logout", onLegacyLogout);
  }, [session?.user.email]);

  if (!session) {
    return (
      <main className="auth-shell">
        <aside
          className="auth-hero"
          style={{ "--auth-food-bg": `url(${basePath}/assets/login-buffet-bg.png)` } as CSSProperties}
        >
          <img src={`${basePath}/assets/logo-fran-casarin-transparent-tight.png`} alt="Franciele Casarin Buffet" className="auth-hero-logo" />
          <h2>Sistema de Controle de Estoque</h2>
          <div className="auth-gold-line" />
          <p>Gestão inteligente para o seu buffet, com controle total do estoque.</p>
          <div className="auth-feature"><span className="feat-icon box" /><div><strong>Controle completo</strong><small>Acompanhe entradas, saídas e níveis de estoque em tempo real.</small></div></div>
          <div className="auth-feature"><span className="feat-icon chart" /><div><strong>Relatórios inteligentes</strong><small>Indicadores que ajudam na tomada de decisão.</small></div></div>
          <div className="auth-feature"><span className="feat-icon shield" /><div><strong>Seguro e confiável</strong><small>Dados protegidos com login e sincronização automática.</small></div></div>
        </aside>
        <section className="auth-panel">
          <div>
            <h1>Acesse sua conta</h1>
            <p>Entre com seu e-mail e senha para acessar o sistema de controle de estoque.</p>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Modo de acesso">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>
              Entrar
            </button>
            <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>
              Criar acesso
            </button>
          </div>

          <form className="auth-form" onSubmit={handleAuth}>
            <label>
              E-mail
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
                autoComplete={authMode === "login" ? "current-password" : "new-password"}
              />
            </label>
            <button type="submit">{authMode === "login" ? "Entrar" : "Criar acesso"}</button>
          </form>

          {authMessage && <p className="auth-message">{authMessage}</p>}
          <p className="auth-note">O primeiro cadastro vira administrador do sistema. Depois, novos usuários podem ser ajustados no Supabase.</p>
        </section>
      </main>
    );
  }

  if (!markup) {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <img src={`${basePath}/assets/logo-fran-casarin-transparent-tight.png`} alt="Fran Casarin Buffet" className="auth-logo" />
          <h1>Preparando sistema</h1>
          <p>{bootState}</p>
          {session && <button type="button" onClick={handleLogout}>Sair</button>}
        </section>
      </main>
    );
  }

  return (
    <>
      <LegacyHost markup={markup} />
      <div className={`save-toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </>
  );
}
