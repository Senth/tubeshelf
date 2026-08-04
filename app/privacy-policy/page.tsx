import type { Metadata } from "next";
import { LegalContact, LegalPage, LegalSection } from "@/components/LegalPage";
import { readSettings } from "@/lib/settingsStore";

export const metadata: Metadata = {
  title: "Privacy Policy - TubeShelf",
  description:
    "How this TubeShelf instance handles your account data and your linked Google account.",
};

// The contact address comes from the database, so this cannot be prerendered.
export const dynamic = "force-dynamic";

const LAST_UPDATED = "4 August 2026";

export default async function PrivacyPolicyPage() {
  const settings = await readSettings().catch(() => null);
  const contactEmail = settings?.legalContactEmail || "";

  return (
    <LegalPage
      title="Privacy Policy"
      intro="TubeShelf is self-hosted software. This policy describes the data held by this particular instance and what it is used for."
      lastUpdated={LAST_UPDATED}
    >
      <LegalSection title="Who is responsible for your data">
        <p>
          TubeShelf is open-source software that anyone can run on their own
          server. The person or organisation operating this instance — the{" "}
          <strong>operator</strong> — controls the server, the database and any
          backups, and is responsible for the data described below. The authors
          of the TubeShelf software do not host this instance, receive no data
          from it, and have no access to it.
        </p>
      </LegalSection>

      <LegalSection title="What this instance stores">
        <p>
          Everything below is stored in a database file on the operator&apos;s
          server. Nothing is sent to the TubeShelf project or to any analytics
          or advertising service.
        </p>
        <ul>
          <li>
            <strong>Account details</strong> — your name, email address, and
            either a hashed password or the identifier returned by the
            single-sign-on provider you used. Passwords are never stored in
            readable form.
          </li>
          <li>
            <strong>Sessions</strong> — a session identifier held in a cookie so
            you stay signed in. This cookie is strictly necessary for the site
            to work; there are no advertising or tracking cookies.
          </li>
          <li>
            <strong>Your subscriptions and lists</strong> — the YouTube channels
            you follow, plus any tags and custom lists you create.
          </li>
          <li>
            <strong>Viewing activity</strong> — which videos you have marked as
            watched, your playback position in a video, your watch-later list
            and your watch history.
          </li>
          <li>
            <strong>Preferences</strong> — theme, sort order, player and
            caption settings, and per-channel overrides.
          </li>
          <li>
            <strong>Cached video metadata</strong> — titles, descriptions,
            thumbnails, durations and publication dates for videos from the
            channels you follow. This is public YouTube data, cached so the feed
            loads quickly, and it is pruned automatically according to the
            retention window configured for the instance.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Linking a Google account">
        <p>
          Linking a Google account is entirely optional. TubeShelf works without
          one; the only thing it enables is liking a video on YouTube from
          inside the player, and the optional auto-like feature.
        </p>
        <ul>
          <li>
            <strong>Scope requested</strong> —{" "}
            <code>https://www.googleapis.com/auth/youtube.force-ssl</code>. This
            is the narrowest scope Google offers that permits setting a rating
            on a video.
          </li>
          <li>
            <strong>What it is used for</strong> — reading whether you have
            already liked the video you are watching, and setting or removing
            your like when you ask for it (or when auto-like is enabled and you
            pass the threshold you configured). Nothing else.
          </li>
          <li>
            <strong>What is stored</strong> — the OAuth access and refresh
            tokens Google issues, encrypted at rest, together with the label of
            the linked account and the granted scope. Tokens are used only to
            call the YouTube Data API on your behalf.
          </li>
          <li>
            <strong>Unlinking</strong> — you can unlink at any time from your
            TubeShelf settings. Unlinking asks Google to revoke the token and
            deletes the stored tokens from this instance. You can also revoke
            access from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer noopener"
            >
              Google account&apos;s third-party access page
            </a>
            .
          </li>
        </ul>
        <p>
          <strong>Limited Use.</strong> TubeShelf&apos;s use and transfer of
          information received from Google APIs to any other app adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Data obtained from Google
          APIs is never sold, never used for advertising or profiling, and never
          used to train machine-learning models. It is not transferred to anyone
          except as needed to provide the like feature described above, or where
          required by law.
        </p>
      </LegalSection>

      <LegalSection title="Who else your browser and this server talk to">
        <ul>
          <li>
            <strong>YouTube and Google</strong> — to fetch public video and
            channel metadata, to stream video, and, if you linked an account, to
            call the YouTube Data API. Their handling of that traffic is covered
            by the{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer noopener"
            >
              Google Privacy Policy
            </a>
            .
          </li>
          <li>
            <strong>Thumbnail images</strong> — served through this
            instance&apos;s own image proxy, so your browser does not contact
            Google&apos;s image hosts directly for them.
          </li>
          <li>
            <strong>SponsorBlock</strong> — when SponsorBlock is enabled, the
            player queries{" "}
            <a
              href="https://sponsor.ajay.app/"
              target="_blank"
              rel="noreferrer noopener"
            >
              sponsor.ajay.app
            </a>{" "}
            for sponsor segments using a partial hash of the video id. It can be
            turned off in settings.
          </li>
          <li>
            <strong>Your single-sign-on provider</strong> — only if the operator
            configured one and you sign in with it.
          </li>
        </ul>
        <p>
          TubeShelf contains no analytics, no advertising and no third-party
          tracking scripts.
        </p>
      </LegalSection>

      <LegalSection title="Retention and deletion">
        <p>
          Your account data is kept for as long as your account exists. From
          your TubeShelf settings you can clear your watch history, remove your
          subscriptions, reset your preferences, unlink your Google account, and
          delete your account entirely. Deleting your account removes your
          profile, sessions, subscriptions, viewing activity and stored Google
          tokens from the database. Cached public video metadata is shared
          between users and expires on the instance&apos;s retention schedule.
        </p>
        <p>
          Server backups, if the operator keeps any, are outside the
          application&apos;s control — ask the operator about their backup
          retention.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Passwords are hashed, and Google OAuth tokens and single-sign-on
          client secrets are encrypted at rest. The overall security of your
          data also depends on how the operator runs the server — transport
          encryption, patching and access control are their responsibility.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          This instance is not directed at children under 13, and accounts
          should not be created for them.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          Updates to this policy appear on this page with a new &quot;last
          updated&quot; date. Material changes to how a linked Google account is
          used will be reflected here before they take effect.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <LegalContact email={contactEmail} />
      </LegalSection>
    </LegalPage>
  );
}
