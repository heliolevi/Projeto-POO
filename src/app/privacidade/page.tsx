import type { Metadata } from "next";
import { DocumentosDoRepositorio } from "@/shared/markdown/ler-documento";
import { Documento } from "@/shared/ui/Documento";
import { SiteLayout } from "@/shared/ui/SiteLayout";

export const metadata: Metadata = { title: "Política de privacidade | Bike Ilha Club" };

export default function PrivacidadePage() {
  return (
    <SiteLayout>
      <Documento markdown={DocumentosDoRepositorio.ler("politica-de-privacidade.md")} />
    </SiteLayout>
  );
}
