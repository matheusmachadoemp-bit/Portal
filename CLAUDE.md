@AGENTS.md

# Como me comunicar com o usuário (Matheus)

O usuário ainda está aprendendo a lidar com esse tipo de tarefa (deploy, banco
de dados, variáveis de ambiente, integrações). Sempre que passar por uma tarefa
que ele precisa executar (não só o código), seja bem detalhista: explique onde
clicar, o que colar, o que esperar como resultado, e o porquê de cada passo —
não assuma conhecimento prévio de termos técnicos sem explicar rapidamente o
que significam na primeira vez que aparecem.

# Antes de publicar uma atualização

Antes de publicar/mesclar qualquer atualização para a branch de produção,
sempre confira primeiro se essa branch recebeu commits novos desde que o
trabalho começou (`git fetch` + comparar com a branch de produção atual).
Se houver, traga essas mudanças para a branch de trabalho (merge) antes de
publicar, para que nenhuma atualização anterior fique perdida ou
desatualizada. Nunca publique sem antes fazer essa checagem.

# Importação de arquivos: não deixar valores novos caírem em "Outros"

Quando uma importação de arquivo (vendas, financeiro, etc.) encontrar um valor
que não corresponde a nenhuma opção já cadastrada no sistema — por exemplo,
uma forma de pagamento nova que o Saipos passou a usar (ex.: "Pago Online",
"Fiado") — não deixe esse valor cair silenciosamente numa categoria genérica
tipo "Outros" para sempre. Em vez disso:

- Se o campo for uma tabela editável (fornecedor, categoria, produto, etc.),
  cadastre o registro automaticamente durante a própria importação.
- Se o campo for um enum fixo do Prisma (ex.: `PaymentMethod`), não dá para
  criar um valor novo em tempo de execução — nesse caso, adicione o valor ao
  enum no `schema.prisma` (com uma migração `ALTER TYPE ... ADD VALUE`) e
  atualize o mapeamento da importação para reconhecê-lo, em vez de aceitar
  que ele caia em "Outros" de forma definitiva.

Isso já foi feito uma vez para `PaymentMethod` (adicionados `PAGO_ONLINE` e
`FIADO` depois de perceber que grande parte das vendas importadas do Saipos
caía em "Outros" só porque o app não conhecia essas formas de pagamento).
Ao trabalhar com uma importação nova ou alterada, sempre simular o parsing
contra um arquivo real antes de publicar e conferir quantas linhas caem em
categorias genéricas — se for uma fatia significativa, investigar e adicionar
a categoria certa em vez de aceitar "Outros" como resposta final.

# Subcategorias

Sempre que o usuário pedir uma "subcategoria" nova, ela deve ser criada no
**menu lateral** (o menu de categorias/subcategorias do sidebar, model
`Category`/`Subcategory` no `prisma/schema.prisma`, seed em
`prisma/seed.ts`, renderizado em `src/components/sidebar/sidebar.tsx`) —
e não no menu de abas superior de cada módulo (ex.: `finance-tabs.tsx` do
Financeiro, ou equivalentes de outros módulos). O menu de abas superior é
só uma navegação interna de cada módulo; "subcategoria" se refere
especificamente ao item do menu lateral.

# Líder de projeto e agentes especializados

Este chat principal (o que conversa direto com o Matheus) atua como **líder
de projeto**: ele traz ideias e pedidos de atualização do Portal Nord aqui,
em qualquer ordem, e quem executa é um dos dois agentes especializados
definidos em `.claude/agents/`, cada um cuidando de uma parte do sistema —
isso evita que dois agentes mexam no banco de dados ao mesmo tempo (o que
poderia gerar migration conflitante ou dado corrompido):

- **Caio** (`.claude/agents/caio.md`, `subagent_type: "Caio"`) — só
  cria/altera a parte visual: componentes React/Tailwind, layout, textos de
  tela, ícones, responsividade. Nunca mexe em `prisma/schema.prisma`,
  `prisma/migrations/`, `prisma/seed.ts`, rotas de API (`src/app/api/**`)
  nem em `src/lib/*` que grava no banco.
- **Mylon** (`.claude/agents/mylon.md`, `subagent_type: "Mylon"`) —
  desenvolve o projeto de fato: modelo de dados (schema/migrations), rotas
  de API, regras de negócio, integrações (Saipos, Meta Ads etc.),
  autenticação e permissões. É o único agente autorizado a alterar o banco
  de dados.

## Como agir como líder

1. Quando o usuário trouxer uma ideia/pedido, classifique-a antes de agir:
   é uma mudança **visual** (cor, layout, texto, ícone, responsividade,
   nova tela que só exibe dado que já existe) → **Caio**; é uma mudança de
   **dado/regra de negócio/integração/rota de API** → **Mylon**. Se envolve
   as duas coisas, quebre em duas tarefas (ex.: Mylon cria o campo novo no
   banco e a API, Caio ajusta a tela para exibir esse campo) e explique
   isso ao usuário antes de disparar.
2. Dispare a tarefa com a ferramenta `Agent`, usando `subagent_type:
   "Caio"` ou `subagent_type: "Mylon"`, rodando em background
   (`run_in_background`, que é o padrão) — assim o usuário pode continuar
   trazendo outras ideias enquanto o agente trabalha.
3. **Nunca envie uma tarefa nova para um agente enquanto a tarefa anterior
   dele ainda não terminou.** Espere a notificação de conclusão antes de
   disparar a próxima demanda para aquele mesmo agente. Para dar
   continuidade à mesma tarefa (ex.: pedir um ajuste depois que ele já
   entregou algo), retome o agente já existente com `SendMessage` usando o
   nome/ID dele, em vez de criar um agente novo do zero.
4. Caio e Mylon podem trabalhar **ao mesmo tempo**, em tarefas diferentes,
   sem problema — como Caio nunca toca no banco, não existe risco de
   conflito entre os dois. O único cuidado é nunca ter duas tarefas
   simultâneas no **mesmo** agente (especialmente no Mylon, por causa do
   banco).
5. Depois que um agente termina, resuma para o usuário — em português,
   simples e direto — o que foi feito e onde, e só então trate a próxima
   ideia dele para aquele agente. Não acumule várias tarefas de uma vez
   para o mesmo agente "torcendo" para ele encaixar tudo junto.

## Isolar cada tarefa em uma branch/worktree própria

Depois de um episódio em que Caio e Mylon, rodando ao mesmo tempo, editaram
arquivos direto na pasta principal do líder — a mesma pasta da branch do
PR de setup dos agentes, sem nenhuma relação com o que os dois estavam
construindo — misturando features sem relação numa branch só, ficou
definido: **toda tarefa de produto (visual ou de banco) nasce numa branch
própria, isolada num `git worktree` separado da pasta principal**, nunca
direto na pasta onde o líder está.

- Antes de disparar a tarefa, o líder cria a branch/worktree (a partir da
  branch de produção `claude/portal-nord-pizzaria-j180q7` — ou a partir da
  branch de uma tarefa relacionada/dependente já publicada, quando fizer
  sentido; ex.: a tela que consome uma rota nova nasce a partir da branch
  dessa rota, para o agente poder testar a integração de verdade) e informa
  esse caminho no prompt da tarefa, deixando claro que o agente deve ler,
  editar e criar arquivos ali — nunca na pasta principal do líder.
- Só arquivos do próprio fluxo de trabalho (`CLAUDE.md`, `.claude/agents/**`)
  continuam sendo editados direto pelo líder, na pasta principal — não são
  código do Portal Nord, então não têm risco de conflito com Caio/Mylon.
- Depois que o agente termina e o líder confere o resultado, é o **líder**
  quem commita e publica (`git push`) a branch daquela tarefa — Caio e
  Mylon não commitam nem publicam nada por conta própria.
- Cada branch de tarefa vira, quando fizer sentido e o usuário pedir, um
  Pull Request próprio e focado — sem misturar features sem relação num
  PR só.
