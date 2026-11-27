import { Resposta } from "@/shared/http/resposta";

export function GET() {
  return Resposta.ok({ status: "ok" });
}
