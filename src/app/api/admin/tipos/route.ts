import { getAdminTipos, postAdminTipos } from "@/modules/catalogo";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getAdminTipos(request);
}

export function POST(request: Request) {
  return postAdminTipos(request);
}
