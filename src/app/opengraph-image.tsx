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
        color: "#f5f5f6",
        background: "linear-gradient(135deg, #0a0a0b 55%, #2a0a10)",
      }}
    >
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 24,
          background: "#c6011f",
          color: "#ffffff",
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
        <div style={{ marginTop: 28, fontSize: 40, color: "#9a9aa2" }}>
          20 teams. 11 sports. One leaderboard.
        </div>
      </div>
    </div>,
    size,
  );
}
