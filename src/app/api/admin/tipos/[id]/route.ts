import { putAdminTipo } from "@/modules/catalogo";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, ctx: RouteContext<"/api/admin/tipos/[id]">) {
  const { id } = await ctx.params;
  return putAdminTipo(request, id);
}
