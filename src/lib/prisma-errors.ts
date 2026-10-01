import { Prisma } from "@prisma/client";

/**
 * Descobre se um P2002 se refere a uma constraint cujo nome contém `needle` (ex.: "telefone",
 * "responseId", "code", "numero") — ou `undefined` se não for possível determinar.
 *
 * Achado ao vivo originalmente em `src/lib/roulette-server.ts`: nesta versão do Prisma (7.10)
 * com driver adapter (`@prisma/adapter-pg`, ver src/lib/prisma.ts),
 * `PrismaClientKnownRequestError.meta.target` (o formato "clássico", usado por vários helpers
 * `isXConflict` espalhados pelo app) vem **`undefined`** — o detalhe do conflito aparece só em
 * `meta.driverAdapterError.cause.constraint.index` (o nome do índice Postgres, ex.
 * `"RouletteSpin_responseId_key"`) e, como reforço, em `cause.originalMessage` (a mensagem crua
 * do Postgres, que também cita o nome da constraint). Os helpers irmãos não quebraram com essa
 * mudança só por sorte: todos têm fallback `?? true` (tratam qualquer P2002 como sendo aquela
 * constraint específica quando não conseguem confirmar), o que é seguro PRA ELES porque cada
 * `create`/`update` que protegem só tem UMA constraint única possível — mas deixaria de ser
 * seguro no dia em que um desses models ganhar uma segunda constraint única. Checar os dois
 * formatos (`target` E `driverAdapterError`) deixa a função funcionando nos dois shapes
 * possíveis, em vez de depender de qual delas o ambiente de fato usa.
 */
export function p2002ConstraintIncludes(e: unknown, needle: string): boolean | undefined {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return undefined;
  const meta = e.meta as
    | { target?: string[]; driverAdapterError?: { cause?: { constraint?: { index?: string }; originalMessage?: string } } }
    | undefined;
  if (meta?.target) return meta.target.some((t) => t.includes(needle));
  const index = meta?.driverAdapterError?.cause?.constraint?.index;
  if (index) return index.includes(needle);
  const message = meta?.driverAdapterError?.cause?.originalMessage;
  if (message) return message.includes(needle);
  return undefined;
}
