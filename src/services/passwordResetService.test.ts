import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { users, tokens, links, consumeTokens } = vi.hoisted(() => {
  type UserRow = { id: string; email: string; passwordHash: string };
  type TokenRow = { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };
  const users: UserRow[] = [];
  const tokens: TokenRow[] = [];
  const links: { email: string; link: string }[] = [];
  function consumeTokens(
    where: { userId?: string; usedAt?: null; id?: string; expiresAt?: { gt: Date } },
    usedAt: Date
  ) {
    let count = 0;
    for (const row of tokens) {
      if (where.id && row.id !== where.id) continue;
      if (where.userId && row.userId !== where.userId) continue;
      if (where.usedAt === null && row.usedAt !== null) continue;
      if (where.expiresAt?.gt && row.expiresAt <= where.expiresAt.gt) continue;
      row.usedAt = usedAt;
      count += 1;
    }
    return { count };
  }
  return { users, tokens, links, consumeTokens };
});

vi.mock("../prisma/index.js", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async ({ where }: { where: { email: { equals: string } } }) => {
        const wanted = where.email.equals.toLowerCase();
        return users.find((user) => user.email.toLowerCase() === wanted) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
        const user = users.find((row) => row.id === where.id);
        if (!user) throw new Error("missing");
        user.passwordHash = data.passwordHash;
        return user;
      }),
    },
    passwordResetToken: {
      updateMany: vi.fn(
        async ({ where, data }: { where: { userId?: string; usedAt?: null }; data: { usedAt: Date } }) =>
          consumeTokens(where, data.usedAt)
      ),
      create: vi.fn(async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        const row = { ...data, id: `t${tokens.length + 1}`, usedAt: null as Date | null };
        tokens.push(row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        return tokens.find((row) => row.tokenHash === where.tokenHash) ?? null;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        user: {
          update: async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
            const user = users.find((row) => row.id === where.id);
            if (!user) throw new Error("missing");
            user.passwordHash = data.passwordHash;
            return user;
          },
        },
        passwordResetToken: {
          findUnique: async ({ where }: { where: { tokenHash: string } }) =>
            tokens.find((row) => row.tokenHash === where.tokenHash) ?? null,
          updateMany: async ({
            where,
            data,
          }: {
            where: { id?: string; usedAt?: null; expiresAt?: { gt: Date } };
            data: { usedAt: Date };
          }) => consumeTokens(where, data.usedAt),
        },
      };
      return fn(tx);
    }),
  },
}));

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get("token") ?? "";
}

describe("password reset", () => {
  beforeEach(async () => {
    users.splice(0, users.length, { id: "u1", email: "admin@aktuerya.com", passwordHash: "old-hash" });
    tokens.splice(0, tokens.length);
    links.splice(0, links.length);
    const { setResetLinkDelivery } = await import("./passwordResetService.js");
    setResetLinkDelivery(async (email, link) => {
      links.push({ email, link });
    });
  });

  it("returns the same message when the account is missing", async () => {
    const { requestPasswordReset, FORGOT_PASSWORD_MESSAGE } = await import("./passwordResetService.js");
    const missing = await requestPasswordReset("nobody@aktuerya.com");
    const present = await requestPasswordReset("admin@aktuerya.com");
    expect(missing).toEqual({ status: 200, body: { message: FORGOT_PASSWORD_MESSAGE } });
    expect(present).toEqual({ status: 200, body: { message: FORGOT_PASSWORD_MESSAGE } });
    expect(links).toHaveLength(1);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.tokenHash).not.toBe(tokenFromLink(links[0]!.link));
  });

  it("rejects an empty or invalid email", async () => {
    const { requestPasswordReset } = await import("./passwordResetService.js");
    expect((await requestPasswordReset("")).status).toBe(400);
    expect((await requestPasswordReset("not-an-email")).status).toBe(400);
    expect(tokens).toHaveLength(0);
  });

  it("stores only a hash and lets the new password replace the old one once", async () => {
    const { requestPasswordReset, confirmPasswordReset } = await import("./passwordResetService.js");
    await requestPasswordReset("admin@aktuerya.com");
    const raw = tokenFromLink(links[0]!.link);
    const hash = createHash("sha256").update(raw, "utf8").digest("hex");
    expect(tokens[0]?.tokenHash).toBe(hash);

    const updated = await confirmPasswordReset(raw, "yeni-sifre-1");
    expect(updated.status).toBe(200);
    expect(updated.body.message).toBe("Şifreniz güncellendi.");
    expect(await bcrypt.compare("yeni-sifre-1", users[0]!.passwordHash)).toBe(true);
    expect(tokens[0]?.usedAt).toBeInstanceOf(Date);

    const reused = await confirmPasswordReset(raw, "baska-sifre-2");
    expect(reused.status).toBe(400);
    expect(await bcrypt.compare("yeni-sifre-1", users[0]!.passwordHash)).toBe(true);
  });

  it("rejects a short password, an expired token, and an unknown token", async () => {
    const { requestPasswordReset, confirmPasswordReset } = await import("./passwordResetService.js");
    await requestPasswordReset("admin@aktuerya.com");
    const raw = tokenFromLink(links[0]!.link);
    expect((await confirmPasswordReset(raw, "kisa")).status).toBe(400);
    expect(tokens[0]?.usedAt).toBeNull();

    tokens[0]!.expiresAt = new Date(Date.now() - 1000);
    expect((await confirmPasswordReset(raw, "uzun-sifre-1")).status).toBe(400);

    expect((await confirmPasswordReset("this-token-does-not-exist-at-all", "uzun-sifre-1")).status).toBe(400);
  });
});
