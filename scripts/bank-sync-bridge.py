#!/usr/bin/env python3
"""Ponte entre a conexão com o banco (Open Finance) e a Conciliação Bancária do portal.

Quem roda isto é a rotina agendada do Claude (que tem o conector do banco): ela busca os
lançamentos no banco (ferramenta openfinance_list_transactions), o resultado grande fica salvo em
arquivo, e este script converte e envia ao portal (POST /api/financeiro/conciliacao/sync).
Só usa a biblioteca padrão do Python.

Variáveis de ambiente:
  BANK_SYNC_SECRET      senha de integração (a mesma do portal). Nunca é impressa.
  BANK_SYNC_URL         endereço do portal (padrão: https://www.portalnord.com.br)
  BANK_ACCOUNT_ID       id da conta no banco (o mesmo cadastrado em Caixa da Empresa > Editar conta)

Comandos:
  state                       mostra o que o portal já tem desta conta
  plan [--since AAAA-MM-DD]   diz quais períodos buscar (histórico completo na 1ª vez; depois só o recente)
  post ARQUIVO [--balance N] [--window-complete --from AAAA-MM-DD --to AAAA-MM-DD]
                              converte e envia o resultado salvo da ferramenta. `--from/--to` é o período
                              que foi pedido ao banco; com `--window-complete` o portal remove os
                              "não compensados" daquele período que o banco deixou de listar.
  post ARQUIVO --dry-run      só converte e mostra estatísticas (não envia nada)

Código de saída: 0 = tudo certo; 1 = erro de uso/arquivo; 2 = o portal recusou ou não respondeu;
3 = enviado, mas com lançamentos inválidos ou duplicatas/pendências que pedem revisão (ver o JSON).
"""
import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

DEFAULT_URL = "https://www.portalnord.com.br"
SYNC_PATH = "/api/financeiro/conciliacao/sync"
CHUNK = 1500  # o portal aceita até 2000 por envio
LOOKBACK_DAYS = 7  # quanto antes do lançamento mais recente buscar de novo (pendente que compensou, atraso do banco)
SP = timezone(timedelta(hours=-3))  # São Paulo (sem horário de verão desde 2019)


def fail(msg, code=1):
    print(json.dumps({"ok": False, "erro": msg}, ensure_ascii=False))
    sys.exit(code)


def cfg():
    secret = os.environ.get("BANK_SYNC_SECRET", "").strip()
    account = os.environ.get("BANK_ACCOUNT_ID", "").strip()
    url = (os.environ.get("BANK_SYNC_URL") or DEFAULT_URL).rstrip("/")
    if not secret:
        fail("BANK_SYNC_SECRET não está definido neste ambiente.")
    if not account:
        fail("BANK_ACCOUNT_ID não está definido neste ambiente.")
    return url, secret, account


def _same_site(a, b):
    """Só segue redirecionamento dentro do mesmo site (com ou sem "www."): a senha nunca vai para outro domínio."""
    ha = (urllib.parse.urlparse(a).hostname or "").lower()
    hb = (urllib.parse.urlparse(b).hostname or "").lower()
    strip = lambda h: h[4:] if h.startswith("www.") else h
    return urllib.parse.urlparse(b).scheme == "https" and strip(ha) == strip(hb)


def http(method, url, secret, body=None, _hops=0, _busy=0):
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + secret)
    if data is not None:
        req.add_header("Content-Type", "application/json")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *a, **k):  # trata o redirecionamento à mão (urllib troca POST por GET e perde o corpo)
            return None

    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308) and e.headers.get("Location") and _hops < 3:
            target = urllib.parse.urljoin(url, e.headers["Location"])
            if not _same_site(url, target):
                fail("O portal redirecionou para outro endereço (%s). Por segurança, nada foi enviado." % target)
            return http(method, target, secret, body, _hops + 1, _busy)
        try:
            payload = json.loads(e.read().decode("utf-8") or "{}")
        except Exception:
            payload = {}
        # 409 = já há uma sincronização desta conta rodando: espera e tenta de novo.
        if e.code == 409 and _busy < 4:
            time.sleep(15 * (_busy + 1))
            return http(method, url, secret, body, _hops, _busy + 1)
        return e.code, payload
    except Exception as e:  # rede, DNS, bloqueio de domínio...
        fail("Não consegui falar com o portal (%s). Confira se o endereço está liberado no ambiente: %s" % (type(e).__name__, url), 2)


def today_sp():
    return datetime.now(SP).date()


def sp_date(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(SP).date()


def month_windows(start, end):
    """Meses inteiros de `start` até `end` (o último vai só até `end`)."""
    out, cur = [], date(start.year, start.month, 1)
    while cur <= end:
        nxt = date(cur.year + (cur.month == 12), (cur.month % 12) + 1, 1)
        out.append({"from": max(cur, start).isoformat(), "to": min(nxt - timedelta(days=1), end).isoformat()})
        cur = nxt
    return out


def cmd_state(_args):
    url, secret, account = cfg()
    status, body = http("GET", "%s%s?openFinanceAccountId=%s" % (url, SYNC_PATH, account), secret)
    print(json.dumps({"http": status, **body}, ensure_ascii=False))
    sys.exit(0 if status == 200 else 2)


def cmd_plan(args):
    url, secret, account = cfg()
    status, state = http("GET", "%s%s?openFinanceAccountId=%s" % (url, SYNC_PATH, account), secret)
    if status != 200:
        fail("O portal respondeu %s ao consultar a conta (%s)." % (status, state.get("error", "sem detalhe")), 2)
    hoje = today_sp()
    if not state.get("transactionsFromBank"):
        since = date.fromisoformat(args.since)
        plan = {"modo": "historico", "janelas": month_windows(since, hoje), "windowComplete": False}
    else:
        newest = sp_date(state["newestTransactionAt"])
        inicio = min(newest - timedelta(days=LOOKBACK_DAYS), hoje)
        # Uma janela por mês (a ferramenta do banco corta resultados muito grandes; nunca se envia período incompleto).
        plan = {"modo": "incremental", "janelas": month_windows(inicio, hoje), "windowComplete": True}
    plan["hoje"] = hoje.isoformat()
    plan["ultimaAtualizacao"] = state.get("lastSyncAt")
    print(json.dumps(plan, ensure_ascii=False))


def to_portal(row):
    """Lançamento da ferramenta do banco -> formato do portal."""
    pd = row.get("paymentData") or {}
    tipo = row.get("type")
    contraparte = pd.get("payer") if tipo == "CREDIT" else pd.get("receiver")
    return {
        "id": row.get("id"),
        "date": row.get("date"),
        "description": row.get("description"),
        "amount": row.get("amount"),
        "type": tipo,
        "status": row.get("status"),
        "category": row.get("category"),
        "operationType": row.get("operationType") or pd.get("paymentMethod"),
        "counterpart": contraparte,
    }


def load_tool_result(path):
    try:
        raw = open(path, encoding="utf-8").read()
    except OSError as e:
        fail("Não consegui abrir o arquivo do resultado (%s): %s" % (type(e).__name__, path))
    i = raw.find("{")
    if i < 0:
        fail("O arquivo não tem JSON: %s" % path)
    try:
        data = json.loads(raw[i:])
    except ValueError:
        fail("O arquivo não é um JSON válido (resultado cortado?). Nada foi enviado: %s" % path)
    if not isinstance(data, dict):
        fail("Formato inesperado no arquivo. Nada foi enviado: %s" % path)
    # A ferramenta devolve estes campos em vez de lançar erro: nunca enviar um período incompleto.
    if data.get("error") or data.get("warning") or data.get("truncated"):
        fail("A ferramenta do banco avisou: %s. Nada foi enviado." % (data.get("error") or data.get("warning") or "resultado truncado"))
    rows = data.get("results")
    if not isinstance(rows, list):
        fail("Resposta da ferramenta sem a lista `results`. Nada foi enviado.")
    total = data.get("total")
    if isinstance(total, int) and total != len(rows):
        fail("A ferramenta declarou %s lançamentos mas trouxe %s (paginação). Nada foi enviado." % (total, len(rows)))
    if str((data.get("account") or {}).get("account_id", "")).strip() and os.environ.get("BANK_ACCOUNT_ID") and \
            data["account"]["account_id"] != os.environ["BANK_ACCOUNT_ID"].strip():
        fail("O arquivo é de outra conta do banco. Nada foi enviado.")
    return rows


def window_instants(args):
    """Período pedido ao banco -> instantes UTC (a ferramenta do banco filtra por dia UTC, inclusive nas pontas)."""
    if not (args.window_from and args.window_to):
        return None, None
    try:
        a, b = date.fromisoformat(args.window_from), date.fromisoformat(args.window_to)
    except ValueError:
        fail("--from/--to devem ser datas AAAA-MM-DD.")
    if a > b:
        fail("--from não pode ser depois de --to.")
    return a.isoformat() + "T00:00:00.000Z", b.isoformat() + "T23:59:59.999Z"


def cmd_post(args):
    rows = [to_portal(r) for r in load_tool_result(args.file)]
    stats = {"lancamentos": len(rows), "creditos": sum(1 for r in rows if r["type"] == "CREDIT"), "debitos": sum(1 for r in rows if r["type"] == "DEBIT"),
             "pendentes": sum(1 for r in rows if r["status"] == "PENDING"), "semContraparte": sum(1 for r in rows if not r["counterpart"])}
    if args.dry_run:
        print(json.dumps({"ok": True, "dryRun": True, **stats}, ensure_ascii=False))
        if args.out:
            json.dump(rows, open(args.out, "w", encoding="utf-8"), ensure_ascii=False)
        return
    if args.window_complete and not (args.window_from and args.window_to):
        fail("--window-complete exige --from e --to (o período que foi pedido ao banco).")
    janela_de, janela_ate = window_instants(args)
    url, secret, account = cfg()
    totais = {"created": 0, "adopted": 0, "merged": 0, "rekeyed": 0, "updated": 0, "unchanged": 0, "removed": 0, "invalid": 0, "matched": 0,
              "duplicatesLeft": 0, "staleKept": 0, "fileRowsUnpaired": 0}
    amostras = []
    partes = [rows[i:i + CHUNK] for i in range(0, len(rows), CHUNK)] or [[]]
    for n, parte in enumerate(partes):
        corpo = {"openFinanceAccountId": account, "transactions": parte}
        # Só a ÚLTIMA parte leva saldo e "janela completa" (a remoção de pendentes que sumiram precisa do período todo).
        if n == len(partes) - 1:
            if args.balance is not None:
                corpo["balance"] = args.balance
            if args.window_complete and len(partes) == 1:
                corpo["windowComplete"] = True
                corpo["windowFrom"], corpo["windowTo"] = janela_de, janela_ate
        status, resp = http("POST", url + SYNC_PATH, secret, corpo)
        if status != 200:
            fail("O portal recusou o envio (HTTP %s): %s" % (status, resp.get("error", "sem detalhe")), 2)
        for k in totais:
            totais[k] += int(resp.get(k) or 0)
        amostras += resp.get("invalidSamples") or []
    saida = {"ok": True, **stats, **totais}
    revisar = totais["invalid"] or totais["duplicatesLeft"] or totais["staleKept"]
    if amostras:
        saida["invalidSamples"] = amostras[:10]
    if revisar:
        saida["atencao"] = "Há itens que pedem revisão (lançamentos inválidos, duplicatas arquivo × banco ou pendentes sumidos já mexidos)."
    print(json.dumps(saida, ensure_ascii=False))
    sys.exit(3 if revisar else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("state").set_defaults(fn=cmd_state)
    p = sub.add_parser("plan"); p.add_argument("--since", default="2025-01-01"); p.set_defaults(fn=cmd_plan)
    q = sub.add_parser("post"); q.add_argument("file"); q.add_argument("--balance", type=float); q.add_argument("--window-complete", action="store_true")
    q.add_argument("--from", dest="window_from"); q.add_argument("--to", dest="window_to")
    q.add_argument("--dry-run", action="store_true"); q.add_argument("--out"); q.set_defaults(fn=cmd_post)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
