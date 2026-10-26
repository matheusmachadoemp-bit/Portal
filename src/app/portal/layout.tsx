import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar/sidebar";
import { MobileSidebarProvider } from "@/components/sidebar/mobile-sidebar-context";
import { redirect } from "next/navigation";
import { getActiveEmpresaContext } from "@/lib/empresa";
import { buildVisibilityResolver } from "@/lib/permissions";
import { getMenuCategories } from "@/lib/menu-categories";
import { PushRegistration } from "@/components/push-registration";
import { IosInstallBanner } from "@/components/ios-install-banner";
import { PushPermissionBanner } from "@/components/push-permission-banner";
import { FirstLoginNotificationModal } from "@/components/first-login-notification-modal";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allCategories, empresaContext, dbUser] = await Promise.all([
    getMenuCategories(),
    getActiveEmpresaContext(),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        permissionProfile: { select: { modulePermissions: { select: { moduleKey: true, canView: true } } } },
        permissions: { select: { moduleKey: true, level: true } },
      },
    }),
  ]);

  const isVisible = buildVisibilityResolver(
    session.user.role,
    dbUser?.permissionProfile?.modulePermissions,
    dbUser?.permissions
  );
  const categories = isVisible
    ? allCategories
        .filter((c) => isVisible(c.key))
        .map((c) => ({ ...c, subcategories: c.subcategories.filter((s) => isVisible(`${c.key}:${s.key}`)) }))
    : allCategories;

  if (!empresaContext) {
    return (
      <div className="min-h-screen w-full bg-nord-black flex items-center justify-center p-6">
        <div className="nord-card p-8 max-w-md text-center">
          <h1 className="text-white text-lg font-semibold mb-2">Sem acesso a nenhuma loja</h1>
          <p className="text-nord-gray text-sm">
            Seu usuário ainda não tem acesso a nenhuma empresa do Grupo Nord. Peça a um
            administrador para liberar o acesso em Usuários.
          </p>
        </div>
      </div>
    );
  }

  return (
    <MobileSidebarProvider>
      {/* "Pular para o conteúdo": primeiro elemento focável da página inteira
          (antes até da Topbar). Fica visualmente invisível (`sr-only`) até
          receber foco pelo teclado (Tab) — aí vira um botão visível no canto
          superior esquerdo. Quem navega só por teclado pode apertar Enter
          nele pra ir direto pro conteúdo principal (`#main-content`, o
          `<main>` de `PageContainer`), sem precisar passar item por item pela
          Topbar nem pelo menu lateral inteiro. Padrão comum de acessibilidade
          web (WCAG 2.4.1 "Bypass Blocks"). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:inline-flex focus:items-center focus:rounded-lg focus:bg-nord-blue focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-white focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-nord-blue-light"
      >
        Pular para o conteúdo
      </a>
      <PushRegistration />
      <IosInstallBanner />
      {/* No primeiro login de verdade, o FirstLoginNotificationModal já é o
          convite pra ativar notificações (mais chamativo, pensado pra esse
          momento específico) — sem esconder o banner aqui, os dois
          apareceriam juntos (banner fino no topo + popup centralizado)
          pedindo a mesma coisa (achado do Teulis na revisão). `isFirstLogin`
          some (`undefined`/`false`) a partir do próximo login do mesmo
          usuário — o banner volta a aparecer normalmente a partir daí. */}
      {!session.user.isFirstLogin && <PushPermissionBanner />}
      <FirstLoginNotificationModal />
      <div className="flex min-h-screen w-full bg-nord-black">
        {/* Ordem do DOM intencionalmente invertida em relação à ordem visual: o
            conteúdo da página (que começa pela Topbar — busca, notificações,
            troca de loja, menu do usuário) vem primeiro no HTML para que a
            navegação por teclado (tecla Tab) a partir do topo da página chegue
            primeiro à Topbar, e só depois ao menu lateral completo — ordem de
            tabulação mais intuitiva (item de backlog de acessibilidade). A
            classe `order-2` restaura a posição visual original (menu à
            esquerda, conteúdo à direita): `order` do CSS só muda a ordem
            visual no flex, nunca a ordem de tabulação, que sempre segue a
            ordem do DOM. */}
        <div className="flex-1 flex flex-col min-w-0 order-2">{children}</div>
        <Sidebar
          initialCategories={categories}
          userName={session.user.name ?? session.user.email ?? "Usuário"}
          userRole={session.user.role}
          empresas={empresaContext.empresas}
          activeEmpresaId={empresaContext.mode === "single" ? empresaContext.empresa.id : "GRUPO"}
          canViewGrupoNord={empresaContext.canViewGrupoNord}
        />
      </div>
    </MobileSidebarProvider>
  );
}
