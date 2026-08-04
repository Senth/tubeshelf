/**
 * Shared shell for the static legal pages (/privacy-policy, /terms-of-service).
 *
 * These are the only pages a signed-out visitor can read in full, and Google's
 * OAuth verification review loads them directly, so they render server-side
 * with no auth and no client JavaScript.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className="text-lg font-semibold text-foreground mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/**
 * Contact line. Falls back to generic wording when the admin has not set
 * `legalContactEmail`, so the pages never render a dangling "email us at".
 */
export function LegalContact({ email }: { email: string }) {
  if (!email) {
    return (
      <p>
        This instance has not published a contact address. Reach out to whoever
        gave you access to it — they operate this deployment and are responsible
        for the data it holds.
      </p>
    );
  }

  return (
    <p>
      Questions about this document, or requests concerning your data, go to{" "}
      <a href={`mailto:${email}`}>{email}</a>.
    </p>
  );
}

export function LegalPage({
  title,
  intro,
  lastUpdated,
  children,
}: {
  title: string;
  intro: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to TubeShelf
        </Link>

        <header className="mt-6 mb-8 border-b border-border pb-6">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-3 text-muted-foreground">{intro}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
        </header>

        <article className="text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_li]:mt-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </article>

        <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
          <nav className="flex flex-wrap gap-x-4 gap-y-2">
            <Link
              href="/privacy-policy"
              className="hover:text-foreground transition"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="hover:text-foreground transition"
            >
              Terms of Service
            </Link>
            <Link href="/login" className="hover:text-foreground transition">
              Sign in
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
