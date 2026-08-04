/**
 * The public landing page, served in place at "/" for signed-out visitors (see
 * proxy.ts).
 *
 * Its job is to answer, without anyone signing in, "what is this app and why
 * does it want access to my YouTube account?" — the two things Google's OAuth
 * verification checks on a homepage. Keep the description of the Google account
 * section in step with app/privacy-policy/page.tsx.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  Clock,
  Download,
  ListVideo,
  PlayCircle,
  Server,
  ThumbsUp,
} from "lucide-react";
import { TubeShelfMark } from "@/components/TubeShelfMark";

export const metadata: Metadata = {
  title: "TubeShelf - Your Clean YouTube Feed",
  description:
    "TubeShelf is a self-hosted app that shows the YouTube channels you subscribe to as a plain chronological feed — no algorithm, no recommendations, no tracking.",
};

const FEATURES = [
  {
    icon: Clock,
    title: "Chronological feed",
    body: "Every new video from the channels you follow, newest first. No recommendations, no autoplay rabbit hole, no algorithm deciding what you see.",
  },
  {
    icon: ListVideo,
    title: "Lists and tags",
    body: "Group channels into your own lists — music, news, long-form — and switch between them instead of scrolling one endless feed.",
  },
  {
    icon: PlayCircle,
    title: "Built-in player",
    body: "Watch without leaving the app. It remembers where you stopped, marks videos watched, and can skip sponsor segments.",
  },
  {
    icon: Download,
    title: "Import and export",
    body: "Bring your subscriptions in from OPML and take them out again whenever you want. Your list is never locked in.",
  },
  {
    icon: Server,
    title: "Self-hosted",
    body: "It runs on your own server. Your subscriptions and viewing history stay in a database you control, not on someone else's analytics platform.",
  },
  {
    icon: ThumbsUp,
    title: "Optional YouTube likes",
    body: "Link a Google account and you can like a video from the player, so the creators you watch here still get the signal. Entirely optional.",
  },
];

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-20">
        {/* Hero */}
        <header className="text-center">
          <div className="inline-block">
            <TubeShelfMark size={80} />
          </div>
          <p className="mt-4 text-2xl font-bold tracking-tight">TubeShelf</p>
          <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight text-balance">
            Your YouTube subscriptions as a plain, chronological feed
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-muted-foreground">
            TubeShelf is a self-hosted app for watching the YouTube channels you
            already subscribe to. It collects their new uploads and shows them in
            the order they were published — nothing else. There is no
            recommendation engine, no home-page algorithm, no advertising and no
            tracking. You see the channels you chose, and only those.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90"
            >
              Sign in to this instance
            </Link>
            <Link
              href="/privacy-policy"
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition hover:bg-accent"
            >
              Privacy Policy
            </Link>
          </div>
        </header>

        {/* What it does */}
        <section className="mt-16 sm:mt-20">
          <h2 className="text-2xl font-bold tracking-tight">
            What TubeShelf does
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-card p-5"
              >
                <feature.icon
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
                <h3 className="mt-3 font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* The Google scope, in plain terms. This is the section OAuth review
            is looking for. */}
        <section className="mt-16 sm:mt-20">
          <h2 className="text-2xl font-bold tracking-tight">
            Why TubeShelf asks to access your YouTube account
          </h2>
          <div className="mt-6 rounded-lg border border-border bg-card p-6 space-y-4 text-sm leading-relaxed text-muted-foreground">
            <p>
              TubeShelf works fully without a Google account, and most of the app
              never touches one. Connecting your Google account unlocks exactly
              one feature: <strong className="text-foreground">liking a
              video on YouTube from inside the TubeShelf player</strong>, so the
              creators you watch here still receive that signal on YouTube.
              Nothing else in the app changes.
            </p>
            <div>
              <p className="text-foreground font-semibold">
                What TubeShelf asks for
              </p>
              <p className="mt-1">
                A single scope,{" "}
                <code className="text-foreground">
                  https://www.googleapis.com/auth/youtube.force-ssl
                </code>
                . It is the narrowest scope Google offers that allows setting a
                rating on a video.
              </p>
            </div>
            <div>
              <p className="text-foreground font-semibold">
                What it is used for
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>
                  Reading whether you have already liked the video currently open
                  in the player, so the button shows the right state.
                </li>
                <li>
                  Setting or removing your like when you press the button — or
                  automatically, if you turned on auto-like and watched past the
                  threshold you chose.
                </li>
              </ul>
            </div>
            <div>
              <p className="text-foreground font-semibold">
                What it is never used for
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                <li>No advertising, profiling, or resale of your data.</li>
                <li>No training of machine-learning models.</li>
                <li>
                  No posting comments, no editing playlists, no changing your
                  YouTube subscriptions, no reading your private videos.
                </li>
              </ul>
            </div>
            <p>
              Access tokens are stored encrypted on the server running this
              instance and are used only for the two calls above. You can unlink
              the account at any time in TubeShelf&apos;s settings, or revoke
              access from your{" "}
              <a
                className="text-primary underline underline-offset-2"
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noreferrer noopener"
              >
                Google account permissions page
              </a>
              . TubeShelf&apos;s use and transfer of information received from
              Google APIs adheres to the{" "}
              <a
                className="text-primary underline underline-offset-2"
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noreferrer noopener"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. The full details are in
              the{" "}
              <Link
                className="text-primary underline underline-offset-2"
                href="/privacy-policy"
              >
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>

        {/* Who runs it */}
        <section className="mt-16 sm:mt-20">
          <h2 className="text-2xl font-bold tracking-tight">
            Who runs this instance
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            TubeShelf is open-source software licensed under AGPL-3.0 that
            anyone can install on their own server. This particular instance is
            run independently by its own operator, who controls the server and
            the data it holds; it is not affiliated with, endorsed by, or
            sponsored by YouTube or Google. The{" "}
            <Link
              className="text-primary underline underline-offset-2"
              href="/privacy-policy"
            >
              privacy policy
            </Link>{" "}
            sets out what is stored and how to get in touch.
          </p>
        </section>

        {/* Footer */}
        <footer className="mt-16 border-t border-border pt-6 text-sm text-muted-foreground sm:mt-20">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href="/privacy-policy"
              className="underline underline-offset-2 transition hover:text-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="underline underline-offset-2 transition hover:text-foreground"
            >
              Terms of Service
            </Link>
            <Link
              href="/login"
              className="underline underline-offset-2 transition hover:text-foreground"
            >
              Sign in
            </Link>
          </nav>
          <p className="mt-4 text-xs">
            TubeShelf — a clean, chronological YouTube feed. No algorithm. No
            tracking.
          </p>
        </footer>
      </div>
    </div>
  );
}
