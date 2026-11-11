import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureSchema } from "@/lib/ensure-schema";
import { describeError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Auto-provision tables so a fresh database needs no manual setup.
    await ensureSchema();
    await db.execute(sql`select 1`);
    const result = await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    );
    const tables = (result as unknown as { rows: { table_name: string }[] }).rows.map((r) => r.table_name);
    return Response.json({ ok: true, database: "connected", tables });
  } catch (err) {
    return Response.json({ ok: false, error: describeError(err) }, { status: 500 });
  }
}
