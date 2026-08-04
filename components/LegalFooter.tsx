/**
 * The one-paragraph summary plus policy links shown on every page a signed-out
 * visitor can reach. Signing out lands on /login, so this is what the root of
 * the site effectively presents — including to Google's OAuth review, which
 * requires the two links to be reachable from the landing page.
 */

import Link from "next/link";

export function LegalFooter({
  className = "",
  /** Off where the page already describes the app, so it is not said twice. */
  showBlurb = true,
}: {
  className?: string;
  showBlurb?: boolean;
}) {
  return (
    <div className={`mt-6 text-center ${className}`}>
      {showBlurb && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          TubeShelf is a self-hosted, chronological feed for your YouTube
          subscriptions — no algorithm, no ads, no tracking. Linking a Google
          account is optional and only enables liking a video from the player.
        </p>
      )}
      <nav className="mt-3 flex items-center justify-center gap-3 text-xs">
        <Link
          href="/privacy-policy"
          className="text-muted-foreground hover:text-foreground underline underline-offset-2 transition"
        >
          Privacy Policy
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          &middot;
        </span>
        <Link
          href="/terms-of-service"
          className="text-muted-foreground hover:text-foreground underline underline-offset-2 transition"
        >
          Terms of Service
        </Link>
      </nav>
    </div>
  );
}
