import { getMe } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getMe(request);
}
