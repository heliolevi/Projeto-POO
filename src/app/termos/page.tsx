import type { Metadata } from "next";
import { lerDocumento } from "@/shared/markdown/ler-documento";
import { Documento } from "@/shared/ui/Documento";
import { SiteLayout } from "@/shared/ui/SiteLayout";

export const metadata: Metadata = { title: "Termos de uso | Bike Ilha Club" };

export default function TermosPage() {
  return (
    <SiteLayout>
      <Documento markdown={lerDocumento("termos-de-uso.md")} />
    </SiteLayout>
  );
}
