# Portal Nord — Nord Pizza & Burger

Portal administrativo interno da Nord Pizza & Burger: gestão de vendas, marketing,
metas, RH, administrativo e ficha técnica, com autenticação, permissões por
usuário e menu lateral reorganizável por arrastar e soltar.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Prisma ORM + PostgreSQL
- Auth.js (NextAuth v5) com login por credenciais e sessão JWT
- dnd-kit para arrastar e soltar no menu lateral
- Recharts para gráficos
- lucide-react para ícones

## Configuração local

1. Configure `DATABASE_URL`, `AUTH_SECRET` e `VAULT_SECRET` em `.env` (veja `.env` como referência).
2. Instale as dependências: `npm install`
3. Aplique as migrações: `npx prisma migrate deploy` (ou `npx prisma migrate dev` em desenvolvimento)
4. Popule o banco com dados iniciais: `npm run db:seed`
5. Inicie o servidor: `npm run dev`

### Usuários de demonstração (criados pelo seed)

| Papel          | E-mail                     | Senha        |
|----------------|-----------------------------|--------------|
| Administrador  | admin@nordpizza.com         | Nord@2026    |
| Gerente        | gerente@nordpizza.com       | Gerente@2026 |

## Estrutura

- `prisma/schema.prisma` — modelo de dados completo (usuários, permissões, menu,
  vendas, marketing, metas, RH, administrativo, ficha técnica, auditoria).
- `prisma/seed.ts` — popula categorias/subcategorias do menu e dados de exemplo.
- `src/app/portal/*` — páginas autenticadas do portal, uma pasta por módulo.
- `src/app/api/*` — rotas de API (CRUD) usadas pelas páginas.
- `src/components/sidebar/*` — menu lateral retrátil com drag-and-drop.
- `src/lib/*` — cálculos de KPIs (ticket médio, ROAS, CMV, turnover etc.),
  períodos de filtro, criptografia do cofre de senhas e permissões.

## Integrações futuras

A página **Configurações** lista os endpoints de webhook reservados para as
integrações futuras com Saipos, iFood, 99Food, site próprio, Meta Ads e Google Ads.
