import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { NavBar } from "@/components/nav-bar";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flight Business Radar",
  description: "Surveillance des prix de billets Business au départ de Paris-CDG",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          <AuthGate>
            <NavBar />
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
