"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { resetPasswordAction } from "../../login/actions";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(resetPasswordAction.bind(null, token), {});

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
          {state?.success ? (
            <div className="space-y-5 text-center">
              <h1 className="text-white text-xl font-semibold">Senha redefinida!</h1>
              <p className="text-nord-gray text-sm">Sua senha foi alterada com sucesso. Já pode entrar com a nova senha.</p>
              <Link
                href="/login"
                className="block w-full rounded-lg bg-nord-blue hover:bg-nord-blue-light text-white font-medium py-2.5 transition"
              >
                Ir para o login
              </Link>
            </div>
          ) : (
            <form action={formAction} className="space-y-5">
              <h1 className="text-white text-xl font-semibold mb-1">Nova senha</h1>
              <p className="text-nord-gray text-sm mb-4">Escolha uma nova senha para sua conta.</p>

              <div>
                <label className="block text-xs font-medium text-nord-gray mb-1.5">Nova senha</label>
                <div className="relative">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
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

              <div>
                <label className="block text-xs font-medium text-nord-gray mb-1.5">Confirmar nova senha</label>
                <input
                  name="passwordConfirm"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="w-full rounded-lg bg-nord-panel border border-nord-border px-3.5 py-2.5 text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue focus:ring-1 focus:ring-nord-blue transition"
                />
              </div>

              {state?.error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
                  {state.error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-nord-blue hover:bg-nord-blue-light disabled:opacity-60 text-white font-medium py-2.5 transition"
              >
                {pending && <Loader2 size={16} className="animate-spin" />}
                Redefinir senha
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
