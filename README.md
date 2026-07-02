# Mini-app « Retours intros » — Asterion

Chaque cofondateur reçoit **un lien unique** (`/r/<token>`) listant toutes ses
intros en attente de retour, avec un formulaire par intro écrit directement
dans Airtable. Remplace les N boutons Fillout de l'email digest.

- **Prod** : https://retours-intros.vercel.app (projet Vercel `retours-intros`, compte `gaetan-3070`)
- **Base Airtable** : Accompagnement `appqiW7uPFRgPLVVe` — Intros `tblhpnkoMCfvMCcWI`, Réponses `tblph7FUcpTdkskLy`
- **Scénario Make** : `6418471` — « Suivi intros experts — DIGEST v2 (mini-app retours) », **inactif** tant que non validé. L'ancien digest Fillout (`6387956`) est intact.

## Architecture

- Next.js App Router + TypeScript, déployé sur Vercel. Pas de base de données : Airtable est la source de vérité.
- La clé Airtable vit **uniquement** dans les API routes serverless (`process.env`), jamais côté client.
- Token opaque (32 hex, ≥128 bits) stocké dans le champ `Token cofondateur` de la table Intros — **même token pour toutes les intros d'un même email**. Révocable en vidant le champ.

### Endpoints

| Route | Rôle |
|---|---|
| `GET /api/intros?token=…` | Résout le token → intros en attente du cofondateur (JSON minimal). 404 générique si token inconnu. |
| `POST /api/feedback` | Écrit une ligne Réponses par intro + met à jour le statut de l'intro. Re-vérifie côté serveur que chaque `introId` appartient au token (403 sinon). |
| `POST /api/admin/mint-tokens` | Remplit les tokens manquants (réutilise le token existant du même email). Protégé par le header `x-admin-secret`. Appelé par Make en tête de scénario. |
| `/r/<token>` | La page publique du cofondateur. |

Statuts considérés « en attente de retour » : `RDV daté`, `En attente RDV`,
`Résultat en attente`, **`Form envoyé`** (statut posé par Make juste avant
l'envoi de l'email — c'est celui dans lequel l'intro se trouve quand le
cofondateur clique).

### Logique de mise à jour d'une intro après réponse

| Cas | Statut suivi |
|---|---|
| RDV Oui · Commerciale · « Opportunité en cours » | `Résultat en attente` |
| RDV Oui · Commerciale · gagnée/perdue | `Répondu` |
| RDV Oui · Prestation ou Pro bono | `Répondu` |
| RDV Pas encore · date fournie | `Date RDV` = date · `RDV daté` |
| RDV Pas encore · sans date | `En attente RDV` |
| RDV Annulé | `Répondu` |

## Variables d'environnement (Vercel, scope Production)

Déjà configurées : `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_INTROS`,
`AIRTABLE_TABLE_REPONSES`, `ADMIN_SECRET`.

**Manquante (à faire une fois)** : `AIRTABLE_API_KEY`
1. https://airtable.com/create/tokens → nouveau Personal Access Token, scopes `data.records:read` + `data.records:write`, limité à la base Accompagnement.
2. `printf 'pat_xxx' | npx vercel env add AIRTABLE_API_KEY production` (depuis ce dossier), ou via le dashboard Vercel → Settings → Environment Variables.
3. Redéployer : `npx vercel deploy --prod --yes`.

## Test de bout en bout

Trois intros de test (`Gaëtan (test)`, gaetan@asterionventures.com) sont en
base avec le token de test. Une fois le PAT posé :

1. Ouvrir https://retours-intros.vercel.app/r/ce9b42c086197ac77bef5aabf045a533 — les 3 cartes (Commerciale / Prestation / Pro bono) doivent s'afficher.
2. Répondre et envoyer → vérifier les 3 lignes créées dans Réponses (avec `Intro liée` remplie) et les statuts mis à jour dans Intros.
3. Lancer le scénario Make `6418471` en « Run once » → vérifier l'email reçu (un seul bouton « Donner mes retours → »).
4. Supprimer les intros/réponses de test, activer le scénario `6418471`, désactiver l'ancien (`6387956`).

## Dev local

```bash
npm install
cp .env.example .env.local   # remplir AIRTABLE_API_KEY, ou mettre MOCK_AIRTABLE=1
npm run dev
# mode mock : http://localhost:3000/r/ce9b42c086197ac77bef5aabf045a533
```
