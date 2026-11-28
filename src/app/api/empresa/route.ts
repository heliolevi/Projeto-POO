import { getEmpresaPublica } from "@/modules/catalogo";

export const dynamic = "force-dynamic";

export function GET() {
  return getEmpresaPublica();
}
