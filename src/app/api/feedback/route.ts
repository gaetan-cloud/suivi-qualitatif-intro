import { NextRequest, NextResponse } from "next/server";
import {
  INTRO,
  Intro,
  REPONSE,
  RDV_OPTIONS,
  RESULTAT_COMMERCIAL,
  STATUT_PRESTATION,
  createReponses,
  filterEnAttente,
  getIntrosByToken,
  isValidTokenFormat,
  updateIntros,
} from "@/lib/airtable";

export const dynamic = "force-dynamic";

interface FeedbackInput {
  introId: string;
  rdv: string;
  commentaire?: string;
  resultatCommercial?: string;
  statutPrestation?: string;
  note?: number;
  dateRdv?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function typeLabel(type: string): string {
  switch (type) {
    case "Prestation":
      return "Prestataire de confiance";
    case "Commerciale":
      return "Facilitation commerciale";
    case "Pro bono":
      return "Expert pro bono";
    default:
      return type;
  }
}

/**
 * Miroir de la logique de l'automation actuelle : détermine le nouveau
 * statut de l'intro à partir de la réponse.
 */
function introUpdate(
  intro: Intro,
  input: FeedbackInput
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.rdv === "Oui") {
    fields[INTRO.statut] =
      intro.type === "Commerciale" &&
      input.resultatCommercial === "Opportunité en cours"
        ? "Résultat en attente"
        : "Répondu";
  } else if (input.rdv === "Pas encore") {
    if (input.dateRdv) {
      fields[INTRO.dateRdv] = input.dateRdv;
      fields[INTRO.statut] = "RDV daté";
    } else {
      fields[INTRO.statut] = "En attente RDV";
    }
  } else {
    // Annulé
    fields[INTRO.statut] = "Répondu";
  }
  return fields;
}

export async function POST(request: NextRequest) {
  let body: { token?: unknown; responses?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const { token, responses } = body;
  if (
    !isValidTokenFormat(token) ||
    !Array.isArray(responses) ||
    responses.length === 0 ||
    responses.length > 50
  ) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  try {
    // Contrôle anti-triche : chaque introId doit appartenir au cofondateur
    // du token ET être encore en attente de retour.
    const owned = filterEnAttente(await getIntrosByToken(token));
    const byId = new Map(owned.map((i) => [i.id, i]));

    const validated: { intro: Intro; input: FeedbackInput }[] = [];
    const seen = new Set<string>();

    for (const raw of responses) {
      const input = raw as FeedbackInput;
      const intro = byId.get(String(input.introId));
      if (!intro || seen.has(intro.id)) {
        return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
      }
      seen.add(intro.id);

      if (!(RDV_OPTIONS as readonly string[]).includes(input.rdv)) {
        return NextResponse.json(
          { error: "Requête invalide" },
          { status: 400 }
        );
      }
      if (input.dateRdv && !DATE_RE.test(input.dateRdv)) {
        return NextResponse.json(
          { error: "Requête invalide" },
          { status: 400 }
        );
      }
      validated.push({ intro, input });
    }

    const rows: Record<string, unknown>[] = [];
    const updates: { id: string; fields: Record<string, unknown> }[] = [];

    for (const { intro, input } of validated) {
      const row: Record<string, unknown> = {
        [REPONSE.refIntro]: intro.id,
        [REPONSE.introLiee]: [intro.id],
        [REPONSE.rdvEuLieu]: input.rdv,
        [REPONSE.miseEnRelation]: `${typeLabel(intro.type)}${
          intro.contact ? ` — ${intro.contact}` : ""
        }`,
      };
      if (intro.type) row[REPONSE.type] = intro.type;

      // Seuls les champs pertinents pour le type/état sont écrits ; le reste
      // est ignoré même si le client l'envoie.
      if (input.rdv === "Oui" || input.rdv === "Annulé") {
        if (input.commentaire?.trim())
          row[REPONSE.commentaire] = input.commentaire.trim().slice(0, 5000);
      }
      if (input.rdv === "Oui") {
        if (
          intro.type === "Commerciale" &&
          (RESULTAT_COMMERCIAL as readonly string[]).includes(
            input.resultatCommercial ?? ""
          )
        ) {
          row[REPONSE.resultatCommercial] = input.resultatCommercial;
        }
        if (
          intro.type === "Prestation" &&
          (STATUT_PRESTATION as readonly string[]).includes(
            input.statutPrestation ?? ""
          )
        ) {
          row[REPONSE.statutPrestation] = input.statutPrestation;
        }
        if (
          intro.type === "Pro bono" &&
          typeof input.note === "number" &&
          Number.isInteger(input.note) &&
          input.note >= 1 &&
          input.note <= 5
        ) {
          row[REPONSE.note] = input.note;
        }
      }
      if (input.rdv === "Pas encore" && input.dateRdv) {
        row[REPONSE.dateRdvPrevue] = input.dateRdv;
      }

      rows.push(row);
      updates.push({ id: intro.id, fields: introUpdate(intro, input) });
    }

    const saved = await createReponses(rows);
    await updateIntros(updates);

    return NextResponse.json({ saved });
  } catch (error) {
    console.error("POST /api/feedback", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
