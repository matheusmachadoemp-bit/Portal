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

1. Configure `DATABASE_URL`, `AUTH_SECRET`, `VAULT_SECRET` e `CRON_SECRET` (autentica o cron de sincronização Saipos) em `.env` (veja `.env` como referência).
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

## Integrações

- **Saipos** (implementada): o Portal consome a API de Dados da Saipos
  (`GET https://data.saipos.io/v1/search_sales`) para importar vendas.
  Configure o token da loja em **Configurações → Integração Saipos**
  (armazenado criptografado via `src/lib/vault.ts`). A sincronização pode ser
  disparada manualmente ("Sincronizar agora") ou automaticamente por um cron
  diário (`vercel.json` → `/api/integracoes/saipos/sync`, autenticado com o
  header `Authorization: Bearer $CRON_SECRET`). Ver `src/lib/saipos-client.ts`,
  `src/lib/saipos-sync.ts` e `src/lib/saipos-mapper.ts`.
  - Cada venda gera um `Sale` (alimenta Vendas, Entrega, Pagamento, Por hora,
    Lançamentos) e o total do dia é agregado em `SalesEntry`.
  - **Limitações confirmadas com o suporte da Saipos**: a API de Dados pode
    ter delay de até D+1 na consolidação (não é tempo real); o endpoint
    `search_sales` não retorna itens por venda nem o garçom responsável, então
    "Itens vendidos" e "Desempenho por garçom" não são alimentados pela
    Saipos. A API de Pedidos (`order-api.saipos.com`) não resolve isso — ela
    serve para uma aplicação própria *enviar* pedidos ao ecossistema Saipos,
    não para ler pedidos já existentes na loja (iFood, PDV, etc.).
- A página **Configurações** também lista os endpoints de webhook reservados
  para futuras integrações com iFood, 99Food, site próprio, Meta Ads e Google Ads.
