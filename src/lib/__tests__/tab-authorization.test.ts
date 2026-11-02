import { describe, expect, it, vi } from "vitest";
import { requireTabOperator } from "@/lib/tab-authorization.server";

type Context = Parameters<typeof requireTabOperator>[0];
function makeContext(roles: { admin?: boolean; staff?: boolean; error?: boolean }): Context {
  const rpc = vi.fn(async (_name: string, args: { _role: "admin" | "staff" }) => ({
    data: args._role === "admin" ? Boolean(roles.admin) : Boolean(roles.staff),
    error: roles.error ? { message: "Role lookup failed" } : null,
  }));
  return { userId: "signed-in-user", supabase: { rpc } as unknown as Context["supabase"] };
}

describe("house tab operator gate", () => {
  it("allows only staff and managers", async () => {
    await expect(requireTabOperator(makeContext({ admin: true }))).resolves.toBeUndefined();
    await expect(requireTabOperator(makeContext({ staff: true }))).resolves.toBeUndefined();
    await expect(requireTabOperator(makeContext({ admin: false, staff: false }))).rejects.toThrow(
      /staff or manager/i,
    );
  });

  it("fails closed when authorisation queries fail", async () => {
    await expect(requireTabOperator(makeContext({ admin: true, error: true }))).rejects.toThrow(
      /staff or manager/i,
    );
  });
});
