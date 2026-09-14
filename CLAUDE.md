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
