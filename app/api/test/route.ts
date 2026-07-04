import { db } from "@/lib/db";

export async function GET() {
  try {
    const count = await db.group.count();
    return Response.json({ ok: true, groups: count });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
