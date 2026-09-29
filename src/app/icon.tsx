import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Generated images render outside the CSS pipeline, so the brand values are repeated here.
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0b",
      }}
    >
      <div
        style={{
          width: 400,
          height: 400,
          borderRadius: 96,
          background: "#c6011f",
          color: "#ffffff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 300,
          fontWeight: 800,
          letterSpacing: -12,
        }}
      >
        C
      </div>
    </div>,
    size,
  );
}
