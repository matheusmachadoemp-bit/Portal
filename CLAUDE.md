@AGENTS.md

# Como me comunicar com o usuário (Matheus)

O usuário ainda está aprendendo a lidar com esse tipo de tarefa (deploy, banco
de dados, variáveis de ambiente, integrações). Sempre que passar por uma tarefa
que ele precisa executar (não só o código), seja bem detalhista: explique onde
clicar, o que colar, o que esperar como resultado, e o porquê de cada passo —
não assuma conhecimento prévio de termos técnicos sem explicar rapidamente o
que significam na primeira vez que aparecem.

Sempre que repassar/resumir um relatório de agente pro usuário, deixe claro
logo no início **quem** é o autor (Caio, Mylon, Otavio, Nelson ou Teulis) e
**de que tarefa/item** se trata (ex.: "item 11 — horário do Fechamento do
Dia") — nunca deixe isso implícito só pelo contexto da conversa.

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
em qualquer ordem, e quem executa é um dos cinco agentes especializados
definidos em `.claude/agents/`, cada um cuidando de uma parte do sistema —
isso evita que dois agentes mexam no banco de dados ao mesmo tempo sem
controle (o que poderia gerar migration conflitante ou dado corrompido):

- **Caio** (`.claude/agents/caio.md`, `subagent_type: "Caio"`) — só
  cria/altera a parte visual: componentes React/Tailwind, layout, textos de
  tela, ícones, responsividade. Nunca mexe em `prisma/schema.prisma`,
  `prisma/migrations/`, `prisma/seed.ts`, rotas de API (`src/app/api/**`)
  nem em `src/lib/*` que grava no banco.
- **Mylon** (`.claude/agents/mylon.md`, `subagent_type: "Mylon"`) e
  **Otavio** (`.claude/agents/otavio.md`, `subagent_type: "Otavio"`) —
  desenvolvem o projeto de fato: modelo de dados (schema/migrations), rotas
  de API, regras de negócio, integrações (Saipos, Meta Ads etc.),
  autenticação e permissões. São os dois únicos agentes autorizados a
  alterar o banco de dados, com a mesma função e as mesmas
  responsabilidades — existem dois pra poder tocar duas tarefas de backend
  independentes ao mesmo tempo. Ver "Conferir schema/migration antes de
  publicar" abaixo pra regra de coordenação entre os dois.
- **Nelson** (`.claude/agents/nelson.md`, `subagent_type: "Nelson"`) —
  especialista em segurança: audita autenticação/autorização, isolamento
  entre lojas, segredos/credenciais, dependências e injeção. Só investiga e
  relata (sem `Write`/`Edit`) — nunca corrige nada ele mesmo. Cada achado
  vira uma tarefa separada, classificada e despachada pro Caio, Mylon ou
  Otavio, igual qualquer outro pedido.
- **Teulis** (`.claude/agents/teulis.md`, `subagent_type: "Teulis"`) — fiscal
  de qualidade: revisa o resultado de Caio/Mylon/Otavio antes de qualquer
  publicação (feito da melhor forma, otimizado, sem problema, dentro do
  escopo). Só investiga e relata (sem `Write`/`Edit`) — nunca corrige nada
  ele mesmo. É o gate: nenhuma tarefa de produto é publicada sem passar
  pela revisão dele primeiro. Ver "Revisão do Teulis antes de publicar"
  abaixo.

## Como agir como líder

1. Quando o usuário trouxer uma ideia/pedido, classifique-a antes de agir:
   é uma mudança **visual** (cor, layout, texto, ícone, responsividade,
   nova tela que só exibe dado que já existe) → **Caio**; é uma mudança de
   **dado/regra de negócio/integração/rota de API** → **Mylon ou Otavio**
   (o que estiver livre; se os dois estiverem livres ao mesmo tempo e
   surgirem duas tarefas de backend independentes, pode dividir uma pra
   cada, desde que não mexam no mesmo model/tabela — ver ponto 4); é um
   pedido de **auditoria/revisão de segurança** (achar vulnerabilidade,
   revisar uma branch antes de publicar) → **Nelson**. Se envolve mais de
   uma frente (ex.: Nelson encontra um achado que precisa de correção de
   dado e outra de tela), quebre em tarefas separadas — uma por agente — e
   explique isso ao usuário antes de disparar.
2. Dispare a tarefa com a ferramenta `Agent`, usando `subagent_type:
   "Caio"`, `"Mylon"`, `"Otavio"` ou `"Nelson"` (o Teulis não entra nessa
   classificação — ele não é pra quem o pedido do usuário é roteado, é uma
   etapa interna do líder antes de publicar, ver ponto 5), rodando em
   background (`run_in_background`, que é o padrão) — assim o usuário pode
   continuar trazendo outras ideias enquanto o agente trabalha.
3. **Nunca envie uma tarefa nova para um agente enquanto a tarefa anterior
   dele ainda não terminou.** Espere a notificação de conclusão antes de
   disparar a próxima demanda para aquele mesmo agente. Para dar
   continuidade à mesma tarefa (ex.: pedir um ajuste depois que ele já
   entregou algo), retome o agente já existente com `SendMessage` usando o
   nome/ID dele, em vez de criar um agente novo do zero.
4. Caio, Mylon, Otavio e Nelson podem trabalhar **ao mesmo tempo**, em
   tarefas diferentes, sem problema — Caio nunca toca no banco e Nelson
   nunca escreve nada (só lê), então nenhum dos dois conflita com o outro
   nem com Mylon/Otavio. O cuidado de nunca ter duas tarefas simultâneas no
   **mesmo** agente vale igual pros quatro. Já Mylon e Otavio, apesar de
   serem agentes diferentes (então podem sim trabalhar ao mesmo tempo,
   cada um na sua branch/worktree), os dois mexem no banco — só dispare os
   dois ao mesmo tempo se as duas tarefas forem claramente de módulos
   diferentes, sem chance de mexerem no mesmo model/tabela; na dúvida,
   trate como se fosse "o mesmo agente" e espere um terminar antes de
   disparar o outro. Ver "Conferir schema/migration antes de publicar" pra
   como validar na hora de publicar as duas.
5. **Antes de publicar qualquer tarefa de produto (visual ou de banco),
   passa pelo Teulis primeiro.** Assim que Caio, Mylon ou Otavio terminam,
   o líder dispara o Teulis pra revisar o MESMO worktree/branch (ele não
   precisa de worktree próprio, igual o Nelson) — passando o pedido
   original resumido e quem fez. Só depois do relatório do Teulis vir
   liberado (ou dos achados dele serem corrigidos pelo agente que fez a
   tarefa e revisados de novo) o líder publica. Ver "Revisão do Teulis
   antes de publicar" abaixo.
6. Depois que um agente termina, resuma para o usuário — em português,
   simples e direto — o que foi feito e onde, e só então trate a próxima
   ideia dele para aquele agente. Não acumule várias tarefas de uma vez
   para o mesmo agente "torcendo" para ele encaixar tudo junto.

## Conferir schema/migration antes de publicar

Antes de publicar (merge pra produção) qualquer branch que tenha mudança em
`prisma/schema.prisma` ou em `prisma/migrations/`, a migration precisa ter
sido validada com as próprias mãos contra um Postgres descartável local — do
zero, aplicando todo o histórico de migrations mais a nova — confirmando que
aplica sem erro e que o resultado bate com o esperado. Isso é parte do que o
**Teulis** confere na revisão (ver "Revisão do Teulis antes de publicar"
abaixo); o líder não precisa repetir essa validação do zero se o relatório
do Teulis mostrar que ela foi feita de verdade e veio limpa — mas nunca
publica só porque o Mylon/Otavio relatou "validei e passou" sem essa
validação ter sido conferida por alguém de fora (Teulis).

Isso fica ainda mais importante com Mylon e Otavio rodando em paralelo (cada
um numa branch/worktree própria, mas os dois podendo mexer no banco): duas
migrations concorrentes podem aplicar sem erro cada uma isoladamente e ainda
assim serem incompatíveis entre si (ex.: as duas mexendo no mesmo model).
Nesse caso, o líder nunca publica as duas "às cegas" — publica uma primeira,
traz a outra branch pra cima da produção já atualizada (mesma regra de
"Antes de publicar uma atualização" acima) e revalida a migration da segunda
branch já com a primeira aplicada antes de publicar. Ao disparar as
tarefas, prefira também já separar por módulos claramente diferentes entre
Mylon e Otavio, pra reduzir a chance de esbarrarem no mesmo model.

## Revisão do Teulis antes de publicar

Nenhuma tarefa de produto (visual ou de banco) é publicada sem passar pelo
Teulis primeiro. Fluxo:

1. Caio/Mylon/Otavio termina e reporta pro líder, do jeito de sempre.
2. O líder dispara o Teulis (`subagent_type: "Teulis"`), passando o caminho
   do worktree/branch (o mesmo da tarefa — Teulis não precisa de worktree
   próprio), o pedido original resumido, e quem fez.
3. O Teulis lê o diff, roda `tsc`/`lint` por conta própria, e — se a tarefa
   tiver migration — valida ela contra um Postgres descartável, tudo antes
   de reportar.
4. Se o relatório vier **liberado**: o líder segue o fluxo normal de
   publicação (checar commits novos em produção, commitar, push, PR, merge).
5. Se o relatório trouxer **achados**: o líder decide o destino de cada um
   — a maioria volta pro mesmo agente que fez a tarefa, corrige, e passa
   pelo Teulis de novo; um achado de outra frente (ex.: bug visual achado
   numa tarefa do Mylon) vira uma tarefa separada pro agente certo, do jeito
   que já se faz com achado do Nelson. Nunca publica com achado crítico ou
   importante em aberto.

Como o Teulis só lê (nunca escreve), ele pode revisar tranquilo mesmo com
Caio/Mylon/Otavio ainda trabalhando em outras tarefas ao mesmo tempo — não
precisa esperar ninguém terminar pra rodar uma revisão. Diferente de
Mylon/Otavio (nunca duas tarefas simultâneas no mesmo agente), o líder pode
disparar **mais de uma revisão do Teulis ao mesmo tempo**, uma por
`subagent_type: "Teulis"`, desde que cada revisão seja de um worktree/tarefa
diferente e totalmente independente — cada revisão é autocontida (não
depende de contexto de conversa de uma revisão anterior) e só cria banco
descartável com nome próprio, sem risco de esbarrar numa revisão paralela.

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
  código do Portal Nord, então não têm risco de conflito com Caio/Mylon/Otavio.
- Depois que o agente termina e o líder confere o resultado, é o **líder**
  quem commita e publica (`git push`) a branch daquela tarefa — Caio, Mylon
  e Otavio não commitam nem publicam nada por conta própria.
- Cada branch de tarefa vira, quando fizer sentido e o usuário pedir, um
  Pull Request próprio e focado — sem misturar features sem relação num
  PR só.
- **Nelson e Teulis são a exceção**: como os dois só leem (nunca escrevem),
  não precisam de branch/worktree próprio — podem investigar/revisar direto
  num worktree já existente (no caso do Teulis, sempre o mesmo worktree da
  tarefa que ele está revisando). Mas atenção: a pasta principal do líder
  fica parada numa
  branch de fluxo de trabalho própria (`claude/project-leader-*`), que
  **nunca** recebe as mudanças de produto já publicadas — ela só serve para
  editar `CLAUDE.md`/`.claude/agents/**`. Nunca aponte o Nelson ou o Teulis
  (nem leia você mesmo, líder) pra essa pasta achando que reflete o estado
  atual do Portal Nord — sempre `git fetch` a branch de produção
  (`claude/portal-nord-pizzaria-j180q7`) e investigue a partir de um
  worktree/checkout dela (ex.: reaproveite o worktree mais recente de uma
  tarefa já publicada). Isso já causou um alarme falso de segurança nesta
  sessão (achou que o Cofre de senhas tinha perdido uma checagem de cargo
  que na verdade só não existia nessa branch parada).
