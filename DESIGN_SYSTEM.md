# Design System — Portal Nord

Referência oficial de cores, tipografia, espaçamentos, ícones e
componentes usados no Portal Nord. Qualquer tela nova ou ajustada deve
seguir este padrão para manter a identidade visual consistente.

Tema: **dark only** (não há modo claro). Fonte: **Inter** (via
`next/font/google`, variável `--font-inter`), com **Geist Mono** para
texto monoespaçado.

## Paleta de cores

Definida em `src/app/globals.css` como CSS custom properties e
exposta ao Tailwind v4 via `@theme inline` (classes `bg-nord-*`,
`text-nord-*`, `border-nord-*`).

| Token | Hex | Uso |
|---|---|---|
| `--nord-black` | `#05070a` | Fundo geral da aplicação (`body`) |
| `--nord-panel` | `#0e1117` | Fundo de painéis/inputs, um tom acima do preto |
| `--nord-card` | `#151a23` | Fundo dos cards (`.nord-card`) |
| `--nord-border` | `#232a37` | Bordas padrão de cards, inputs, divisórias |
| `--nord-blue` | `#1464f4` | Cor de marca / ação primária (botões, ativo no menu) |
| `--nord-blue-light` | `#3b82f6` | Hover de azul, links, textos de destaque |
| `--nord-gray` | `#9aa4b2` | Texto secundário, labels, ícones inativos |
| `--nord-white` | `#f7f9fc` | Texto principal sobre fundo escuro |
| `--nord-success` | `#22c55e` | Positivo (crescimento, status ok, badges verdes) |
| `--nord-warning` | `#f59e0b` | Atenção (badges amarelos) |
| `--nord-danger` | `#ef4444` | Erro/negativo (badges vermelhos, quedas) |

Cada **categoria** do menu lateral também tem sua própria cor
(`Category.color` no banco), usada para colorir o ícone da categoria e
o dot de identificação — essa cor é dinâmica por categoria, não faz
parte da paleta fixa acima.

## Tipografia

- Fonte principal: **Inter** (`font-sans`), aplicada no `body`.
- Fonte mono: **Geist Mono**, para números/código quando necessário.
- Hierarquia comum:
  - Título de página: `text-lg font-semibold text-white` (via `Topbar`)
  - Título de seção/card: `text-sm font-medium text-white` ou `font-semibold text-base`
  - Valor de KPI: `text-2xl font-semibold text-white tracking-tight`
  - Texto secundário/legendas: `text-xs text-nord-gray`
  - Texto de tabela: `text-sm`, cabeçalho `text-xs text-nord-gray`

## Ícones

Biblioteca: **lucide-react**, renderizados via o componente
`DynamicIcon` (`src/components/dynamic-icon.tsx`), que recebe o nome
do ícone como string (ex.: `"DollarSign"`, `"ShoppingCart"`) — isso
permite guardar o nome do ícone no banco (categorias, subcategorias,
KPIs) e resolvê-lo dinamicamente em runtime. Se o nome não existir,
cai no ícone `Circle` como fallback.

```tsx
<DynamicIcon name="DollarSign" size={20} style={{ color: "#1464F4" }} />
```

## Fundo, cards e bordas

Classe utilitária base (`globals.css`):

```css
.nord-card {
  background: var(--nord-card);
  border: 1px solid var(--nord-border);
  border-radius: 14px;
}
```

Todo bloco de conteúdo (seções, tabelas, cards de KPI, modais) parte
de `.nord-card`. Padding interno padrão: `p-4` (cards/seções) ou `p-3`
a `p-6` dependendo do contexto.

Scrollbars customizadas (`.nord-scrollbar` + regras `::-webkit-scrollbar`)
usam `--nord-panel` de trilho e `--nord-border` de thumb, com hover em
`--nord-blue`.

## Botões

```css
.btn-primary   /* fundo --nord-blue, texto branco, hover --nord-blue-light */
.btn-outline   /* borda --nord-border, texto --nord-gray, hover borda/texto azul-branco */
```

Botões de ação primária no dia a dia também aparecem "soltos" com essas
classes Tailwind equivalentes:

```tsx
className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
  bg-nord-blue hover:bg-nord-blue-light text-white font-medium"
```

## Inputs / formulários

```css
.input {
  background: var(--nord-panel);
  border: 1px solid var(--nord-border);
  border-radius: 8px;
  padding: 8px 12px;
  color: white;
  font-size: 13px;
}
.input:focus { border-color: var(--nord-blue); }
```

## Componentes compartilhados (`src/components/ui/stat-card.tsx`)

### `StatCard` — card de KPI (o card padrão de indicador numérico)

- `.nord-card` + borda superior colorida de 2px (`border-t-2`, cor via
  prop `color`, padrão `#1464F4`).
- Ícone à **esquerda** do label: badge `40x40px` (`w-10 h-10 rounded-xl`),
  fundo = cor do card a 13% de opacidade (`${color}22`), ícone 20px na
  cor cheia.
- Label ao lado do ícone: `text-sm text-white` (customizável via
  `labelClassName`).
- Valor: `text-2xl font-semibold tracking-tight text-white`.
- Delta (variação %) opcional: pill `bg-nord-success/15 text-nord-success`
  (positivo) ou `bg-nord-danger/15 text-nord-danger` (negativo), com
  ícone `TrendingUp`/`TrendingDown` 12px + texto "vs. período anterior".
- `hint` opcional substitui o delta quando não há variação a mostrar.

```tsx
<StatCard label="Faturamento do mês" value="R$ 42.000" icon="DollarSign"
  delta={12.4} color="#1464F4" />
```

### `SortableStatCards` (`src/components/ui/sortable-stat-cards.tsx`)

Grade de `StatCard`s com **drag-and-drop** para reordenar (dnd-kit),
persistindo a ordem escolhida pelo usuário em `localStorage` (chave
única por página via prop `storageKey`). É o padrão usado em **todas**
as telas com múltiplos KPIs — não usar `StatCard` solto em grid manual
quando há 2+ cards.

```tsx
<SortableStatCards
  storageKey="inicio-kpi-order"
  className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4"
  cards={[{ key: "faturamento-mes", label: "Faturamento do mês", value: "R$ 42.000", icon: "DollarSign" }]}
/>
```

### `Section` — bloco de conteúdo com título

`.nord-card p-4`, título `text-white font-medium text-sm` + slot de
ação opcional (ex.: link "Ver todas") alinhado à direita.

### `Badge` — etiqueta de status

Pílula (`rounded-full`, `text-[11px] font-medium`, `px-2 py-0.5`) com
5 tons:

| tone | classes |
|---|---|
| `default` | `bg-white/10 text-nord-gray` |
| `success` | `bg-nord-success/15 text-nord-success` |
| `warning` | `bg-nord-warning/15 text-nord-warning` |
| `danger` | `bg-nord-danger/15 text-nord-danger` |
| `info` | `bg-nord-blue/15 text-nord-blue-light` |

### `ProgressBar`

Barra `h-2 rounded-full bg-nord-border`, preenchimento na cor passada
(padrão `--nord-blue`), largura = `percent` (0–100, clamped).

## Modal (`src/components/ui/modal.tsx`)

- Overlay: `bg-black/70 backdrop-blur-sm`.
- Painel: `.nord-card`, `shadow-2xl`, `max-h-[90vh] overflow-y-auto`.
- Cabeçalho fixo (`sticky top-0`) com título `text-white font-semibold
  text-base` e botão de fechar (ícone `X`) à direita.
- Fecha com `Esc` ou clique no overlay.
- `FormError`: banner de erro em formulário — `bg-red-950/40
  border border-red-900`, ícone `AlertTriangle`, texto `text-red-300`.

## Menu lateral (`src/components/sidebar/sidebar.tsx`)

- Categoria **ativa**: fundo sólido `bg-nord-blue`, borda `border-nord-blue`,
  texto e ícone brancos.
- Categoria **inativa**: sem fundo, texto `text-nord-gray` (hover:
  `text-white` + `bg-white/5`), ícone na cor própria da categoria
  (`cat.color`).
- Subcategorias seguem o mesmo padrão, com o ícone também herdando a
  cor da categoria-pai quando ativa é branca, senão a cor da categoria.
- Reordenação de categorias/subcategorias via drag handle (dnd-kit),
  visível só para admins.
- Categoria/subcategoria desativada (`active: false`): opacidade
  reduzida (`opacity-45`).

## Página / Topbar (`src/components/page-container.tsx`)

Toda página autenticada usa `PageContainer`, que renderiza a `Topbar`
(título, subtítulo, nome/cor da empresa ativa) e o conteúdo dentro de
`main.flex-1.p-6.space-y-6.max-w-[1600px].mx-auto` — ou seja,
**conteúdo centralizado, largura máxima 1600px, espaçamento vertical
de 24px (`space-y-6`) entre blocos**.

## Regra de subcategorias (organização, não visual)

Toda "subcategoria" nova de um módulo deve ser cadastrada **apenas no
menu lateral** (`Category`/`Subcategory` no `prisma/schema.prisma` +
seed em `prisma/seed.ts`, renderizado por `sidebar.tsx`) — nunca
duplicada como aba no menu superior interno do módulo (ex.:
`finance-tabs.tsx`). Ver `CLAUDE.md` para o histórico dessa regra.

**Atenção operacional:** alterações em `prisma/seed.ts` e em
`prisma/migrations/` só entram em vigor no código — não são aplicadas
sozinhas ao banco de produção. Confirme que a migration foi de fato
aplicada (hoje via `scripts/migrate-deploy.sh` no build) antes de
remover qualquer atalho de navegação que dependa dela.
