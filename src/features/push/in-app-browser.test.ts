import { describe, expect, it } from "vitest";
import { isIosInAppBrowser } from "./in-app-browser";

const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15";

describe("isIosInAppBrowser", () => {
  it.each([
    ["Safari", `${IOS} (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1`, false],
    ["Chrome for iOS", `${IOS} (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1`, false],
    ["Instagram", `${IOS} (KHTML, like Gecko) Mobile/15E148 Instagram 320.0`, true],
    ["Facebook", `${IOS} (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]`, true],
    ["a bare web view with no Safari token", `${IOS} (KHTML, like Gecko) Mobile/15E148`, true],
    [
      "Facebook even when it adds a Safari token",
      `${IOS} (KHTML, like Gecko) Mobile/15E148 Safari/604.1 [FBAV/450.0]`,
      true,
    ],
  ])("%s", (_name, userAgent, expected) => {
    expect(isIosInAppBrowser(userAgent)).toBe(expected);
  });

  it("is false off iOS, where the Home Screen steps do not apply", () => {
    expect(isIosInAppBrowser("Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Instagram 320.0")).toBe(
      false,
    );
  });
});
