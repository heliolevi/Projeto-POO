import { postAceitarTermos } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postAceitarTermos(request);
}
