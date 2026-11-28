import { patchAdminBicicleta } from "@/modules/catalogo";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/bicicletas/[id]">) {
  const { id } = await ctx.params;
  return patchAdminBicicleta(request, id);
}
