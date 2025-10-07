// app/api/unlock/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  // сюда попадём только если оплата подтверждена
  return NextResponse.json({
    ok: true,
    content: "🎉 Your premium content is now unlocked!",
  });
}
