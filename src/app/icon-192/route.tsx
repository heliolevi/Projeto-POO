import { ImageResponse } from "next/og";
import { BikeIconOg } from "@/shared/ui/icon-og";

const size = { width: 192, height: 192 };

export function GET() {
  return new ImageResponse(<BikeIconOg background="#005F49" padding={32} />, size);
}
