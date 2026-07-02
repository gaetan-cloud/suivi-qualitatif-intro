import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { mintMissingTokens } from "@/lib/airtable";

export const dynamic = "force-dynamic";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Remplit les tokens manquants dans Intros. Appelé par Make en tête de
 * scénario digest, avant la recherche des intros à relancer.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret") ?? "";
  if (!expected || !secretsMatch(provided, expected)) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  try {
    const result = await mintMissingTokens();
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/admin/mint-tokens", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
