"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { loginAction, forgotPasswordAction } from "./actions";

export default function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, {});
  const [forgotState, forgotFormAction, forgotPending] = useActionState(
    forgotPasswordAction,
    {}
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-nord-black relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-nord-blue blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-nord-blue blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="flex flex-col items-center mb-8">
          <Image src="/logo-nord.svg" alt="Nord Pizza & Burger" width={220} height={60} priority />
          <p className="text-nord-gray text-sm mt-3 tracking-wide">Portal Administrativo</p>
        </div>

        <div className="nord-card p-8 shadow-2xl">
          {mode === "login" ? (
            <form action={loginFormAction} className="space-y-5">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <h1 className="text-white text-xl font-semibold mb-1">Entrar</h1>
              <p className="text-nord-gray text-sm mb-4">Acesse com seu e-mail e senha cadastrados.</p>

              <div>
                <label className="block text-xs font-medium text-nord-gray mb-1.5">
                  E-mail ou usuário
                </label>
                <input
                  name="email"
                  type="text"
                  required
                  autoComplete="username"
                  placeholder="seuemail@nordpizza.com"
                  className="w-full rounded-lg bg-nord-panel border border-nord-border px-3.5 py-2.5 text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue focus:ring-1 focus:ring-nord-blue transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-nord-gray mb-1.5">Senha</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full rounded-lg bg-nord-panel border border-nord-border px-3.5 py-2.5 pr-10 text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue focus:ring-1 focus:ring-nord-blue transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-nord-gray hover:text-white"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-nord-gray cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="remember"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-nord-border accent-nord-blue"
                  />
                  Lembrar acesso
                </label>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-nord-blue-light hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>

              {loginState?.error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {loginState.error}
                </p>
              )}

              <button
                type="submit"
                disabled={loginPending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white font-medium py-2.5 transition"
              >
                {loginPending && <Loader2 size={16} className="animate-spin" />}
                Entrar
              </button>

              <p className="text-center text-xs text-nord-gray pt-2">
                Acesso restrito a usuários autorizados da Nord Pizza &amp; Burger.
              </p>
            </form>
          ) : (
            <form action={forgotFormAction} className="space-y-5">
              <h1 className="text-white text-xl font-semibold mb-1">Recuperar senha</h1>
              <p className="text-nord-gray text-sm mb-4">
                Informe seu e-mail cadastrado para receber as instruções de recuperação.
              </p>
              <div>
                <label className="block text-xs font-medium text-nord-gray mb-1.5">E-mail</label>
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="seuemail@nordpizza.com"
                  className="w-full rounded-lg bg-nord-panel border border-nord-border px-3.5 py-2.5 text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue focus:ring-1 focus:ring-nord-blue transition"
                />
              </div>

              {forgotState?.message && (
                <p className="text-sm text-emerald-400 bg-emerald-950/40 border border-emerald-900 rounded-lg px-3 py-2">
                  {forgotState.message}
                </p>
              )}

              <button
                type="submit"
                disabled={forgotPending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white font-medium py-2.5 transition"
              >
                {forgotPending && <Loader2 size={16} className="animate-spin" />}
                Enviar instruções
              </button>

              <button
                type="button"
                onClick={() => setMode("login")}
                className="w-full text-center text-sm text-nord-gray hover:text-white"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-nord-gray/60 mt-6">
          © {new Date().getFullYear()} Nord Pizza &amp; Burger — Portal Nord
        </p>
      </div>
    </div>
  );
}
