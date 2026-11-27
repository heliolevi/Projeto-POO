import type { Metadata } from "next";
import { DocumentosDoRepositorio } from "@/shared/markdown/ler-documento";
import { Documento } from "@/shared/ui/Documento";
import { SiteLayout } from "@/shared/ui/SiteLayout";

export const metadata: Metadata = { title: "Termos de uso | Bike Ilha Club" };

export default function TermosPage() {
  return (
    <SiteLayout>
      <Documento markdown={DocumentosDoRepositorio.ler("termos-de-uso.md")} />
    </SiteLayout>
  );
}
