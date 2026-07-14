import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Sidebar } from "@/components/sidebar/sidebar";
import { redirect } from "next/navigation";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const categories = await prisma.category.findMany({
    orderBy: { order: "asc" },
    include: { subcategories: { orderBy: { order: "asc" } } },
  });

  return (
    <div className="flex min-h-screen w-full bg-nord-black">
      <Sidebar
        initialCategories={categories}
        userName={session.user.name ?? session.user.email ?? "Usuário"}
        userRole={session.user.role}
      />
      <div className="flex-1 flex flex-col min-w-0">{children}</div>
    </div>
  );
}
