import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index.js";

describe("Team Trial worker", () => {
  it("404s on unknown routes", async () => {
    const request = new Request("http://example.com/nope");
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it("rejects /build with no files", async () => {
    const request = new Request("http://example.com/build", { method: "POST", body: new FormData() });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("No replay files");
  });

  it("rejects /build with mismatched metadata", async () => {
    const form = new FormData();
    form.append("files", new Blob(["{}"], { type: "application/json" }), "a.json");
    form.append("meta", JSON.stringify([]));
    const request = new Request("http://example.com/build", { method: "POST", body: form });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(400);
  });
});
