import { NextRequest, NextResponse } from "next/server";
import {
  filterEnAttente,
  getIntrosByToken,
  isValidTokenFormat,
} from "@/lib/airtable";

export const dynamic = "force-dynamic";

// Réponse volontairement générique : ne révèle jamais si un token existe.
const NOT_FOUND = NextResponse.json({ error: "Introuvable" }, { status: 404 });

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!isValidTokenFormat(token)) return NOT_FOUND;

  try {
    const all = await getIntrosByToken(token);
    if (all.length === 0) return NOT_FOUND;

    const intros = filterEnAttente(all).map((i) => ({
      id: i.id,
      contact: i.contact,
      type: i.type,
      entreprise: i.entreprise,
      referent: i.referent,
      dateIntro: i.dateIntro,
    }));

    return NextResponse.json({ prenom: all[0].prenom, intros });
  } catch (error) {
    console.error("GET /api/intros", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
