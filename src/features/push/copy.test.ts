import { describe, expect, it } from "vitest";
import { PUSH_TOPICS } from "@/domain/push";
import { TOPIC_COPY } from "./copy";

describe("TOPIC_COPY", () => {
  it("has plain copy for every topic, with no em-dashes", () => {
    for (const topic of PUSH_TOPICS) {
      const { label, description } = TOPIC_COPY[topic];
      expect(label.length).toBeGreaterThan(0);
      expect(description.length).toBeGreaterThan(0);
      expect(`${label} ${description}`).not.toMatch(/[–—]/);
    }
  });
});
