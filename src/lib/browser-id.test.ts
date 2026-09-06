import { describe, expect, it, vi } from "vitest";
import { createBrowserId } from "./browser-id";

describe("browser IDs", () => {
  it("uses a valid UUID fallback before crypto.randomUUID was available", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0x11);
        return bytes;
      },
    });
    try {
      expect(createBrowserId()).toBe("11111111-1111-4111-9111-111111111111");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
