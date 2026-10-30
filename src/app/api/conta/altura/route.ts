import { postAtualizarAltura } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postAtualizarAltura(request);
}
