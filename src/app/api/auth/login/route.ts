import { postLogin } from "@/modules/contas";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return postLogin(request);
}
