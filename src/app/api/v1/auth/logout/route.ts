import { NextResponse } from "next/server";
import { handle } from "@server/core/api";
import { SESSION_COOKIE } from "@server/core/auth";

export const POST = handle({}, async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
