import { describe, expect, it } from "vitest";

import { getFirstTextContent, getToolCall, summarizeToolInput } from "./record-formatting.js";

describe("record formatting helpers", () => {
  it("extracts text from common message block formats", () => {
    expect(getFirstTextContent([{ type: "output_text", text: "hello" }])).toBe("hello");
    expect(getFirstTextContent([{ type: "input_text", text: "<environment_context>skip" }, { type: "text", text: "use me" }])).toBe("use me");
  });

  it("formats common tool inputs without dumping raw JSON first", () => {
    expect(summarizeToolInput({ command: "npm test" })).toBe("npm test");
    expect(summarizeToolInput({ file_path: "/tmp/readme.md" })).toBe("/tmp/readme.md");
    expect(summarizeToolInput({ pattern: "needle" })).toBe("needle");
  });

  it("finds tool calls across Anthropic and OpenAI-ish shapes", () => {
    expect(getToolCall({ type: "tool_use", name: "Bash", input: { command: "npm test" } })).toEqual({
      name: "Bash",
      detail: "npm test"
    });
    expect(getToolCall({ type: "function_call", name: "exec", arguments: { cmd: "ls" } })).toEqual({
      name: "exec",
      detail: "ls"
    });
  });
});
