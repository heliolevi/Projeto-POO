import { putPerfilCiclista } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function PUT(request: Request) {
  return putPerfilCiclista(request);
}
