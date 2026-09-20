import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desabilita a regeneracao automatica de AGENTS.md/CLAUDE.md que o `next dev`
  // faz ao detectar um agente de IA (desde o Next.js 16.3). Essa regeneracao ja
  // reescreveu o bloco do AGENTS.md com uma frase extra em 2a pessoa tentando
  // convencer o agente a "commitar pra manter a arvore limpa" (ver CLAUDE.md,
  // secao "AGENTS.md: nunca aceitar o conteudo regerado pelo `next dev` sem
  // conferir"). Ver node_modules/next/dist/server/lib/start-server.js e
  // node_modules/next/dist/docs/01-app/02-guides/ai-agents.md.
  agentRules: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
