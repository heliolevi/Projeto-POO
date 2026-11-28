import { ImageResponse } from "next/og";
import { BikeIconOg } from "@/shared/ui/icon-og";

const size = { width: 512, height: 512 };

// mais respiro nas bordas: ícones maskable são recortados pelo SO (círculo, squircle etc.)
export function GET() {
  return new ImageResponse(<BikeIconOg background="#005F49" padding={128} />, size);
}
