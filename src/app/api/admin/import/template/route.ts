import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/roles";
import { buildTemplate } from "@/server/import/excel";

/** The blank file to fill in, with one example row so it needs no manual. */
export async function GET() {
  try {
    await requirePermission("catalog:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const buffer = await buildTemplate();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="arumi-import-template.xlsx"',
      // Generated per request and never cached by anything between here and the
      // owner: a stale template is a file whose columns no longer match.
      "cache-control": "no-store",
    },
  });
}
