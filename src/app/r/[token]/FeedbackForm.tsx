"use client";

import { useEffect, useState } from "react";

interface IntroDto {
  id: string;
  contact: string;
  type: string;
  entreprise: string;
  referent: string;
  dateIntro: string;
}

interface Answer {
  rdv: string;
  dateRdv: string;
  commentaire: string;
  resultatCommercial: string;
  statutPrestation: string;
  note: number;
}

const EMPTY_ANSWER: Answer = {
  rdv: "",
  dateRdv: "",
  commentaire: "",
  resultatCommercial: "",
  statutPrestation: "",
  note: 0,
};

const TYPE_LABELS: Record<string, string> = {
  Prestation: "Prestataire de confiance",
  Commerciale: "Facilitation commerciale",
  "Pro bono": "Expert pro bono",
};

const RESULTATS = [
  "Opportunité en cours",
  "Opportunité gagnée",
  "Opportunité perdue",
];
const PRESTATIONS = [
  "Prestation signée",
  "En réflexion",
  "Pas de prestation signée",
];

function formatDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function Choices({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="choices">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`choice${value === opt ? " selected" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function IntroCard({
  intro,
  answer,
  missing,
  onChange,
}: {
  intro: IntroDto;
  answer: Answer;
  missing: boolean;
  onChange: (a: Answer) => void;
}) {
  const set = (patch: Partial<Answer>) => onChange({ ...answer, ...patch });

  return (
    <div className="card">
      <div className="card-contact">
        {intro.contact}
        <span className="badge">{TYPE_LABELS[intro.type] ?? intro.type}</span>
      </div>
      <div className="card-context">
        {intro.entreprise ? `${intro.entreprise} · ` : ""}
        Référent : {intro.referent} · Mise en relation du{" "}
        {formatDate(intro.dateIntro)}
      </div>

      <div className="question">
        <label className="question-label">
          Le rendez-vous a-t-il eu lieu ?
        </label>
        <Choices
          options={["Oui", "Pas encore", "Annulé"]}
          value={answer.rdv}
          onChange={(rdv) => set({ rdv })}
        />
        {missing && !answer.rdv && (
          <div className="error-text">Merci de répondre à cette question.</div>
        )}
      </div>

      {answer.rdv === "Pas encore" && (
        <div className="question">
          <label className="question-label">
            Date prévue du rendez-vous (si connue)
          </label>
          <input
            type="date"
            value={answer.dateRdv}
            onChange={(e) => set({ dateRdv: e.target.value })}
          />
        </div>
      )}

      {answer.rdv === "Oui" && intro.type === "Commerciale" && (
        <div className="question">
          <label className="question-label">Résultat commercial</label>
          <Choices
            options={RESULTATS}
            value={answer.resultatCommercial}
            onChange={(resultatCommercial) => set({ resultatCommercial })}
          />
        </div>
      )}

      {answer.rdv === "Oui" && intro.type === "Prestation" && (
        <div className="question">
          <label className="question-label">Statut de la prestation</label>
          <Choices
            options={PRESTATIONS}
            value={answer.statutPrestation}
            onChange={(statutPrestation) => set({ statutPrestation })}
          />
        </div>
      )}

      {answer.rdv === "Oui" && (
        <div className="question">
          <label className="question-label">
            Quelle note mettrais-tu à ce rendez-vous ? *
          </label>
          <div className="stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={`star${answer.note >= n ? " filled" : ""}`}
                onClick={() => set({ note: n })}
                aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
              >
                ★
              </button>
            ))}
          </div>
          {missing && !answer.note && (
            <div className="error-text">Merci de donner une note.</div>
          )}
        </div>
      )}

      {(answer.rdv === "Oui" || answer.rdv === "Annulé") && (
        <div className="question">
          <label className="question-label">Commentaire</label>
          <textarea
            placeholder={
              answer.rdv === "Annulé"
                ? "Pourquoi le rendez-vous a-t-il été annulé ?"
                : "Comment s'est passé le rendez-vous ?"
            }
            value={answer.commentaire}
            onChange={(e) => set({ commentaire: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

export default function FeedbackForm({ token }: { token: string }) {
  const [status, setStatus] = useState<
    "loading" | "ready" | "empty" | "invalid" | "sent" | "error"
  >("loading");
  const [prenom, setPrenom] = useState("");
  const [intros, setIntros] = useState<IntroDto[]>([]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showMissing, setShowMissing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    fetch(`/api/intros?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 404) return setStatus("invalid");
        if (!res.ok) return setStatus("error");
        const data = await res.json();
        setPrenom(data.prenom);
        setIntros(data.intros);
        setAnswers(
          Object.fromEntries(
            data.intros.map((i: IntroDto) => [i.id, { ...EMPTY_ANSWER }])
          )
        );
        setStatus(data.intros.length === 0 ? "empty" : "ready");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  function isIncomplete(a: Answer | undefined): boolean {
    return !a?.rdv || (a.rdv === "Oui" && !a.note);
  }

  async function submit() {
    if (intros.some((i) => isIncomplete(answers[i.id]))) {
      setShowMissing(true);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          responses: intros.map((i) => {
            const a = answers[i.id];
            return {
              introId: i.id,
              rdv: a.rdv,
              commentaire: a.commentaire || undefined,
              resultatCommercial: a.resultatCommercial || undefined,
              statutPrestation: a.statutPrestation || undefined,
              note: a.note || undefined,
              dateRdv: a.dateRdv || undefined,
            };
          }),
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("sent");
    } catch {
      setSubmitError(
        "L'envoi a échoué. Réessaie dans un instant — si le problème persiste, réponds directement à l'email Asterion."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="container center-box">
        <p className="intro-text">Chargement…</p>
      </div>
    );
  }

  if (status === "invalid" || status === "error") {
    return (
      <div className="container center-box">
        <div className="emoji">🔗</div>
        <h1>Lien introuvable</h1>
        <p className="intro-text">
          {status === "invalid"
            ? "Ce lien n'est pas (ou plus) valide. Utilise le lien de ton dernier email Asterion, ou réponds directement à l'email."
            : "Une erreur est survenue. Réessaie dans un instant."}
        </p>
      </div>
    );
  }

  if (status === "sent") {
    return (
      <div className="container center-box">
        <div className="emoji">🙏</div>
        <h1>Merci {prenom} !</h1>
        <p className="intro-text">
          Tes retours ont bien été enregistrés. Ils nous aident à identifier
          les membres de la communauté qui ouvrent les meilleures portes.
        </p>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="container center-box">
        <div className="emoji">✅</div>
        <h1>Tout est à jour</h1>
        <p className="intro-text">
          Aucune mise en relation n'attend de retour de ta part. Merci{" "}
          {prenom} !
        </p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Bonjour {prenom},</h1>
      <p className="intro-text">
        {intros.length > 1
          ? "Peux-tu nous faire un retour rapide sur chacune de tes dernières mises en relation ? (~30 sec par mise en relation)"
          : "Peux-tu nous faire un retour rapide sur ta dernière mise en relation ? (~30 sec)"}{" "}
        Tes retours nous permettent d&apos;affiner notre connaissance des
        expertises des membres de notre communauté et d&apos;identifier ceux
        qui ouvrent les meilleures portes.
      </p>

      {intros.map((intro) => (
        <IntroCard
          key={intro.id}
          intro={intro}
          answer={answers[intro.id] ?? EMPTY_ANSWER}
          missing={showMissing}
          onChange={(a) => setAnswers((prev) => ({ ...prev, [intro.id]: a }))}
        />
      ))}

      <button
        type="button"
        className="submit-btn"
        onClick={submit}
        disabled={submitting}
      >
        {submitting ? "Envoi en cours…" : "Envoyer mes retours"}
      </button>
      {submitError && <div className="error-text">{submitError}</div>}
      {showMissing && intros.some((i) => isIncomplete(answers[i.id])) && (
        <div className="error-text">
          Il manque une réponse obligatoire sur au moins une carte.
        </div>
      )}

      <p className="footer-note">L&apos;équipe Asterion 🤝</p>
    </div>
  );
}
