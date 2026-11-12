import { getReserva } from "@/modules/reservas";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: RouteContext<"/api/reservas/[id]">) {
  const { id } = await ctx.params;
  return getReserva(request, id);
}
