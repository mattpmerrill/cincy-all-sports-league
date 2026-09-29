import { ImageResponse } from "next/og";

export const alt = "Cincy's All-Sports League: live standings for 20 teams across 11 sports";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        color: "#f2f5fb",
        background: "linear-gradient(135deg, #0b0f1a 55%, #1d2b12)",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          background: "#c6ff3d",
          color: "#0b0f1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 72,
          fontWeight: 800,
        }}
      >
        C
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1, textTransform: "uppercase" }}>
          Cincy&apos;s All-Sports League
        </div>
        <div style={{ marginTop: 28, fontSize: 40, color: "#8b96b3" }}>
          20 teams. 11 sports. One leaderboard.
        </div>
      </div>
    </div>,
    size,
  );
}
