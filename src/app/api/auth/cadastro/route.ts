import { postCadastro } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postCadastro(request);
}
