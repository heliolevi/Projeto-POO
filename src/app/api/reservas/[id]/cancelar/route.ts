import { postCancelarReserva } from "@/modules/reservas";

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: RouteContext<"/api/reservas/[id]/cancelar">) {
  const { id } = await ctx.params;
  return postCancelarReserva(request, id);
}
