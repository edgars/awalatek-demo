import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { conReintentoSqliteBusy } from "@/server/db";

function clienteFalso(falhas: unknown[]) {
  const $transaction = vi.fn(async () => {
    const e = falhas.shift();
    if (e) throw e;
    return "ok";
  });
  return { cliente: conReintentoSqliteBusy({ $transaction } as unknown as PrismaClient), $transaction };
}

describe("conReintentoSqliteBusy", () => {
  it("reintenta la transacción ante P1008 (SQLITE_BUSY) y devuelve el resultado", async () => {
    const { cliente, $transaction } = clienteFalso([{ code: "P1008" }, { code: "P1008" }]);
    await expect(cliente.$transaction(async () => "x")).resolves.toBe("ok");
    expect($transaction).toHaveBeenCalledTimes(3);
  });

  it("no reintenta otros errores", async () => {
    const { cliente, $transaction } = clienteFalso([{ code: "P2002" }]);
    await expect(cliente.$transaction(async () => "x")).rejects.toMatchObject({ code: "P2002" });
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("desiste tras 6 intentos", async () => {
    const { cliente, $transaction } = clienteFalso(Array.from({ length: 10 }, () => ({ code: "P1008" })));
    await expect(cliente.$transaction(async () => "x")).rejects.toMatchObject({ code: "P1008" });
    expect($transaction).toHaveBeenCalledTimes(6);
  });
});
