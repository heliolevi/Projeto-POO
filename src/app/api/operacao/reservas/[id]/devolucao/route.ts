import { postDevolucao } from "@/modules/operacao";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/operacao/reservas/[id]/devolucao">) {
  const { id } = await ctx.params;
  return postDevolucao(request, id);
}
