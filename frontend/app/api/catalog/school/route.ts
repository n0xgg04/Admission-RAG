import { NextRequest, NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";

export async function GET(request: NextRequest) {
  const code = (request.nextUrl.searchParams.get("code") || "").toUpperCase().trim();
  const keyword = (request.nextUrl.searchParams.get("keyword") || "").toLowerCase().trim();
  const page = Number(request.nextUrl.searchParams.get("page") || "1");
  const pageSize = Math.min(200, Math.max(10, Number(request.nextUrl.searchParams.get("pageSize") || "30")));

  if (!code) {
    return NextResponse.json({ message: "Missing school code" }, { status: 400 });
  }

  const { schools, cutoffs } = await loadCatalog();
  const school = schools.find((s) => s["ma-truong"] === code);
  if (!school) {
    return NextResponse.json({ message: `School ${code} not found` }, { status: 404 });
  }

  let rows = cutoffs.filter((row) => row["ma-truong"] === code);
  if (keyword) {
    rows = rows.filter((row) => {
      const major = (row["ten-nganh"] || "").toLowerCase();
      const majorCode = (row["ma-nganh"] || "").toLowerCase();
      const combo = (row["to-hop"] || "").toLowerCase();
      return major.includes(keyword) || majorCode.includes(keyword) || combo.includes(keyword);
    });
  }

  const total = rows.length;
  const start = (Math.max(1, page) - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return NextResponse.json({
    school,
    pagination: {
      page: Math.max(1, page),
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    },
    cutoffs: items
  });
}
