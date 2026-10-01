import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { requireActiveSingleEmpresa } from "@/lib/empresa";
import { computeHorasTrabalhadas, timeToMinutes } from "@/lib/rh-helpers";
import { hasModulePermission } from "@/lib/authz";
import { parseExcelDateCode, readWorkbookRows } from "@/lib/xlsx-import";
import { spStartOfDay } from "@/lib/checklist";
import { mapMarcacoes, onlyDigits, parseTecnopontoPdf } from "@/lib/ponto-pdf-import";

const HEADER_ALIASES: Record<string, string> = {
  colaborador: "colaborador",
  funcionario: "colaborador",
  nome: "colaborador",
  data: "data",
  entrada: "entrada",
  saidaalmoco: "saidaAlmoco",
  saidaparaalmoco: "saidaAlmoco",
  retornoalmoco: "retornoAlmoco",
  retornodoalmoco: "retornoAlmoco",
  saida: "saida",
  atraso: "atraso",
  atrasominutos: "atraso",
};

function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Task #318 (mesma classe do achado do Teulis já corrigido em POST/PATCH de ../route.ts e
// ../[id]/route.ts): devolve a chave "YYYY-MM-DD" — nunca um `Date` já convertido — pra quem grava
// decidir o instante certo via `spStartOfDay` (meia-noite de São Paulo). Antes, esta função devolvia
// `new Date(Date.UTC(y, m-1, d))` (meia-noite UTC), 3h ANTES da meia-noite de SP do mesmo dia, o que
// fazia o primeiro dia de qualquer período importado ficar fora do `gte` calculado por
// `resolveRollingPeriod`/`spMonthStart`.
function parseDateKeyFlexible(raw: string | number): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (typeof raw === "number") {
    // Excel serial date
    const parsed = parseExcelDateCode(raw);
    if (!parsed) return null;
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }
  const s = String(raw).trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) return `${br[3]}-${pad(Number(br[2]))}-${pad(Number(br[1]))}`;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  return null;
}

// A célula de horário pode chegar como number (célula nativa do Excel, sem formatação de texto —
// uma hora "pura", sem data, vira uma fração do dia: "08:00" = serial 0.3333...) ou como string já
// em "HH:MM" (arquivo exportado/editado como texto). Converte pro mesmo formato "HH:MM" que
// timeToMinutes/computeHorasTrabalhadas (@/lib/rh-helpers) esperam nos dois casos.
function parseTimeFlexible(raw: string | number): string | null {
  if (typeof raw === "number") {
    const parsed = parseExcelDateCode(raw);
    if (!parsed) return null;
    return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}`;
  }
  const s = raw.trim();
  return s || null;
}

function rowsFromCsvText(text: string): string[][] {
  const delimiter = text.includes(";") ? ";" : ",";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, "")));
}

type ValidEntry = {
  employeeId: string;
  date: Date;
  entrada: string | null;
  saidaAlmoco: string | null;
  retornoAlmoco: string | null;
  saida: string | null;
  horasTrabalhadas: number;
  atrasoMinutos: number;
  falta: boolean;
  /**
   * Nota visível sobre o dia (Ocorrência do PDF e/ou marcação não classificada). `undefined`
   * (diferente de `null`) significa "não alterar a observação já gravada" — usado pela importação
   * de planilha, que não tem coluna equivalente a este campo. Achado do Teulis na revisão da task
   * de importação de PDF: antes, a planilha mandava `null` incondicionalmente, e o
   * `UPDATE ... FROM UNNEST` de `upsertTimeEntries` sobrescrevia `observacao` pra TODA linha
   * reimportada — apagando silenciosamente uma observação deixada por uma importação de PDF
   * anterior do mesmo colaborador+data. A importação de PDF continua sempre preenchendo este campo
   * (com a Ocorrência do dia, ou `null` se não houver nenhuma) — `upsertTimeEntries` agora respeita
   * essa distinção `undefined`/valor explícito mesmo no UPDATE em lote, mesma semântica "undefined
   * preserva" já usada nas rotas de edição manual (route.ts:177, [id]/route.ts:65).
   */
  observacao: string | null | undefined;
};

/**
 * Grava `validEntries` no banco — cria os que ainda não existem (`employeeId`+`date`) e atualiza em
 * lote os que já existem (reimportar um período já importado antes atualiza em vez de duplicar).
 * Compartilhada pelos 2 formatos de importação desta rota (planilha/CSV e PDF).
 */
async function upsertTimeEntries(empresaId: string, validEntries: ValidEntry[]): Promise<number> {
  if (validEntries.length === 0) return 0;

  const existing = await prisma.timeEntry.findMany({
    where: { OR: validEntries.map((e) => ({ employeeId: e.employeeId, date: e.date })) },
    select: { employeeId: true, date: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.employeeId}|${e.date.getTime()}`));
  const keyOf = (e: ValidEntry) => `${e.employeeId}|${e.date.getTime()}`;

  const toCreate = validEntries.filter((e) => !existingKeys.has(keyOf(e)));
  const toUpdate = validEntries.filter((e) => existingKeys.has(keyOf(e)));

  if (toCreate.length > 0) {
    await prisma.timeEntry.createMany({
      data: toCreate.map((e) => ({ ...e, empresaId })),
      skipDuplicates: true,
    });
  }
  if (toUpdate.length > 0) {
    // Uma única query SQL (`UPDATE ... FROM UNNEST(...)`) em vez de
    // `prisma.$transaction(toUpdate.map((e) => prisma.timeEntry.update(...)))`
    // — a API de "sequential operations" do Prisma, que roda cada update
    // um atrás do outro dentro de uma transação interativa com timeout
    // padrão de 5s. Reimportar uma planilha/PDF de ponto de um período já
    // importado facilmente gera centenas de linhas de update (mesmo bug
    // encontrado e corrigido em `syncEmpresaSaiposSales`, ver
    // `src/lib/saipos-sync.ts`), e isso derrubaria a importação inteira
    // sem atualizar nada.
    const employeeIds = toUpdate.map((e) => e.employeeId);
    const dates = toUpdate.map((e) => e.date);
    const entradas = toUpdate.map((e) => e.entrada);
    const saidasAlmoco = toUpdate.map((e) => e.saidaAlmoco);
    const retornosAlmoco = toUpdate.map((e) => e.retornoAlmoco);
    const saidas = toUpdate.map((e) => e.saida);
    const horasTrabalhadas = toUpdate.map((e) => e.horasTrabalhadas);
    const atrasosMinutos = toUpdate.map((e) => e.atrasoMinutos);
    const faltas = toUpdate.map((e) => e.falta);
    // `observacao === undefined` (importação de planilha, ver comentário de `ValidEntry.observacao`
    // acima) significa "não alterar a observação atual". Como este UPDATE é 1 statement só pra N
    // linhas (ver comentário acima sobre UNNEST), não dá pra simplesmente omitir a coluna linha a
    // linha como um `prisma.update` faria com um campo `undefined` — por isso um 2º array paralelo
    // `touchObservacao` diz, linha a linha, se o valor de `observacao` (convertido pra `null` só pra
    // caber no array ::text[], nunca gravado de fato quando `touch` é falso) deve ser aplicado ou
    // ignorado (CASE WHEN na query abaixo), preservando o que já estava gravado nessa linha.
    const observacoes = toUpdate.map((e) => (e.observacao === undefined ? null : e.observacao));
    const touchObservacao = toUpdate.map((e) => e.observacao !== undefined);

    await prisma.$executeRaw`
      UPDATE "TimeEntry" AS t
      SET
        "entrada" = v.entrada,
        "saidaAlmoco" = v.saida_almoco,
        "retornoAlmoco" = v.retorno_almoco,
        "saida" = v.saida,
        "horasTrabalhadas" = v.horas_trabalhadas,
        "atrasoMinutos" = v.atraso_minutos,
        "falta" = v.falta,
        "observacao" = CASE WHEN v.touch_observacao THEN v.observacao ELSE t."observacao" END
      FROM UNNEST(
        ${employeeIds}::text[], ${dates}::timestamp[], ${entradas}::text[],
        ${saidasAlmoco}::text[], ${retornosAlmoco}::text[], ${saidas}::text[],
        ${horasTrabalhadas}::float8[], ${atrasosMinutos}::int[], ${faltas}::boolean[],
        ${observacoes}::text[], ${touchObservacao}::boolean[]
      ) AS v(employee_id, date, entrada, saida_almoco, retorno_almoco, saida, horas_trabalhadas, atraso_minutos, falta, observacao, touch_observacao)
      WHERE t."employeeId" = v.employee_id AND t."date" = v.date
    `;
  }
  return validEntries.length;
}

/** Textos de Ocorrência que indicam falta não justificada — hoje o PDF de validação só trouxe "Feriado"/"Folga" (nenhum "Falta"/"Atestado"), mas o padrão fica pronto pra reconhecer se aparecer num arquivo futuro, em vez de precisar de outra alteração de código. */
const OCORRENCIA_FALTA_RE = /falta/i;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A planilha/PDF cria registros de ponto novos e atualiza os já existentes (match por
  // colaborador+data) na mesma chamada — trata como canCreate por ser uma importação em massa,
  // mesmo padrão usado em financeiro/conciliacao/import.
  if (!(await hasModulePermission(session.user.id, "rh", "canCreate"))) {
    return NextResponse.json(
      { error: "Seu perfil de permissão não permite importar registros de ponto." },
      { status: 403 }
    );
  }

  const empresa = await requireActiveSingleEmpresa();
  if (!empresa) {
    return NextResponse.json(
      { error: "Selecione uma loja específica (não é possível importar no modo Grupo Nord)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const fixedEmployeeId = (formData.get("employeeId") as string | null) || null;
  if (!file) return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const isPdf = /\.pdf$/i.test(file.name);

  if (isPdf) {
    return importFromTecnopontoPdf(buffer, empresa.id, fixedEmployeeId);
  }

  const isSpreadsheet = /\.xlsx$/i.test(file.name);

  let rows: (string | number)[][];
  if (isSpreadsheet) {
    rows = await readWorkbookRows(buffer);
  } else {
    rows = rowsFromCsvText(buffer.toString("utf-8"));
  }

  if (rows.length < 2) {
    return NextResponse.json({ error: "Arquivo vazio ou sem linhas de dados." }, { status: 400 });
  }

  const headerRow = rows[0].map((h) => normalizeHeader(String(h)));
  const columnMap: Record<string, number> = {};
  headerRow.forEach((h, idx) => {
    const mapped = HEADER_ALIASES[h];
    if (mapped) columnMap[mapped] = idx;
  });

  if (columnMap.data === undefined || columnMap.entrada === undefined) {
    return NextResponse.json(
      { error: "Cabeçalho inválido. Esperado: colaborador (opcional), data, entrada, saida_almoco, retorno_almoco, saida." },
      { status: 400 }
    );
  }

  const employees = await prisma.employee.findMany({ where: { empresaId: empresa.id } });
  const byName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e]));

  const errors: string[] = [];
  const validEntries: ValidEntry[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c).trim() === "")) continue;

    const get = (key: string) => (columnMap[key] !== undefined ? String(row[columnMap[key]] ?? "").trim() : "");
    // Preserva o tipo original da célula (number vs string) para os campos de horário — ver
    // parseTimeFlexible. Horários sempre por getRaw(), nunca get(): uma célula nativa do Excel
    // chega aqui como number (fração do dia), e get() já converteria isso pra string ANTES de
    // chegar em parseTimeFlexible, corrompendo o horário (mesmo padrão de
    // crm/clientes/import/route.ts para datas).
    const getRaw = (key: string): string | number =>
      columnMap[key] !== undefined ? (row[columnMap[key]] ?? "") : "";

    let employeeId = fixedEmployeeId;
    if (columnMap.colaborador !== undefined) {
      const nome = get("colaborador");
      const match = byName.get(nome.toLowerCase());
      if (!match) {
        errors.push(`Linha ${i + 1}: colaborador "${nome}" não encontrado.`);
        continue;
      }
      employeeId = match.id;
    }
    if (!employeeId) {
      errors.push(`Linha ${i + 1}: colaborador não informado.`);
      continue;
    }

    const rawDate = columnMap.data !== undefined ? row[columnMap.data] : "";
    const dateKey = parseDateKeyFlexible(rawDate);
    if (!dateKey) {
      errors.push(`Linha ${i + 1}: data inválida ("${rawDate}").`);
      continue;
    }
    const date = spStartOfDay(dateKey);

    const entrada = parseTimeFlexible(getRaw("entrada"));
    const saidaAlmoco = parseTimeFlexible(getRaw("saidaAlmoco"));
    const retornoAlmoco = parseTimeFlexible(getRaw("retornoAlmoco"));
    const saida = parseTimeFlexible(getRaw("saida"));

    const horasTrabalhadas = computeHorasTrabalhadas({ entrada, saidaAlmoco, retornoAlmoco, saida });

    let atrasoMinutos = 0;
    const atrasoRaw = get("atraso");
    if (atrasoRaw) {
      atrasoMinutos = Number(atrasoRaw) || 0;
    } else if (entrada) {
      const padrao = timeToMinutes("08:00") ?? 0;
      const real = timeToMinutes(entrada);
      if (real !== null && real > padrao) atrasoMinutos = real - padrao;
    }

    validEntries.push({
      employeeId,
      date,
      entrada,
      saidaAlmoco,
      retornoAlmoco,
      saida,
      horasTrabalhadas,
      atrasoMinutos,
      falta: !entrada,
      // `undefined`, não `null`: a planilha não tem coluna de observação, então reimportar um
      // período já importado (ex. por PDF, que preenche este campo com a Ocorrência do dia) não
      // deve apagar a observação existente — ver comentário de `ValidEntry.observacao` acima e
      // `upsertTimeEntries` (achado do Teulis na revisão da importação de PDF).
      observacao: undefined,
    });
  }

  const imported = await upsertTimeEntries(empresa.id, validEntries);
  return NextResponse.json({ imported, errors });
}

/**
 * Importação do "Relatório Espelho Ponto" (Tecnoponto) em PDF — formato completamente diferente da
 * planilha (ver `src/lib/ponto-pdf-import.ts` pro parsing em si: 1 página por colaborador, 1 linha
 * por DIA DO MÊS, coluna "Marcações" com de 0 a N horários sem rótulo). Esta função cuida só da
 * parte "de negócio" (casar colaborador do PDF com `Employee` da loja ativa, decidir o que vira
 * `TimeEntry`, nunca deixar colaborador/marcação cair em silêncio) — o parsing bruto do PDF fica na
 * lib, sem depender de Prisma/sessão.
 */
async function importFromTecnopontoPdf(buffer: Buffer, empresaId: string, fixedEmployeeId: string | null) {
  let parsed: Awaited<ReturnType<typeof parseTecnopontoPdf>>;
  try {
    parsed = await parseTecnopontoPdf(buffer);
  } catch (e) {
    // Loga o erro real (ex. PDF corrompido, protegido por senha, ou um layout inesperado que o
    // pdfjs-dist não consegue nem abrir) — a resposta pro usuário fica só com a mensagem genérica
    // abaixo, mas sem isso aqui um problema de parsing ficaria impossível de diagnosticar depois.
    console.error("Falha ao processar PDF do Relatório Espelho Ponto (Tecnoponto):", e);
    return NextResponse.json(
      {
        error:
          'Não consegui ler este PDF. Confirme que é um "Relatório Espelho Ponto" do Tecnoponto (não uma imagem/scan) e que o arquivo não está corrompido.',
      },
      { status: 400 }
    );
  }

  if (parsed.colaboradores.length === 0) {
    return NextResponse.json({ imported: 0, errors: parsed.avisos }, { status: 400 });
  }

  let fixedEmployee: { id: string; name: string } | null = null;
  if (fixedEmployeeId) {
    const emp = await prisma.employee.findUnique({ where: { id: fixedEmployeeId }, select: { id: true, name: true, empresaId: true } });
    if (!emp || emp.empresaId !== empresaId) {
      return NextResponse.json({ error: "Colaborador inválido para a loja ativa." }, { status: 400 });
    }
    fixedEmployee = emp;
  }

  const employees = await prisma.employee.findMany({ where: { empresaId } });
  const byCpf = new Map(employees.filter((e) => e.cpf).map((e) => [onlyDigits(e.cpf!), e]));
  const byName = new Map(employees.map((e) => [e.name.trim().toLowerCase(), e]));

  const errors: string[] = [...parsed.avisos];
  const validEntries: ValidEntry[] = [];

  let casadosPorCpf = 0;
  let casadosPorNome = 0;
  const semMatch: typeof parsed.colaboradores = [];
  let foraDoEscopo = 0;
  // Achado do Teulis na revisão da task de importação de PDF (teste adversarial): sem este Set, um
  // 2º colaborador do PDF podia casar (por CPF OU por nome) com o mesmo `employee.id` já usado por
  // um colaborador ANTERIOR do mesmo arquivo — plausível com homônimos ou CPF não cadastrado (ex.:
  // o CPF do colaborador A bate com o Employee de A, mas o NOME do colaborador B, sem CPF
  // cadastrado, também bate com esse mesmo Employee de A) — e os dois conjuntos de dias ficavam
  // misturados nas mesmas linhas de `TimeEntry` desse Employee, sem erro nenhum (HTTP 200). Cada
  // `employee.id` só pode ser consumido por 1 colaborador do PDF por importação; o 2º que colidir
  // é tratado como "sem correspondência utilizável" (mesmo efeito prático: nenhum dia importado
  // para ele) e reportado separadamente no resumo, nunca em silêncio.
  const employeeIdsUsados = new Set<string>();
  const colisoes: string[] = [];

  for (const colaborador of parsed.colaboradores) {
    let employee = colaborador.cpfDigits ? byCpf.get(colaborador.cpfDigits) : undefined;
    const matchedBy: "cpf" | "nome" | null = employee ? "cpf" : null;
    if (!employee) {
      employee = byName.get(colaborador.nome.trim().toLowerCase());
    }
    if (!employee) {
      semMatch.push(colaborador);
      continue;
    }
    if (employeeIdsUsados.has(employee.id)) {
      colisoes.push(
        `Colaborador "${colaborador.nome}"${colaborador.cpfDigits ? ` (CPF ${colaborador.cpfDigits})` : ""} do PDF casaria com "${employee.name}", mas esse colaborador já havia casado com outra pessoa deste mesmo PDF antes — nenhum dia importado para ele, pra não misturar os dois nos mesmos registros.`
      );
      continue;
    }
    employeeIdsUsados.add(employee.id);
    if (matchedBy === "cpf") casadosPorCpf++;
    else casadosPorNome++;

    // Tela de perfil individual (fixedEmployeeId): o PDF pode trazer a loja inteira, mas só
    // importa os dias do colaborador desta tela — os demais são contados e avisados (nunca
    // importados em silêncio num colaborador errado, nem descartados sem explicação).
    if (fixedEmployeeId && employee.id !== fixedEmployeeId) {
      foraDoEscopo++;
      continue;
    }

    for (const dia of colaborador.dias) {
      // Dia sem NENHUM dado (sem marcação e sem Ocorrência) — ex. folga semanal que o próprio
      // Tecnoponto não sinaliza com "Folga" nem bate ponto nenhum. Não cria TimeEntry: mesmo
      // espírito da planilha (que só tem linha pros dias que importam), e evita marcar toda folga
      // semanal da equipe como "Falta" só porque o PDF lista todo dia do mês, inclusive os sem
      // expediente.
      if (dia.tokens.length === 0 && !dia.ocorrencia) continue;

      const { entrada, saidaAlmoco, retornoAlmoco, saida, stray } = mapMarcacoes(dia.tokens);
      const horasTrabalhadas = computeHorasTrabalhadas({ entrada, saidaAlmoco, retornoAlmoco, saida });
      // Só conta como falta um dia SEM nenhuma marcação cuja Ocorrência diga isso explicitamente
      // (ex. um "Falta" que venha a aparecer num arquivo futuro) — ter QUALQUER marcação no dia já
      // descarta falta, e "Feriado"/"Folga" (os únicos valores vistos no arquivo de validação) são
      // ausência JUSTIFICADA, não falta.
      const falta = dia.tokens.length === 0 && !!dia.ocorrencia && OCORRENCIA_FALTA_RE.test(dia.ocorrencia);

      const notas: string[] = [];
      if (dia.ocorrencia) notas.push(dia.ocorrencia);
      if (stray.length > 0) {
        notas.push(`Marcação(ões) do ponto não classificada(s) automaticamente: ${stray.join(", ")}`);
      }

      validEntries.push({
        employeeId: employee.id,
        date: spStartOfDay(dia.dateKey),
        entrada,
        saidaAlmoco,
        retornoAlmoco,
        saida,
        horasTrabalhadas,
        // O Relatório Espelho Ponto não traz uma jornada esperada por colaborador pra comparar e
        // calcular atraso (colunas "Trab"/"Carga Horária" sempre vazias no PDF de validação) — e o
        // fallback "atraso = entrada depois das 08:00" (usado na planilha, ver mais acima) geraria
        // atraso de várias horas em praticamente todo turno vespertino/noturno desta loja (a
        // maioria dos colaboradores). Fica 0 pra todo registro vindo do PDF; calcular atraso de
        // verdade exigiria cadastrar um horário esperado por colaborador/turno, que não existe
        // hoje.
        atrasoMinutos: 0,
        falta,
        observacao: notas.length > 0 ? notas.join(" — ") : null,
      });
    }
  }

  // Ordem importa: a tela (ponto-eletronico-client.tsx) só mostra os 5 primeiros itens de
  // `errors`. O resumo agregado e o aviso de escopo (quando a tela é de um colaborador só) são
  // sempre mais importantes que a lista linha-a-linha de quem não casou — iam antes, pra nunca
  // ficarem escondidos atrás de uma lista longa de "sem correspondência" (ex.: com
  // `fixedEmployeeId`, um PDF com muitos colaboradores sem match empurraria o aviso de escopo pra
  // bem depois da 5ª posição).
  errors.push(
    `Resumo do PDF: ${parsed.colaboradores.length} colaborador(es) encontrado(s), ${casadosPorCpf} casado(s) por CPF, ${casadosPorNome} por nome, ${semMatch.length} sem correspondência${colisoes.length > 0 ? `, ${colisoes.length} ignorado(s) por colidir com outro colaborador já casado neste mesmo PDF` : ""}.`
  );
  if (fixedEmployeeId && foraDoEscopo > 0) {
    errors.push(
      `O PDF contém ${foraDoEscopo} outro(s) colaborador(es); esta tela importa só os dias de ${fixedEmployee?.name ?? "um colaborador"}, os demais foram ignorados.`
    );
  }
  if (colisoes.length > 0) {
    // Mesma lógica de ordem do comentário acima (resumo agregado sempre antes da lista
    // linha-a-linha de quem não casou): uma colisão é um alerta de integridade de dados (dois
    // colaboradores quase foram misturados num só), mais importante que a lista potencialmente
    // longa de "sem correspondência" — não pode ficar escondida depois da 5ª posição que a tela
    // efetivamente mostra.
    errors.push(...colisoes.slice(0, 20));
    if (colisoes.length > 20) errors.push(`... e mais ${colisoes.length - 20} colisão(ões) de colaborador ignorada(s).`);
  }
  if (semMatch.length > 0) {
    errors.push(
      ...semMatch
        .slice(0, 20)
        .map(
          (c) =>
            `Colaborador "${c.nome}"${c.cpfDigits ? ` (CPF ${c.cpfDigits})` : ""} do PDF não corresponde a nenhum colaborador cadastrado nesta loja — nenhum dia importado para ele.`
        )
    );
    if (semMatch.length > 20) errors.push(`... e mais ${semMatch.length - 20} colaborador(es) sem correspondência.`);
  }

  const imported = await upsertTimeEntries(empresaId, validEntries);
  return NextResponse.json({ imported, errors });
}
