// apps/miniapp/app/api/pay/verify/route.ts
import { NextResponse } from "next/server";

const isTxHash = (s: unknown): s is `0x${string}` =>
  typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test((s as string).trim());

export async function POST(req: Request) {
  try {
    const { txHash } = await req.json();

    if (!isTxHash(txHash)) {
      return NextResponse.json({ ok: false, reason: "invalid tx hash" }, { status: 400 });
    }

    // MVP: treat correctly-shaped hash as paid
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "verify failed" }, { status: 500 });
  }
}
