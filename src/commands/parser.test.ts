import { describe, it, expect } from "vitest";
import { parse, pathArgument, safeText, completion } from "./parser";
describe("terminal trust boundary", () => {
  it("normalizes commands while preserving code and paths", () => {
    expect(parse("  ask  Why is fooBar undefined? ")).toEqual({
      name: "QUERY",
      args: "Why is fooBar undefined?",
    });
    expect(pathArgument('"C:\\My Files\\a.ts"')).toBe("C:\\My Files\\a.ts");
  });
  it("rejects terminal control sequences from tools and model output", () => {
    expect(safeText("\x1b[2Jhello\x1b]52;c;c2VjcmV0\x07\r\nworld\x00")).toBe(
      "hello\nworld",
    );
  });
  it("completes allowlisted command names", () => {
    expect(completion("di")).toEqual(["DIAGNOSTICS", "DISKS", "DIRECTIVE"]);
  });
});
