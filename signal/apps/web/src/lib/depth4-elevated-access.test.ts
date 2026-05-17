import { afterEach, describe, expect, it } from "vitest";
import { depth4AdminEmails, depth4OperatorUserIds, isDepth4ElevatedUser } from "./depth4-elevated-access";

describe("depth4-elevated-access", () => {
  const env = process.env;

  afterEach(() => {
    process.env = env;
  });

  it("recognizes operator user id", () => {
    process.env.NEXT_PUBLIC_DEPTH4_OPERATOR_USER_IDS = "op-abc,op-def";
    expect(depth4OperatorUserIds()).toEqual(["op-abc", "op-def"]);
    expect(isDepth4ElevatedUser({ userId: "op-abc" })).toBe(true);
    expect(isDepth4ElevatedUser({ userId: "random" })).toBe(false);
  });

  it("recognizes admin email", () => {
    process.env.NEXT_PUBLIC_DEPTH4_ADMIN_EMAILS = "Admin@DEPTH4.com";
    expect(depth4AdminEmails()).toEqual(["admin@depth4.com"]);
    expect(isDepth4ElevatedUser({ email: "admin@depth4.com" })).toBe(true);
    expect(isDepth4ElevatedUser({ email: "user@example.com" })).toBe(false);
  });
});
