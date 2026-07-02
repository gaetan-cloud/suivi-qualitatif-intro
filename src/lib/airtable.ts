import { randomBytes } from "crypto";

// ---------------------------------------------------------------------------
// Accès Airtable — uniquement côté serveur (API routes). La clé ne doit
// jamais atteindre le bundle client.
// ---------------------------------------------------------------------------

const API_URL = "https://api.airtable.com/v0";

// Field IDs — table Intros (tblhpnkoMCfvMCcWI). On lit/écrit par ID pour
// résister aux renommages de champs dans Airtable.
export const INTRO = {
  prenom: "fld4jYD2q31vVN3EQ",
  email: "fldmo64T7zLur2t1X",
  startup: "fldCmlGynMwh2OyVe",
  contact: "fldjmweL1UL1WRnBc",
  entreprise: "fldWfQQGdqiQ07yl9",
  referent: "fldDSVmQ6ghASTG9c",
  type: "fldUCanrkZlbN9zgt",
  dateIntro: "fldGOjOY6eJ11olHc",
  dateRdv: "fldTeB2ydG4aNTCxZ",
  statut: "fldKJvDS7wm8fj2EB",
  nbRelances: "fldY13e8mUu7VyHvG",
  lienReponse: "fldteCT58nOGDZ8mq",
  token: "fldiWPrBWSOORMzjn",
} as const;

// Field IDs — table Réponses (tblph7FUcpTdkskLy)
export const REPONSE = {
  refIntro: "fldb113ao5s8oGofo",
  rdvEuLieu: "fldTUftGteqkpSyCt",
  dateRdvPrevue: "fldg0JRmrcfKins68",
  note: "fldkGW7PPgnFu8iE4",
  commentaire: "fldIR4uPsuuVhe1jd",
  miseEnRelation: "fldfB4d1gTOgCxLs6",
  resultatCommercial: "fldkLb5EmA5PWsP5s",
  introLiee: "fldRQNbJjK85iOo4T",
  statutPrestation: "fldGF4sPWmi3hTzkA",
  type: "fldkTbL9kBwf88GUZ",
} as const;

// Libellés exacts des options (vérifiés via le schema Airtable — ne pas
// modifier sans mettre à jour la base).
export const TYPES = ["Commerciale", "Prestation", "Pro bono"] as const;
export const RDV_OPTIONS = ["Oui", "Pas encore", "Annulé"] as const;
export const RESULTAT_COMMERCIAL = [
  "Opportunité en cours",
  "Opportunité gagnée",
  "Opportunité perdue",
] as const;
export const STATUT_PRESTATION = [
  "Prestation signée",
  "En réflexion",
  "Pas de prestation signée",
] as const;

// Statuts d'intro considérés « en attente de retour ». Inclut « Form envoyé »
// car Make passe l'intro dans ce statut juste avant d'envoyer l'email : c'est
// le statut dans lequel se trouve l'intro quand le cofondateur ouvre le lien.
export const STATUTS_EN_ATTENTE = [
  "RDV daté",
  "En attente RDV",
  "Résultat en attente",
  "Form envoyé",
] as const;

export type IntroType = (typeof TYPES)[number];

export interface Intro {
  id: string;
  prenom: string;
  email: string;
  contact: string;
  type: IntroType | "";
  entreprise: string;
  referent: string;
  startup: string;
  dateIntro: string;
  statut: string;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const MOCK = process.env.MOCK_AIRTABLE === "1";

async function airtableFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_URL}/${env("AIRTABLE_BASE_ID")}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status} sur ${path} : ${body}`);
  }
  return res.json();
}

// Un single select lu via l'API arrive comme une string (le nom de l'option).
function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapIntro(record: any): Intro {
  const f = record.fields ?? {};
  return {
    id: record.id,
    prenom: str(f[INTRO.prenom]),
    email: str(f[INTRO.email]),
    contact: str(f[INTRO.contact]),
    type: str(f[INTRO.type]) as Intro["type"],
    entreprise: str(f[INTRO.entreprise]),
    referent: str(f[INTRO.referent]),
    startup: str(f[INTRO.startup]),
    dateIntro: str(f[INTRO.dateIntro]),
    statut: str(f[INTRO.statut]),
  };
}

const TOKEN_RE = /^[a-f0-9]{24,64}$/;

export function isValidTokenFormat(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/**
 * Toutes les intros portant ce token, quel que soit le statut. Le filtrage
 * « en attente » se fait ensuite en JS pour distinguer token inconnu (404)
 * de « tout est déjà répondu » (liste vide).
 */
export async function getIntrosByToken(token: string): Promise<Intro[]> {
  if (!isValidTokenFormat(token)) return [];
  if (MOCK) return mockIntros(token);

  const records: any[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      returnFieldsByFieldId: "true",
      // Le token est validé strictement hex ci-dessus : pas d'injection possible.
      filterByFormula: `{Token cofondateur}='${token}'`,
      pageSize: "100",
    });
    if (offset) params.set("offset", offset);
    const page = await airtableFetch(
      `${env("AIRTABLE_TABLE_INTROS")}?${params}`
    );
    records.push(...page.records);
    offset = page.offset;
  } while (offset);

  return records.map(mapIntro);
}

export function filterEnAttente(intros: Intro[]): Intro[] {
  return intros.filter((i) =>
    (STATUTS_EN_ATTENTE as readonly string[]).includes(i.statut)
  );
}

export async function createReponses(
  rows: Record<string, unknown>[]
): Promise<number> {
  if (MOCK) return rows.length;
  let created = 0;
  // L'API REST Airtable accepte 10 records max par requête.
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const res = await airtableFetch(env("AIRTABLE_TABLE_REPONSES"), {
      method: "POST",
      body: JSON.stringify({
        records: batch.map((fields) => ({ fields })),
        typecast: true,
      }),
    });
    created += res.records.length;
  }
  return created;
}

export async function updateIntros(
  updates: { id: string; fields: Record<string, unknown> }[]
): Promise<void> {
  if (MOCK || updates.length === 0) return;
  for (let i = 0; i < updates.length; i += 10) {
    await airtableFetch(env("AIRTABLE_TABLE_INTROS"), {
      method: "PATCH",
      body: JSON.stringify({
        records: updates.slice(i, i + 10),
        typecast: true,
      }),
    });
  }
}

/**
 * Remplit `Token cofondateur` sur toutes les intros qui n'en ont pas :
 * réutilise le token existant du même email, sinon en génère un nouveau.
 * Appelé par Make (via /api/admin/mint-tokens) avant chaque digest.
 */
export async function mintMissingTokens(): Promise<{
  minted: number;
  scanned: number;
}> {
  if (MOCK) return { minted: 0, scanned: 0 };

  const records: any[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({
      returnFieldsByFieldId: "true",
      pageSize: "100",
    });
    params.append("fields[]", INTRO.email);
    params.append("fields[]", INTRO.token);
    if (offset) params.set("offset", offset);
    const page = await airtableFetch(
      `${env("AIRTABLE_TABLE_INTROS")}?${params}`
    );
    records.push(...page.records);
    offset = page.offset;
  } while (offset);

  const tokenByEmail = new Map<string, string>();
  for (const r of records) {
    const email = str(r.fields?.[INTRO.email]).toLowerCase();
    const token = str(r.fields?.[INTRO.token]);
    if (email && token) tokenByEmail.set(email, token);
  }

  const updates: { id: string; fields: Record<string, unknown> }[] = [];
  for (const r of records) {
    const email = str(r.fields?.[INTRO.email]).toLowerCase();
    const token = str(r.fields?.[INTRO.token]);
    if (!email || token) continue;
    let assigned = tokenByEmail.get(email);
    if (!assigned) {
      assigned = randomBytes(16).toString("hex");
      tokenByEmail.set(email, assigned);
    }
    updates.push({ id: r.id, fields: { [INTRO.token]: assigned } });
  }

  await updateIntros(updates);
  return { minted: updates.length, scanned: records.length };
}

// --- Données factices pour le dev local sans clé Airtable -----------------

function mockIntros(token: string): Intro[] {
  if (!token.startsWith("ce9b")) return [];
  return [
    {
      id: "recMock0000000001",
      prenom: "Patrick",
      email: "demo@example.com",
      contact: "Jean Dujardin",
      type: "Commerciale",
      entreprise: "Acme Corp",
      referent: "Gaëtan",
      startup: "Living Models",
      dateIntro: "2026-06-15",
      statut: "Form envoyé",
    },
    {
      id: "recMock0000000002",
      prenom: "Patrick",
      email: "demo@example.com",
      contact: "Marion Cotillard",
      type: "Prestation",
      entreprise: "Cabinet Lexia",
      referent: "Thibaut",
      startup: "Living Models",
      dateIntro: "2026-06-20",
      statut: "RDV daté",
    },
    {
      id: "recMock0000000003",
      prenom: "Patrick",
      email: "demo@example.com",
      contact: "Omar Sy",
      type: "Pro bono",
      entreprise: "",
      referent: "Gaëtan",
      startup: "Living Models",
      dateIntro: "2026-06-25",
      statut: "En attente RDV",
    },
  ];
}
