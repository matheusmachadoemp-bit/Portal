import type { Metadata } from "next";
import { EtiquetasClient } from "./etiquetas-client";

export const metadata: Metadata = {
  title: "Etiquetas de Entrega | Nord Pizza Burger",
  description: "Geração e impressão de etiquetas de identificação de pedidos do delivery.",
};

export default function EtiquetasPage() {
  return <EtiquetasClient />;
}
