import { ImageResponse } from "next/og";
import { BikeIconOg } from "@/shared/ui/icon-og";

const size = { width: 512, height: 512 };

export function GET() {
  return new ImageResponse(<BikeIconOg background="#005F49" padding={86} />, size);
}
