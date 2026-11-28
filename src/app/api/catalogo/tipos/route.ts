import { getTiposPublicos } from "@/modules/catalogo";

export const dynamic = "force-dynamic";

export function GET() {
  return getTiposPublicos();
}
