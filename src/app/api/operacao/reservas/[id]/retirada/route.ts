import { postRetirada } from "@/modules/operacao";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/operacao/reservas/[id]/retirada">) {
  const { id } = await ctx.params;
  return postRetirada(request, id);
}
