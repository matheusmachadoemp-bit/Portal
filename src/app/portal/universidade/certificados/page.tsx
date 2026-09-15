import { redirect } from "next/navigation";

// A subcategoria "Certificados" foi absorvida por "Colaboradores" (ver
// migração 20260915150000_remove_certificados_subcategoria_universidade e
// src/app/portal/universidade/colaboradores/page.tsx, que agora tem uma
// seção "Certificados emitidos"). Esta rota continua existindo só para não
// quebrar links/favoritos antigos.
export default function CertificadosRedirectPage() {
  redirect("/portal/universidade/colaboradores");
}
