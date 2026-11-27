import { getStatusDoPagamento } from "@/modules/pagamentos";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/pagamentos/[reservaId]/status">) {
  const { reservaId } = await ctx.params;
  return getStatusDoPagamento(request, reservaId);
}
