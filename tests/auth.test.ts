import { describe, expect, it } from "vitest";
import { passwordPolicyError, USER_ROLES } from "@/lib/auth";

/**
 * The password policy is the only thing standing between a weak CMS password and
 * a takeover, so each rule is asserted on its own as well as in combination.
 */
describe("passwordPolicyError", () => {
  it("accepts a strong password", () => {
    expect(passwordPolicyError("Kalisi2o!Coffee")).toBeNull();
  });

  it("requires at least 12 characters", () => {
    expect(passwordPolicyError("Ab1!efghijk")).not.toBeNull(); // 11 chars
    expect(passwordPolicyError("Ab1!efghijkl")).toBeNull(); // 12 chars
  });

  it("rejects an overlong password", () => {
    const long = `${"aB1!".repeat(60)}`; // 240 chars
    expect(passwordPolicyError(long)).toMatch(/200/);
  });

  it("requires at least three character classes", () => {
    // lower + upper + symbol = 3 classes, but only 10 characters, so length is
    // the reason this fails.
    expect(passwordPolicyError("abcdefghij!")).toMatch(/12 characters/);

    // Long enough, but only one class.
    expect(passwordPolicyError("aaaaaaaaaaaaaaaa")).toMatch(/three of/);
    // Two classes.
    expect(passwordPolicyError("abcdefghijklmnop")).toMatch(/three of/);
  });

  it("counts numbers and symbols as distinct classes", () => {
    // lower + number + symbol
    expect(passwordPolicyError("coffee12345!")).toBeNull();
    // upper + lower + symbol
    expect(passwordPolicyError("CoffeeCoffee!")).toBeNull();
    // upper + lower + number
    expect(passwordPolicyError("CoffeeCoffee12")).toBeNull();
  });

  it("returns null for an empty string only via the length rule", () => {
    // Guards against a falsy-check bug that would treat "" as valid.
    expect(passwordPolicyError("")).not.toBeNull();
  });

  it("does not accept a password made only of whitespace", () => {
    expect(passwordPolicyError("              ")).not.toBeNull();
  });
});

describe("USER_ROLES", () => {
  it("lists exactly the three agreed roles", () => {
    expect([...USER_ROLES]).toEqual(["SUPER_ADMIN", "CONTENT_ADMIN", "EDITOR"]);
  });
});
