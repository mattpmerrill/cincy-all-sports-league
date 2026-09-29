import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#c6011f",
        color: "#ffffff",
        fontSize: 130,
        fontWeight: 800,
      }}
    >
      C
    </div>,
    size,
  );
}
