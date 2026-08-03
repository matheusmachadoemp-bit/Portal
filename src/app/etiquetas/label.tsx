export type Etiqueta = {
  pedido: string;
  cliente: string;
  totalPacotes: number;
  pacoteAtual: number;
  observacoes: string;
};

function obsLinhas(observacoes: string): string[] {
  return observacoes
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function tamanhoCliente(nome: string): string {
  if (nome.length <= 14) return "tam-normal";
  if (nome.length <= 24) return "tam-media";
  return "tam-pequena";
}

function tamanhoPedido(pedido: string): string {
  if (pedido.length <= 3) return "tam-3";
  if (pedido.length === 4) return "tam-4";
  return "tam-5";
}

export function Label({ pedido, cliente, totalPacotes, pacoteAtual, observacoes }: Etiqueta) {
  const linhas = obsLinhas(observacoes);

  return (
    <div className="etq-label">
      <div className="etq-label-left">
        <span className="etq-entregar">Entregar</span>
        <span className={`etq-pedido ${tamanhoPedido(pedido)}`}>{pedido}</span>
        <span className="etq-volume">
          {pacoteAtual} / {totalPacotes}
        </span>
      </div>
      <div className="etq-label-right">
        <span className={`etq-cliente ${tamanhoCliente(cliente)}`}>{cliente}</span>
        {linhas.length > 0 && (
          <div className="etq-obs">
            {linhas.map((linha, i) => (
              <div className="etq-obs-linha" key={i}>
                {i === 0 ? linha : `- ${linha}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
