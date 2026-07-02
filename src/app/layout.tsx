import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Retours intros — Asterion",
  description: "Donne ton retour sur tes dernières mises en relation Asterion.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
