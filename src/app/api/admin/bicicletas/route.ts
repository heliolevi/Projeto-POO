import { getAdminBicicletas, postAdminBicicletas } from "@/modules/catalogo";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getAdminBicicletas(request);
}

export function POST(request: Request) {
  return postAdminBicicletas(request);
}
