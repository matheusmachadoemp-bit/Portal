import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeDre } from "@/lib/dre";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month")) || new Date().getMonth() + 1;
  const year = Number(searchParams.get("year")) || new Date().getFullYear();
  const empresa = (searchParams.get("empresa") as never) || "ALL";

  const rows = await computeDre({ month, year, empresa });
  return NextResponse.json({ rows });
}
