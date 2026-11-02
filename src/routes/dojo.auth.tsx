import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, Lock, User as UserIcon, ShieldCheck, Trophy, CalendarDays, Dumbbell } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { authService } from "@/services/authService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { DojoLogo } from "@/components/dojo/DojoLogo";
import { PasswordStrength, isPasswordStrong, PASSWORD_MIN_LENGTH } from "@/components/auth/PasswordStrength";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { isEmailTeamMember, checkTeamMemberGate } from "@/lib/dojo/team.functions";
import { getStaffSession } from "@/lib/dojo/staff-portal.functions";
import { registerDojoOwner } from "@/lib/dojo/owner-register.functions";

const searchSchema = z.object({ redirect: z.string().optional() });


export const Route = createFileRoute("/dojo/auth")({
  validateSearch: searchSchema,
  ssr: false,
  head: () => ({
    meta: [
      { title: "Entrar — AMT Dojo Manager" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DojoAuthPage,
});

/**
 * Colaboradores (professores/equipe) não são donos de dojo. A verificação lê a
 * base própria da equipe (dojo_staff_accounts): quem tem conta ativa lá nunca
 * recebe contexto de dono e é enviado ao Portal da Equipe (/dojo/staff).
 */
async function isStaffAccount(): Promise<boolean> {
  try {
    const session = await getStaffSession();
    return !!session;
  } catch {
    return false;
  }
}

async function resolveDestination(_userId: string, requested?: string): Promise<string> {
  const staff = await isStaffAccount();
  if (requested && requested.startsWith("/dojo")) return requested;
  // Onboarding é opcional — acesso total ao painel desde o primeiro login.
  return staff ? "/dojo/staff" : "/dojo/app";
}


function translateAuthError(message: string): string {
  if (/already registered|already exists/i.test(message)) return "Este e-mail já possui conta. Use “Entrar” ou “Esqueci minha senha”.";
  if (/invalid login credentials/i.test(message)) return "E-mail ou senha incorretos.";
  if (/rate limit|too many/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (/pwned|weak|compromised/i.test(message)) return "Esta senha aparece em vazamentos conhecidos. Escolha outra senha.";
  if (/invalid.*email|email.*invalid/i.test(message)) return "E-mail inválido. Verifique se foi digitado corretamente.";
  return message;
}

function DojoAuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showStudentConflict, setShowStudentConflict] = useState(false);
  const [conflictDojoName, setConflictDojoName] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let redirected = false;
    const go = async (userId: string) => {
      if (redirected) return;
      redirected = true;
      // Team-member gate: bloqueia acesso caso o e-mail exista em
      // dojo_team_members sem vínculo ativo com este user_id.
      try {
        const gate = await checkTeamMemberGate();
        if (gate.blocked) {
          await supabase.auth.signOut();
          redirected = false;
          setChecking(false);
          toast.error("Acesso pendente", {
            description:
              gate.reason === "inactive"
                ? "Seu acesso foi desativado. Fale com o dono do dojo."
                : "Seu login precisa ser criado pelo dono do dojo no módulo Equipe.",
          });
          return;
        }
      } catch {
        // Se a checagem falhar, seguimos sem bloquear para não travar o dono.
      }
      // Hardening: Contas de aluno não podem acessar o Dojo Manager sob nenhuma circunstância.
      const { data: dojoUser, error: duErr } = await supabase
        .from("dojo_users")
        .select("id, role, owner_id")
        .eq("auth_user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (duErr || !dojoUser) {
        // Se não é admin, verifica se é aluno tentando entrar no painel administrativo
        const { data: studentAccount } = await supabase
          .from("student_accounts")
          .select("id")
          .eq("auth_user_id", userId)
          .maybeSingle();

        if (studentAccount) {
          await supabase.auth.signOut();
          redirected = false;
          setChecking(false);
          toast.error("Acesso negado", {
            description: "Alunos devem utilizar o Aplicativo do Aluno.",
          });
          window.location.replace("/app");
          return;
        }

        // Se for um novo cadastro ou login sem vínculo, permitimos o fluxo de dojo_manager
        // APENAS se não houver conflito de aluno (já validado acima) e se a conta
        // NÃO for de um colaborador (professor/equipe) criado pelo dono do dojo —
        // esses logins nunca devem virar novos usuários/donos do Dojo Manager.
        const isStaff = await isStaffAccount();
        if (!isStaff) {
          const { data: userData } = await supabase.auth.getUser();
          try {
            await registerDojoOwner({
              data: {
                name:
                  (userData.user?.user_metadata?.full_name as string | undefined) ||
                  name ||
                  undefined,
              },
            });
          } catch {
            // Falha no registro não deve travar o login do dono.
          }
        }


        await supabase.auth.updateUser({ data: { account_type: "dojo_manager" } });
      } else {
        // Pega os dados do usuário atual para verificar metadados
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser && currentUser.user_metadata?.account_type !== "dojo_manager") {
          await supabase.auth.updateUser({ data: { account_type: "dojo_manager" } });
        }
      }
      
      const target = await resolveDestination(userId, search.redirect);
      window.location.replace(target);
    };
    // Captura confirmação de email (hash tokens) e login em qualquer aba.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED")) {
        void go(session.user.id);
      }
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) void go(data.user.id);
      else setChecking(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [search.redirect]);


  const goAfterAuth = async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    // Aplica o gate de membro de equipe: bloqueia se o e-mail existe em
    // dojo_team_members sem vínculo ativo com este user_id.
    try {
      const gate = await checkTeamMemberGate();
      if (gate.blocked) {
        await supabase.auth.signOut();
        toast.error("Acesso pendente", {
          description:
            gate.reason === "inactive"
              ? "Seu acesso foi desativado. Fale com o dono do dojo."
              : "Seu login precisa ser criado pelo dono do dojo no módulo Equipe.",
        });
        return;
      }
    } catch { /* segue em caso de falha na checagem */ }
    const target = await resolveDestination(data.user.id, search.redirect);
    window.location.assign(target);
  };


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      if (/email not confirmed/i.test(error.message)) {
        return toast.error("E-mail ainda não confirmado", {
          description: "Abra o link que enviamos ao seu e-mail para ativar a conta.",
          action: { label: "Reenviar link", onClick: () => void resendConfirmation() },
          duration: 15000,
        });
      }
      return toast.error("Falha ao entrar", { description: translateAuthError(error.message) });
    }
    // Hardening: Contas de aluno não podem acessar o Dojo Manager sob nenhuma circunstância.
    if (signInData.user) {
      const { data: studentRows } = await supabase
        .from("dojo_students")
        .select("id")
        .eq("user_id", signInData.user.id)
        .limit(1);

      // Verificação dupla: por user_id e também por e-mail para cobrir importações manuais
      const userEmail = signInData.user.email?.trim().toLowerCase();
      const { data: studentByEmail } = userEmail 
        ? await supabase
            .from("dojo_students")
            .select("id")
            .eq("email", userEmail)
            .limit(1)
        : { data: null };

      if ((studentRows && studentRows.length > 0) || (studentByEmail && studentByEmail.length > 0)) {
        await supabase.auth.signOut();
        setLoading(false);
        toast.error("Acesso negado", {
          description: "Este e-mail pertence a um aluno. Use o App do Aluno.",
        });
        window.location.assign("/app");
        return;
      }
    }
    setLoading(false);
    toast.success("Bem-vindo de volta!");
    await goAfterAuth();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordStrong(password)) {
      toast.error("Senha fraca", {
        description: "Atenda a todos os requisitos de segurança antes de continuar.",
      });
      return;
    }
    // E-mails já cadastrados como aluno não podem abrir conta de dono sem consentimento.
    const { data: studentByEmail } = await supabase
      .from("dojo_students")
      .select("id, dojo_profiles(name)")
      .eq("email", email.trim().toLowerCase())
      .limit(1)
      .maybeSingle();

    if (studentByEmail) {
      setConflictDojoName((studentByEmail.dojo_profiles as any)?.name || "um dojo");
      setShowStudentConflict(true);
      return;
    }
    // E-mails cadastrados como membro de equipe não podem se auto-registrar:
    // o login precisa ser criado pelo dono no módulo Equipe.
    try {
      const teamCheck = await isEmailTeamMember({ data: { email: email.trim().toLowerCase() } });
      if (teamCheck.isTeamMember) {
        toast.error("E-mail de colaborador", {
          description:
            "Este e-mail é de um membro de equipe. Peça ao dono do dojo para criar seu login no módulo Equipe.",
        });
        return;
      }
    } catch { /* segue em caso de falha na checagem */ }
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dojo/auth`,
        data: { full_name: name, account_type: "dojo_manager" },
      },
    });
    setLoading(false);
    if (error) return toast.error("Falha ao criar conta", { description: translateAuthError(error.message) });
    await finishSignUp(data.user, data.session);
  };

  // Sem sessão = confirmação de e-mail pendente. Redirecionar para /dojo/app
  // nesse estado devolvia o cliente à tela de login sem explicação.
  const finishSignUp = async (user: { id: string } | null, session: unknown) => {
    if (!user) return;
    if (!session) {
      toast.success("Conta criada! Confirme seu e-mail", {
        description: `Enviamos um link de confirmação para ${email}. Abra-o (verifique também o spam) para acessar o sistema.`,
        duration: 15000,
      });
      setMode("signin");
      return;
    }
    try {
      await registerDojoOwner({ data: { name } });
    } catch {
      // O registro também acontece no primeiro login válido.
    }
    toast.success("Conta criada! Bem-vindo ao AMT Dojo Manager.");
    window.location.assign("/dojo/app");
  };

  const resendConfirmation = async () => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/dojo/auth` },
    });
    if (error) return toast.error("Não foi possível reenviar", { description: translateAuthError(error.message) });
    toast.success("Link de confirmação reenviado", { description: "Verifique sua caixa de entrada e o spam." });
  };


  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      const { error } = await authService.signInWithGoogle(`${window.location.origin}/dojo/auth`);
      if (error) {
        toast.error("Falha no Google", { description: error.message });
        setGoogleLoading(false);
        return;
      }
      // Sucesso: o navegador segue para o Google; a sessão volta em /dojo/auth.
    } catch (e: any) {
      toast.error("Falha no Google", { description: e?.message ?? String(e) });
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return toast.error("Informe seu e-mail no campo acima.");
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviamos um e-mail para redefinir a senha.");
  };

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#C1121F]" />
      </div>
    );
  }

  const isSignup = mode === "signup";

  const handleSignUpDirect = async () => {
    setShowStudentConflict(false);
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dojo/auth`,
        data: { full_name: name, account_type: "dojo_manager" },
      },
    });
    setLoading(false);
    if (error) return toast.error("Falha ao criar conta", { description: translateAuthError(error.message) });
    await finishSignUp(data.user, data.session);
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F6F6F7] text-[#111111]">
      <div className="grid min-h-screen lg:grid-cols-[1.02fr_0.98fr]">
        <aside className="relative hidden min-h-screen overflow-hidden bg-[#0B0B0D] text-white lg:flex lg:flex-col">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-48 top-[-10rem] h-[36rem] w-[36rem] rounded-full border border-white/[0.07]" />
            <div className="absolute -left-28 top-[-7rem] h-[28rem] w-[28rem] rounded-full border border-white/[0.06]" />
            <div className="absolute -right-48 bottom-[-15rem] h-[42rem] w-[42rem] rounded-full border border-[#C1121F]/25" />
            <div className="absolute right-[-8rem] top-[18%] h-[26rem] w-[26rem] rounded-full bg-[#C1121F]/20 blur-[120px]" />
            <div className="absolute inset-0 opacity-[0.09]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.14) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
          </div>

          <div className="relative z-10 flex h-full min-h-screen flex-col px-10 py-9 xl:px-14 xl:py-11">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#C1121F] shadow-[0_10px_30px_rgba(193,18,31,.3)]">
                <Dumbbell className="h-5 w-5 text-white" strokeWidth={2.2} />
              </div>
              <div>
                <p className="text-[13px] font-black tracking-[0.19em] text-white">AMT</p>
                <p className="mt-0.5 text-[10px] font-semibold tracking-[0.22em] text-white/45">DOJO MANAGER</p>
              </div>
            </div>

            <div className="my-auto max-w-xl pb-12 pt-20">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/75 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#E52B38] shadow-[0_0_12px_rgba(229,43,56,.9)]" />
                Gestão inteligente para artes marciais
              </div>

              <h1 className="max-w-lg text-5xl font-black leading-[1.05] tracking-[-0.055em] xl:text-6xl">
                Sua academia.
                <br />
                Sua evolução.
                <br />
                <span className="text-[#E52B38]">Sua gestão.</span>
              </h1>
              <p className="mt-7 max-w-md text-base leading-7 text-white/55">
                Tudo o que acontece no seu dojo, conectado em uma plataforma criada para quem vive as artes marciais.
              </p>

              <div className="mt-12 grid max-w-md gap-5">
                <div className="flex items-center gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-[#F15B65]">
                    <Trophy className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Evolução dos alunos</p>
                    <p className="mt-0.5 text-xs text-white/40">Graduações, frequência e desempenho.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-[#F15B65]">
                    <CalendarDays className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Rotina sob controle</p>
                    <p className="mt-0.5 text-xs text-white/40">Turmas, agenda, equipe e comunicação.</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-[#F15B65]">
                    <ShieldCheck className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Gestão em um só lugar</p>
                    <p className="mt-0.5 text-xs text-white/40">Mais clareza para decidir e crescer.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-[10px] font-medium tracking-[0.16em] text-white/35">
              <span>TECNOLOGIA AMT SISTEMAS</span>
              <span>DISCIPLINA. GESTÃO. RESULTADO.</span>
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-screen flex-col bg-[#F7F7F8]">
          <header className="flex items-center justify-between px-5 py-5 sm:px-8 lg:px-10 lg:py-7">
            <Link to="/dojo" className="flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C1121F]" aria-label="AMT Dojo Manager">
              <DojoLogo className="h-10 w-auto sm:h-11" />
            </Link>
            <Link
              to="/dojo"
              className="inline-flex items-center gap-2 rounded-full border border-black/[0.07] bg-white px-3.5 py-2 text-xs font-semibold text-[#55555B] transition hover:border-black/15 hover:text-[#111111] sm:px-4 sm:text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao site
            </Link>
          </header>

          <main className="flex flex-1 items-center justify-center px-4 pb-10 pt-4 sm:px-8 sm:pb-14 lg:px-10 lg:pt-0">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="w-full max-w-[440px]"
            >
              <div className="mb-7">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#C1121F]/10 bg-[#C1121F]/[0.055] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.17em] text-[#B20F1B]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C1121F]" />
                  Área exclusiva
                </div>
                <h1 className="text-[2rem] font-black leading-tight tracking-[-0.045em] text-[#111111] sm:text-[2.35rem]">
                  {isSignup ? "Comece sua jornada." : "Que bom ter você de volta."}
                </h1>
                <p className="mt-2.5 text-sm leading-6 text-[#73737A] sm:text-[15px]">
                  {isSignup
                    ? "Crie sua conta e tenha sua academia sob controle."
                    : "Entre para acompanhar e gerenciar sua academia."}
                </p>
              </div>

              <div className="rounded-[26px] border border-black/[0.055] bg-white p-5 shadow-[0_24px_70px_-34px_rgba(17,17,17,.22)] sm:rounded-[30px] sm:p-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogle}
                  disabled={googleLoading || loading}
                  className="h-[50px] w-full gap-3 rounded-xl border-[#E6E6E8] bg-white text-sm font-semibold text-[#242428] shadow-[0_1px_2px_rgba(0,0,0,.03)] transition hover:border-[#D5D5D8] hover:bg-[#FAFAFB]"
                >
                  {googleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden>
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.1a6.7 6.7 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/>
                    </svg>
                  )}
                  {isSignup ? "Cadastrar com Google" : "Continuar com Google"}
                </Button>

                <div className="my-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[#A0A0A6]">
                  <span className="h-px flex-1 bg-[#ECECEE]" />
                  ou continue com e-mail
                  <span className="h-px flex-1 bg-[#ECECEE]" />
                </div>

                <form onSubmit={isSignup ? handleSignUp : handleSignIn} className="space-y-4">
                  {isSignup && (
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-xs font-semibold text-[#45454B]">Nome completo</Label>
                      <div className="relative">
                        <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A6]" />
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          autoComplete="name"
                          className="h-[50px] rounded-xl border-[#E7E7E9] bg-[#FAFAFB] pl-10 text-sm text-[#17171A] placeholder:text-[#A5A5AB] focus-visible:border-[#C1121F] focus-visible:ring-[#C1121F]/15"
                          placeholder="Seu nome completo"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-semibold text-[#45454B]">E-mail</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A6]" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="h-[50px] rounded-xl border-[#E7E7E9] bg-[#FAFAFB] pl-10 text-sm text-[#17171A] placeholder:text-[#A5A5AB] focus-visible:border-[#C1121F] focus-visible:ring-[#C1121F]/15"
                        placeholder="voce@academia.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="password" className="text-xs font-semibold text-[#45454B]">Senha</Label>
                      {!isSignup && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="text-xs font-semibold text-[#C1121F] transition hover:text-[#9F101A] hover:underline"
                        >
                          Esqueci minha senha
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A6]" />
                      <PasswordInput
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={isSignup ? PASSWORD_MIN_LENGTH : 6}
                        autoComplete={isSignup ? "new-password" : "current-password"}
                        className="h-[50px] rounded-xl border-[#E7E7E9] bg-[#FAFAFB] pl-10 text-sm text-[#17171A] placeholder:text-[#A5A5AB] focus-visible:border-[#C1121F] focus-visible:ring-[#C1121F]/15"
                        placeholder={isSignup ? "Crie uma senha segura" : "Digite sua senha"}
                      />
                    </div>
                    {isSignup && <PasswordStrength password={password} className="pt-2" />}
                  </div>

                  <Button
                    type="submit"
                    disabled={loading || googleLoading}
                    className="group mt-2 h-[52px] w-full rounded-xl bg-gradient-to-r from-[#C1121F] to-[#A80E19] text-sm font-bold text-white shadow-[0_12px_26px_-12px_rgba(193,18,31,.75)] transition duration-200 hover:-translate-y-0.5 hover:from-[#AD101B] hover:to-[#8F0D16] hover:shadow-[0_16px_30px_-12px_rgba(193,18,31,.65)] disabled:translate-y-0 disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isSignup ? "Criar minha conta" : "Acessar minha conta"}
                  </Button>
                </form>

                <div className="mt-6 border-t border-[#F0F0F1] pt-5 text-center text-sm text-[#77777E]">
                  {isSignup ? (
                    <>
                      Já possui uma conta?{" "}
                      <button type="button" onClick={() => setMode("signin")} className="font-bold text-[#C1121F] transition hover:text-[#97101A] hover:underline">
                        Fazer login
                      </button>
                    </>
                  ) : (
                    <>
                      Ainda não tem uma conta?{" "}
                      <button type="button" onClick={() => setMode("signup")} className="font-bold text-[#C1121F] transition hover:text-[#97101A] hover:underline">
                        Criar conta
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-[11px] font-medium text-[#929299]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#C1121F]" />
                Acesso protegido e conexão segura
              </div>

              <p className="mt-6 text-center text-[11px] leading-5 text-[#A0A0A6]">
                Ao continuar, você concorda com nossos{" "}
                <Link to="/terms" className="font-semibold text-[#77777E] underline decoration-[#D0D0D3] underline-offset-2 hover:text-[#111111]">Termos</Link>
                {" "}e{" "}
                <Link to="/privacy" className="font-semibold text-[#77777E] underline decoration-[#D0D0D3] underline-offset-2 hover:text-[#111111]">Privacidade</Link>.
              </p>
            </motion.div>
          </main>

          <footer className="px-5 pb-5 text-center text-[10px] font-medium tracking-[0.12em] text-[#B0B0B5] sm:px-8 lg:px-10">
            © {new Date().getFullYear()} AMT SISTEMAS · AMTDOJOMANAGER.COM.BR
          </footer>
        </section>
      </div>

      <Dialog open={showStudentConflict} onOpenChange={setShowStudentConflict}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <UserIcon className="h-6 w-6 text-[#C1121F]" />
              Identificamos seu e-mail
            </DialogTitle>
            <DialogDescription className="pt-2 text-base leading-relaxed text-[#111111]/80">
              Você já possui um cadastro de aluno no dojo <span className="font-bold text-[#111111]">{conflictDojoName}</span>.
              <br /><br />
              O que você deseja fazer agora?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={() => window.location.assign("/app")}
              className="h-auto flex-col items-start gap-1 border-black/10 bg-white p-4 text-[#111111] hover:border-black/20 hover:bg-neutral-50"
              variant="outline"
            >
              <div className="font-bold">Acessar App do Aluno</div>
              <div className="text-xs font-normal text-[#111111]/60">Acompanhar meus treinos e graduações neste dojo.</div>
            </Button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-black/5" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-[#111111]/40"><span className="bg-white px-2">Ou</span></div>
            </div>
            <Button
              onClick={handleSignUpDirect}
              className="h-auto flex-col items-start gap-1 border-black/10 bg-white p-4 text-[#111111] hover:border-black/20 hover:bg-neutral-50"
              variant="outline"
            >
              <div className="font-bold">Cadastrar meu próprio Dojo</div>
              <div className="text-xs font-normal text-[#111111]/60">Criar um novo dojo como instrutor (sem vínculo com o anterior).</div>
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowStudentConflict(false)} className="w-full text-[#111111]/60">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
