import { postDesativar } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postDesativar(request);
}
