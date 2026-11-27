import { postWebhookDePagamento } from "@/modules/pagamentos";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postWebhookDePagamento(request);
}
