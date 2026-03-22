import { afterEach, describe, expect, it, vi } from "vitest";

const originalJwtSecret = process.env.JWT_SECRET;

afterEach(() => {
  vi.resetModules();

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
    return;
  }

  process.env.JWT_SECRET = originalJwtSecret;
});

describe("config", () => {
  it("requires JWT_SECRET to be set", async () => {
    delete process.env.JWT_SECRET;
    vi.resetModules();

    await expect(import("../src/config")).rejects.toThrow("JWT_SECRET is required");
  });

  it("rejects the documented example JWT secret", async () => {
    process.env.JWT_SECRET = "change-me-booklite";
    vi.resetModules();

    await expect(import("../src/config")).rejects.toThrow(
      "JWT_SECRET must be changed from the default/example value"
    );
  });

  it("accepts a non-default JWT secret", async () => {
    process.env.JWT_SECRET = "test-secret-that-is-not-the-default";
    vi.resetModules();

    const { config } = await import("../src/config");
    expect(config.jwtSecret).toBe("test-secret-that-is-not-the-default");
  });
});
