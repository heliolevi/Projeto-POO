import { getReservas, postReservas } from "@/modules/reservas";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return getReservas(request);
}

export function POST(request: Request) {
  return postReservas(request);
}
