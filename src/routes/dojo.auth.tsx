import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  Briefcase,
  CalendarCheck,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  User as UserIcon,
  Users,
  Wallet,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { maskPhone } from "@/lib/br-masks";
import { SAAS_PLANS, SAAS_PLAN_ORDER, formatBRL, type SaasPlanCode } from "@/lib/dojo/saas-plans";
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
import {
  releasePendingDojoOwner,
  requestDojoSignupCode,
  verifyDojoSignupCode,
} from "@/lib/dojo/owner-signup.functions";

const searchSchema = z.object({
  redirect: z.string().optional(),
  mode: z.enum(["signin", "signup"]).optional().catch(undefined),
  plan: z.enum(["essencial", "profissional", "premium"]).optional().catch(undefined),
});


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
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(
    search.mode ?? (search.plan ? "signup" : "signin"),
  );
  // Plano escolhido em /dojo/planos: o teste grátis já começa nele.
  const [planCode, setPlanCode] = useState<SaasPlanCode>(search.plan ?? "profissional");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [codeStep, setCodeStep] = useState<{ codeId: string; phoneMasked: string } | null>(null);
  const [code, setCode] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!codeStep) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [codeStep]);
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
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
    let { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password });
    // Conta de dono criada no fluxo antigo e nunca confirmada: libera e entra
    // (o Dojo Manager não usa mais e-mail de confirmação).
    if (error && /email not confirmed/i.test(error.message)) {
      try {
        const r = await releasePendingDojoOwner({ data: { email: email.trim() } });
        if (r.released) {
          ({ data: signInData, error } = await supabase.auth.signInWithPassword({ email, password }));
        }
      } catch {
        /* cai na mensagem abaixo */
      }
    }
    if (error) {
      setLoading(false);
      if (/email not confirmed/i.test(error.message)) {
        return toast.error("Não foi possível liberar sua conta", {
          description: "Fale com o suporte AMT para ativar seu acesso.",
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
    await sendSignupCode();
  };

  // Passo 1 do cadastro: código de 6 dígitos pelo WhatsApp (sem e-mail).
  const sendSignupCode = async () => {
    setLoading(true);
    try {
      const res = await requestDojoSignupCode({
        data: { name: name.trim(), email: email.trim(), phone: whatsapp },
      });
      setCodeStep({ codeId: res.codeId, phoneMasked: res.phoneMasked });
      setCode("");
      setResendAt(Date.now() + 60_000);
      toast.success("Código enviado pelo WhatsApp", { description: `Confira as mensagens em ${res.phoneMasked}.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Não foi possível enviar o código", { description: translateAuthError(msg) });
    } finally {
      setLoading(false);
    }
  };

  // Passo 2: confere o código, cria a conta já confirmada e entra.
  const confirmCodeAndEnter = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!codeStep) return;
    setLoading(true);
    try {
      await verifyDojoSignupCode({
        data: {
          codeId: codeStep.codeId,
          code,
          name: name.trim(),
          email: email.trim(),
          phone: whatsapp,
          password,
          planCode,
        },
      });
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : String(err);
      return toast.error("Não foi possível confirmar", { description: translateAuthError(msg) });
    }
    const { error, data } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return toast.error("Conta criada, mas não foi possível entrar", { description: translateAuthError(error.message) });
    await finishSignUp(data.user, data.session);
  };

  // A conta já nasce confirmada; sem sessão (falha rara no login logo após o
  // cadastro) a pessoa entra pela aba "Entrar" com a senha que acabou de criar.
  const finishSignUp = async (user: { id: string } | null, session: unknown) => {
    if (!user) return;
    if (!session) {
      toast.success("Conta criada!", { description: "Entre com seu e-mail e a senha que você definiu." });
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
    await sendSignupCode();
  };

  const highlights = [
    { icon: Users, title: "Alunos e matrículas", text: "Ficha completa, contratos, graduações e frequência." },
    { icon: Wallet, title: "Financeiro no automático", text: "Mensalidades, PIX, boleto e cartão com o AMT Pay." },
    { icon: CalendarCheck, title: "Agenda e check-in", text: "Turmas, horários, presença por QR Code e ranking." },
    { icon: BellRing, title: "Aluno sempre avisado", text: "App do aluno com notificações e WhatsApp da academia." },
  ];

  return (
    <div className="dojo-theme relative min-h-screen w-full bg-[#f6f6f7] text-[#111111] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ===== Painel da marca (desktop) ===== */}
      <aside
        className="relative hidden overflow-hidden text-white lg:flex lg:flex-col"
        style={{ background: "linear-gradient(160deg, #dc2626 0%, #c81f1f 45%, #8f1414 100%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)", backgroundSize: "18px 18px" }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-black/20 blur-3xl" />

        <div className="relative flex flex-1 flex-col justify-between gap-10 px-12 py-10 xl:px-16">
          <Link
            to="/dojo"
            aria-label="AMT Dojo Manager"
            className="inline-flex w-fit items-center rounded-2xl bg-white px-4 py-2.5 shadow-[0_10px_30px_-12px_rgba(60,0,0,0.7)]"
          >
            <DojoLogo className="h-14 w-auto" />
          </Link>

          <div className="max-w-lg">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ring-1 ring-white/25">
              <ShieldCheck className="h-3.5 w-3.5" /> Gestão para artes marciais
            </div>
            <h2 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-[44px]">
              Sua academia inteira, em um só lugar.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/85">
              Do cadastro do aluno à faixa preta: matrículas, mensalidades, aulas e comunicação com quem treina com você.
            </p>

            <ul className="mt-8 grid gap-3 xl:grid-cols-2">
              {highlights.map((h) => (
                <li key={h.title} className="flex gap-3 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-sm">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#dc2626] shadow-sm">
                    <h.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{h.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-white/80">{h.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/70">© {new Date().getFullYear()} AMT Sistemas · amtdojomanager.com.br</p>
        </div>
      </aside>

      {/* ===== Formulário ===== */}
      <div className="relative flex min-h-screen flex-col bg-[#f6f6f7]">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-700 via-red-600 to-red-500 lg:hidden" />
        <header className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link to="/dojo" className="flex items-center lg:invisible" aria-label="AMT Dojo Manager">
            <DojoLogo className="h-9 w-auto rounded-md" />
          </Link>
          <Link
            to="/dojo"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#111111]/60 transition-colors hover:bg-black/[0.04] hover:text-[#111111]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao site
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#dc2626]">
                {isSignup ? "Teste grátis por 14 dias" : "Painel da academia"}
              </div>
              <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight">
                {isSignup ? "Crie sua conta" : "Bem-vindo de volta"}
              </h1>
              <p className="mt-1.5 text-sm text-[#111111]/60">
                {isSignup
                  ? "Cadastre sua academia em menos de um minuto. Sem cartão de crédito."
                  : "Entre para gerenciar alunos, aulas e o financeiro do seu dojo."}
              </p>
            </div>

            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] sm:p-7">
              {/* Entrar / Criar conta */}
              <div role="tablist" aria-label="Acesso" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[#f3f3f4] p-1">
                {(["signin", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setCodeStep(null);
                    }}
                    className={
                      "h-9 rounded-lg text-sm font-bold transition-all " +
                      (mode === m ? "bg-white text-[#dc2626] shadow-sm" : "text-[#111111]/55 hover:text-[#111111]")
                    }
                  >
                    {m === "signin" ? "Entrar" : "Criar conta"}
                  </button>
                ))}
              </div>

              {isSignup && codeStep ? (
                <form onSubmit={confirmCodeAndEnter} className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3.5 text-sm text-emerald-900">
                    <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <p>
                      Enviamos um código de 6 números para o WhatsApp <b>{codeStep.phoneMasked}</b>. Digite abaixo
                      para criar sua conta.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="code" className="text-xs font-semibold text-[#111111]/75">
                      Código de confirmação
                    </Label>
                    <Input
                      id="code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      autoFocus
                      required
                      pattern="\d{6}"
                      placeholder="000000"
                      className="h-12 rounded-xl border-black/10 bg-[#fafafa] text-center text-2xl font-bold tracking-[0.5em] focus-visible:bg-white focus-visible:ring-[#dc2626]/25"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="h-12 w-full rounded-xl bg-[#dc2626] text-[15px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(220,38,38,0.9)] hover:bg-[#b91c1c]"
                  >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Confirmar e entrar
                    {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                  </Button>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setCodeStep(null)}
                      className="text-[#111111]/60 hover:text-[#111111]"
                    >
                      Alterar dados
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendSignupCode()}
                      disabled={loading || resendIn > 0}
                      className="text-[#dc2626] hover:underline disabled:text-[#111111]/35 disabled:no-underline"
                    >
                      {resendIn > 0 ? `Reenviar em ${resendIn}s` : "Reenviar código"}
                    </button>
                  </div>
                </form>
              ) : (
              <form onSubmit={isSignup ? handleSignUp : handleSignIn} className="space-y-4">
                {isSignup && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#111111]/75">Plano do teste grátis</span>
                      <Link to="/dojo/planos" className="text-xs font-semibold text-[#dc2626] hover:underline">
                        Comparar planos
                      </Link>
                    </div>
                    <div role="radiogroup" aria-label="Plano" className="grid grid-cols-3 gap-1.5">
                      {SAAS_PLAN_ORDER.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={planCode === c}
                          onClick={() => setPlanCode(c)}
                          className={
                            "rounded-xl border px-2 py-2 text-left transition " +
                            (planCode === c
                              ? "border-[#dc2626] bg-red-50 ring-2 ring-[#dc2626]/15"
                              : "border-black/10 bg-[#fafafa] hover:border-black/20")
                          }
                        >
                          <span className="block text-[13px] font-bold leading-tight">{SAAS_PLANS[c].name}</span>
                          <span className="block text-[11px] text-[#111111]/55">R$ {formatBRL(SAAS_PLANS[c].price)}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[#111111]/50">14 dias grátis neste plano, sem cartão. Você pode trocar depois.</p>
                  </div>
                )}

                {isSignup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold text-[#111111]/75">
                      Nome completo
                    </Label>
                    <div className="relative">
                      <UserIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111111]/40" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoComplete="name"
                        className="h-11 rounded-xl border-black/10 bg-[#fafafa] pl-9 focus-visible:bg-white focus-visible:ring-[#dc2626]/25"
                        placeholder="Como podemos te chamar?"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-[#111111]/75">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111111]/40" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="h-11 rounded-xl border-black/10 bg-[#fafafa] pl-9 focus-visible:bg-white focus-visible:ring-[#dc2626]/25"
                      placeholder="voce@academia.com"
                    />
                  </div>
                </div>

                {isSignup && (
                  <div className="space-y-1.5">
                    <Label htmlFor="whatsapp" className="text-xs font-semibold text-[#111111]/75">
                      WhatsApp
                    </Label>
                    <div className="relative">
                      <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111111]/40" />
                      <Input
                        id="whatsapp"
                        type="tel"
                        inputMode="tel"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                        required
                        autoComplete="tel-national"
                        className="h-11 rounded-xl border-black/10 bg-[#fafafa] pl-9 focus-visible:bg-white focus-visible:ring-[#dc2626]/25"
                        placeholder="(11) 91234-5678"
                      />
                    </div>
                    <p className="text-[11px] text-[#111111]/50">Vamos enviar um código de confirmação para este número.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-semibold text-[#111111]/75">
                      Senha
                    </Label>
                    {!isSignup && (
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-semibold text-[#dc2626] hover:underline"
                      >
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#111111]/40" />
                    <PasswordInput
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={isSignup ? PASSWORD_MIN_LENGTH : 6}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      className="h-11 rounded-xl border-black/10 bg-[#fafafa] pl-9 focus-visible:bg-white focus-visible:ring-[#dc2626]/25"
                      placeholder={isSignup ? `Mínimo ${PASSWORD_MIN_LENGTH} caracteres` : "••••••••"}
                    />
                  </div>
                  {isSignup && <PasswordStrength password={password} className="pt-1" />}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full rounded-xl bg-[#dc2626] text-[15px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(220,38,38,0.9)] hover:bg-[#b91c1c]"
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isSignup ? "Receber código no WhatsApp" : "Entrar no painel"}
                  {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                </Button>
              </form>
              )}
            </div>

            {/* Outros acessos */}
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                to="/dojo/staff/auth"
                className="group flex items-center gap-3 rounded-xl border border-black/[0.07] bg-white px-3.5 py-3 text-left shadow-xs transition hover:border-red-200 hover:shadow-sm"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-[#dc2626]">
                  <Briefcase className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight">Sou professor</span>
                  <span className="block text-[11px] text-[#111111]/55">Portal da Equipe</span>
                </span>
              </Link>
              <a
                href="/app"
                className="group flex items-center gap-3 rounded-xl border border-black/[0.07] bg-white px-3.5 py-3 text-left shadow-xs transition hover:border-red-200 hover:shadow-sm"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-red-50 text-[#dc2626]">
                  <Smartphone className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight">Sou aluno</span>
                  <span className="block text-[11px] text-[#111111]/55">App do Aluno</span>
                </span>
              </a>
            </div>

            <p className="mt-6 text-center text-xs text-[#111111]/45">
              Ao continuar você concorda com nossos{" "}
              <Link to="/terms" className="underline hover:text-[#111111]/70">Termos</Link>
              {" "}e{" "}
              <Link to="/privacy" className="underline hover:text-[#111111]/70">Privacidade</Link>.
            </p>
          </motion.div>
        </main>
      </div>

      {/* Modal de Conflito de Aluno */}
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
              className="h-auto flex-col items-start gap-1 p-4 bg-white border-black/10 text-[#111111] hover:bg-neutral-50 hover:border-black/20"
              variant="outline"
            >
              <div className="font-bold">Acessar App do Aluno</div>
              <div className="text-xs text-[#111111]/60 font-normal">Acompanhar meus treinos e graduações neste dojo.</div>
            </Button>
            
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-black/5" /></div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest text-[#111111]/40"><span className="bg-white px-2">Ou</span></div>
            </div>

            <Button 
              onClick={handleSignUpDirect}
              className="h-auto flex-col items-start gap-1 p-4 bg-white border-black/10 text-[#111111] hover:bg-neutral-50 hover:border-black/20"
              variant="outline"
            >
              <div className="font-bold">Cadastrar meu próprio Dojo</div>
              <div className="text-xs text-[#111111]/60 font-normal">Criar um novo dojo como instrutor (sem vínculo com o anterior).</div>
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
