import { ImageResponse } from "next/og";
import { BikeIconOg } from "@/shared/ui/icon-og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BikeIconOg background="#005F49" padding={24} />, size);
}
