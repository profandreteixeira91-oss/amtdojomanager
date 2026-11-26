import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { studentSupabase as supabase } from "@/lib/student-auth/student-client";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Award,
  BellRing,
  CalendarCheck,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { checkStudentAccess, activateStudentAccount, linkMyStudentEnrollments } from "@/lib/student/activation.functions";
import { redeemStudentPasswordReset, requestStudentPasswordReset } from "@/lib/student-auth/password-reset.functions";
import { RESET_CODE_TTL_MINUTES } from "@/lib/student-auth/password-reset";
import { DOJO_LOGO_HEIGHT, DOJO_LOGO_SRC, DOJO_LOGO_WIDTH } from "@/components/dojo/DojoLogo";

export const Route = createFileRoute("/app/login")({
  head: () => ({ meta: [{ title: "Entrar — Portal do Aluno" }, { name: "robots", content: "noindex" }] }),
  component: LoginPage,
});

type Step = "email" | "password" | "activate" | "reset";

// Visual alinhado à tela de login do painel (/dojo/auth).
const inputCls =
  "h-11 w-full rounded-xl border border-black/10 bg-[#fafafa] pl-9 pr-3 text-[15px] text-[#111111] placeholder:text-[#111111]/35 outline-none transition focus:border-[#dc2626]/40 focus:bg-white focus:ring-2 focus:ring-[#dc2626]/25";
const labelCls = "mb-1.5 block text-xs font-semibold text-[#111111]/75";
const iconCls = "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111111]/40";
const eyeCls =
  "absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-[#111111]/45 transition hover:bg-black/[0.04] hover:text-[#111111]";
const primaryBtnCls =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#dc2626] text-[15px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(220,38,38,0.9)] transition hover:bg-[#b91c1c] active:scale-[0.99] disabled:opacity-60";
const backBtnCls = "inline-flex items-center gap-1 text-sm font-medium text-[#111111]/55 hover:text-[#111111]";
const noticeCls = "rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800";

const highlights = [
  { icon: CalendarCheck, title: "Agenda e check-in", text: "Horários das turmas e presença pelo QR Code." },
  { icon: Award, title: "Sua evolução", text: "Graduações, certificados e desempenho nos treinos." },
  { icon: Wallet, title: "Mensalidades", text: "Consulte e pague suas mensalidades pelo app." },
  { icon: BellRing, title: "Avisos da academia", text: "Notificações e comunicados em tempo real." },
];

function LoginPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkStudentAccess);
  const activate = useServerFn(activateStudentAccount);
  const linkEnrollments = useServerFn(linkMyStudentEnrollments);
  const requestReset = useServerFn(requestStudentPasswordReset);
  const redeemReset = useServerFn(redeemStudentPasswordReset);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app/home", replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  async function onEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Informe um e-mail válido");
    setLoading(true);
    try {
      const res = await check({ data: { email: email.trim() } });
      if (!res.exists) {
        toast.error("E-mail não cadastrado", { description: "Fale com sua academia para liberar seu acesso." });
        return;
      }
      if (res.blocked) {
        toast.error("Acesso indisponível", { description: "Sua matrícula está inativa. Fale com sua academia." });
        return;
      }
      if ((res as { financeBlocked?: boolean }).financeBlocked) {
        toast.error("Acesso bloqueado", {
          description:
            "Seu acesso está bloqueado por pendências financeiras. Regularize com a sua academia para voltar a usar o app.",
        });
        return;
      }
      setPassword("");
      setPasswordConfirm("");
      setStep(res.activated ? "password" : "activate");
    } catch (err: any) {
      toast.error("Falha ao verificar", { description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return toast.error("Não foi possível entrar", { description: error.message });
    // Matrículas novas com este e-mail (ex.: outra academia) passam a apontar
    // para a conta só agora, depois de a senha ser comprovada.
    try {
      await linkEnrollments();
    } catch {
      /* o app segue com as matrículas já vinculadas */
    }
    navigate({ to: "/app/home", replace: true });
  }

  async function onActivate(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("A senha precisa ter ao menos 8 caracteres");
    if (password !== passwordConfirm) return toast.error("As senhas não conferem");
    setLoading(true);
    try {
      const res = await activate({ data: { email: email.trim(), password } });
      if (res.existingAccount) {
        setPassword("");
        setPasswordConfirm("");
        setStep("password");
        toast.info("Este e-mail já tem uma conta", {
          description: "Entre com a senha dessa conta ou use “Esqueci minha senha”.",
        });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast.success("Senha criada com sucesso!");
      try { localStorage.removeItem("amt-student-onboarded"); } catch {}
      navigate({ to: "/app/onboarding", replace: true });
    } catch (err: any) {
      toast.error("Falha ao criar acesso", { description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  }

  // Recuperação pelo site: a academia gera um código no painel e o aluno o
  // digita aqui junto com a nova senha (sem e-mail).
  function onForgot() {
    setPassword("");
    setPasswordConfirm("");
    setResetCode("");
    setStep("reset");
  }

  async function onRequestCode() {
    setRequesting(true);
    try {
      await requestReset({ data: { email: email.trim() } });
      toast.success("Avisamos sua academia", {
        description: "Peça o código na recepção ou pelo WhatsApp da academia.",
      });
    } catch (err: any) {
      toast.error("Não foi possível avisar a academia", { description: err?.message ?? String(err) });
    } finally {
      setRequesting(false);
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    if (resetCode.replace(/\D/g, "").length !== 6) return toast.error("Digite o código de 6 dígitos");
    if (password.length < 8) return toast.error("A senha precisa ter ao menos 8 caracteres");
    if (password !== passwordConfirm) return toast.error("As senhas não conferem");
    setLoading(true);
    try {
      await redeemReset({ data: { email: email.trim(), code: resetCode, password } });
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      toast.success("Senha redefinida com sucesso!");
      navigate({ to: "/app/home", replace: true });
    } catch (err: any) {
      toast.error("Não foi possível redefinir a senha", { description: err?.message ?? String(err) });
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f6f6f7]">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc2626]" />
      </div>
    );
  }

  const emailChip = (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f3f3f4] px-3 py-2.5 text-sm">
      <span className="min-w-0 truncate text-[#111111]/80">
        <span className="text-[#111111]/45">E-mail: </span>
        {email}
      </span>
      <button
        type="button"
        onClick={() => setStep("email")}
        className="shrink-0 text-xs font-semibold text-[#dc2626] hover:underline"
      >
        Trocar
      </button>
    </div>
  );

  return (
    <div className="relative min-h-screen w-full bg-[#f6f6f7] text-[#111111] lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
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
          <div className="inline-flex w-fit items-center rounded-2xl bg-white px-4 py-2.5 shadow-[0_10px_30px_-12px_rgba(60,0,0,0.7)]">
            <img src={DOJO_LOGO_SRC} width={DOJO_LOGO_WIDTH} height={DOJO_LOGO_HEIGHT} alt="AMT Dojo Manager" className="h-14 w-auto select-none" draggable={false} />
          </div>

          <div className="max-w-lg">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ring-1 ring-white/25">
              <ShieldCheck className="h-3.5 w-3.5" /> Portal do Aluno
            </div>
            <h2 className="text-4xl font-bold leading-[1.1] tracking-tight xl:text-[44px]">
              Seu treino na palma da mão.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/85">
              Acompanhe aulas, presença, graduações e mensalidades da sua academia em um só app.
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
        <header className="flex items-center px-5 py-4 sm:px-8 lg:invisible">
          <img src={DOJO_LOGO_SRC} width={DOJO_LOGO_WIDTH} height={DOJO_LOGO_HEIGHT} alt="AMT Dojo Manager" className="h-9 w-auto rounded-md select-none" draggable={false} />
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-[420px]"
          >
            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#dc2626]">Portal do Aluno</div>
              <h1 className="mt-1.5 text-[28px] font-bold leading-tight tracking-tight">Bem-vindo de volta</h1>
              <p className="mt-1.5 text-sm text-[#111111]/60">
                {step === "email" && "Acesse com o e-mail cadastrado na sua academia"}
                {step === "password" && "Informe sua senha para continuar"}
                {step === "activate" && "Primeiro acesso — crie sua senha"}
                {step === "reset" && "Redefina sua senha com o código da academia"}
              </p>
            </div>

            <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_24px_60px_-28px_rgba(17,17,17,0.25)] sm:p-7">
              {step === "email" && (
                <form onSubmit={onEmailContinue} className="space-y-4">
                  <div>
                    <label className={labelCls}>E-mail</label>
                    <div className="relative">
                      <Mail className={iconCls} />
                      <input
                        type="email"
                        required
                        autoFocus
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={inputCls}
                        placeholder="voce@exemplo.com"
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={primaryBtnCls}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Verificando…" : "Continuar"}
                    {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                  </button>
                </form>
              )}

              {step === "password" && (
                <form onSubmit={onLogin} className="space-y-4">
                  {emailChip}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#111111]/75">Senha</label>
                      <button type="button" onClick={onForgot} className="text-xs font-semibold text-[#dc2626] hover:underline">
                        Esqueci minha senha
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className={iconCls} />
                      <input
                        type={showPw ? "text" : "password"}
                        required
                        autoFocus
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputCls} pr-11`}
                        placeholder="••••••••"
                      />
                      <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} className={eyeCls}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={primaryBtnCls}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Entrando…" : "Entrar"}
                    {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => setStep("email")} className={backBtnCls}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Trocar e-mail
                  </button>
                </form>
              )}

              {step === "activate" && (
                <form onSubmit={onActivate} className="space-y-4">
                  <div className={noticeCls}>Este é seu primeiro acesso. Crie uma senha para continuar usando o app.</div>
                  {emailChip}
                  <div>
                    <label className={labelCls}>Nova senha</label>
                    <div className="relative">
                      <Lock className={iconCls} />
                      <input
                        type={showPw ? "text" : "password"}
                        required
                        autoFocus
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputCls} pr-11`}
                        placeholder="Mínimo 8 caracteres"
                      />
                      <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} className={eyeCls}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Confirme a senha</label>
                    <div className="relative">
                      <Lock className={iconCls} />
                      <input
                        type={showPw2 ? "text" : "password"}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className={`${inputCls} pr-11`}
                        placeholder="Repita a senha"
                      />
                      <button type="button" onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? "Ocultar senha" : "Mostrar senha"} className={eyeCls}>
                        {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={primaryBtnCls}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Criando acesso…" : "Criar senha e entrar"}
                    {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => setStep("email")} className={backBtnCls}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Trocar e-mail
                  </button>
                </form>
              )}

              {step === "reset" && (
                <form onSubmit={onReset} className="space-y-4">
                  <div className={noticeCls}>
                    Peça à sua academia o código para redefinir a senha. Ele vale {RESET_CODE_TTL_MINUTES} minutos e só
                    pode ser usado uma vez.
                    <button
                      type="button"
                      onClick={onRequestCode}
                      disabled={requesting}
                      className="mt-2 block font-semibold text-[#dc2626] underline underline-offset-4 hover:text-[#b91c1c] disabled:opacity-60"
                    >
                      {requesting ? "Avisando…" : "Avisar minha academia"}
                    </button>
                  </div>
                  {emailChip}
                  <div>
                    <label className={labelCls}>Código da academia</label>
                    <div className="relative">
                      <KeyRound className={iconCls} />
                      <input
                        type="text"
                        required
                        autoFocus
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={7}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        className={`${inputCls} text-center font-mono text-xl tracking-[0.4em]`}
                        placeholder="000000"
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Nova senha</label>
                    <div className="relative">
                      <Lock className={iconCls} />
                      <input
                        type={showPw ? "text" : "password"}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputCls} pr-11`}
                        placeholder="Mínimo 8 caracteres"
                      />
                      <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Ocultar senha" : "Mostrar senha"} className={eyeCls}>
                        {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Confirme a senha</label>
                    <div className="relative">
                      <Lock className={iconCls} />
                      <input
                        type={showPw2 ? "text" : "password"}
                        required
                        minLength={8}
                        autoComplete="new-password"
                        value={passwordConfirm}
                        onChange={(e) => setPasswordConfirm(e.target.value)}
                        className={`${inputCls} pr-11`}
                        placeholder="Repita a senha"
                      />
                      <button type="button" onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? "Ocultar senha" : "Mostrar senha"} className={eyeCls}>
                        {showPw2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={primaryBtnCls}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {loading ? "Redefinindo…" : "Redefinir senha e entrar"}
                    {!loading && <ArrowRight className="ml-1.5 h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => setStep("password")} className={backBtnCls}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Voltar para a senha
                  </button>
                </form>
              )}
            </div>

            <div className="mt-6 space-y-2 text-center">
              <div className="inline-flex items-center gap-1.5 text-[11px] text-[#111111]/45">
                <ShieldCheck className="h-3.5 w-3.5 text-[#dc2626]/70" />
                Conexão segura · Gestão · Disciplina · Evolução
              </div>
              <p className="text-xs text-[#111111]/45">
                Sua academia precisa cadastrar seu e-mail previamente para liberar o acesso.
              </p>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
