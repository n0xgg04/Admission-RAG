import { NextResponse } from "next/server";
import { loadCatalog } from "@/lib/catalog";

export async function GET() {
  const { schools, cutoffs } = await loadCatalog();
  const countBySchool = new Map<string, number>();

  for (const row of cutoffs) {
    const code = row["ma-truong"];
    countBySchool.set(code, (countBySchool.get(code) || 0) + 1);
  }

  const payload = schools.map((school) => ({
    code: school["ma-truong"],
    name: school["ten-truong"],
    shortName: school["ten-viet-tat"],
    province: school["dia-chi-tinh"],
    programCount: countBySchool.get(school["ma-truong"]) || 0
  }));

  return NextResponse.json({ schools: payload });
}
