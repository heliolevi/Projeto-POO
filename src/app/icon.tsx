import { ImageResponse } from "next/og";
import { BikeIconOg } from "@/shared/ui/icon-og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<BikeIconOg background="#005F49" padding={3} />, size);
}
