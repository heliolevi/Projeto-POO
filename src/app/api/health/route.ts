import { ok } from "@/shared/http/response";

export function GET() {
  return ok({ status: "ok" });
}
