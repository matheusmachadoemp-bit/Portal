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
