import { describe, expect, it } from "vitest";

import { toggleSelectedGroupId } from "./conversation-selection.js";

describe("toggleSelectedGroupId", () => {
  it("closes the drawer when the same group is selected again", () => {
    expect(toggleSelectedGroupId("codex|abc", "codex|abc")).toBeNull();
  });

  it("switches the selection to a different group", () => {
    expect(toggleSelectedGroupId("codex|abc", "claude|xyz")).toBe("claude|xyz");
  });
});
