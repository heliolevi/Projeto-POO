import { getRecomendacao } from "@/modules/recomendacao";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getRecomendacao(request);
}
