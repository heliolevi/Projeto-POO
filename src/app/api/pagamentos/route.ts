import { postPagamentos } from "@/modules/pagamentos";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postPagamentos(request);
}
