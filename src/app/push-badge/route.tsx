import { ImageResponse } from "next/og";

const SIZE = 96;

// The image never varies, so render it once at build time instead of on every notification.
export const dynamic = "force-static";

/**
 * The Android status-bar badge. The OS keeps only the alpha channel and paints it in its own
 * color, so this is a white "C" on a transparent background; any color would be thrown away.
 * Generated images render outside the CSS pipeline, so the value is a literal here.
 */
export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontSize: 84,
        fontWeight: 800,
      }}
    >
      C
    </div>,
    { width: SIZE, height: SIZE },
  );
}
