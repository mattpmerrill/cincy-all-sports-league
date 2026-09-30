import { describe, expect, it } from "vitest";
import { deviceLabel } from "./device-label";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ defaults to the desktop site and sends a Mac user agent.
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  linux: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

describe("deviceLabel", () => {
  it("names the device from the user agent", () => {
    expect(deviceLabel(UA.iphone)).toBe("iPhone");
    expect(deviceLabel(UA.ipad)).toBe("iPad");
    expect(deviceLabel(UA.android)).toBe("Android");
    expect(deviceLabel(UA.windows)).toBe("Windows PC");
    expect(deviceLabel(UA.linux)).toBe("Linux");
  });

  it("labels an iPad in desktop mode as a Mac, since the user agent cannot tell them apart", () => {
    expect(deviceLabel(UA.ipadDesktopMode)).toBe("Mac");
  });

  it("falls back to Device and never echoes the user agent", () => {
    expect(deviceLabel(null)).toBe("Device");
    expect(deviceLabel("curl/8.4.0")).toBe("Device");
  });
});
