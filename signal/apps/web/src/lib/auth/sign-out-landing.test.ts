import { afterEach, describe, expect, it } from "vitest";
import { authPostSignOutUrl } from "@/lib/auth/sign-out-landing";

describe("authPostSignOutUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POST_SIGN_OUT_ORIGIN;
  });

  it("defaults to request origin + / (welcome on this deployment)", () => {
    expect(authPostSignOutUrl("https://my-app.vercel.app/theses").href).toBe("https://my-app.vercel.app/");
    expect(authPostSignOutUrl("http://127.0.0.1:3000/auth/sign-out").href).toBe("http://127.0.0.1:3000/");
  });

  it("honors NEXT_PUBLIC_POST_SIGN_OUT_ORIGIN when set", () => {
    process.env.NEXT_PUBLIC_POST_SIGN_OUT_ORIGIN = "https://marketing.example.com";
    expect(authPostSignOutUrl("https://my-app.vercel.app/theses").href).toBe("https://marketing.example.com/");
  });
});
