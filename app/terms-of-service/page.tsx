import type { Metadata } from "next";
import { LegalContact, LegalPage, LegalSection } from "@/components/LegalPage";
import { readSettings } from "@/lib/settingsStore";

export const metadata: Metadata = {
  title: "Terms of Service - TubeShelf",
  description:
    "The terms that apply when you use this TubeShelf instance.",
};

// The contact address comes from the database, so this cannot be prerendered.
export const dynamic = "force-dynamic";

const LAST_UPDATED = "4 August 2026";

export default async function TermsOfServicePage() {
  const settings = await readSettings().catch(() => null);
  const contactEmail = settings?.legalContactEmail || "";

  return (
    <LegalPage
      title="Terms of Service"
      intro="TubeShelf is self-hosted software. These terms apply between you and whoever operates this particular instance."
      lastUpdated={LAST_UPDATED}
    >
      <LegalSection title="Accepting these terms">
        <p>
          By creating an account on this instance or using it, you agree to
          these terms. If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection title="What the service is">
        <p>
          TubeShelf presents the YouTube channels you subscribe to as a plain
          chronological feed, with playback, watch tracking and lists. It is
          open-source software licensed under the GNU Affero General Public
          License v3. This instance is run by an independent{" "}
          <strong>operator</strong>, not by the TubeShelf authors and not by
          Google or YouTube. TubeShelf is not affiliated with, endorsed by, or
          sponsored by YouTube or Google.
        </p>
      </LegalSection>

      <LegalSection title="Your account">
        <p>
          You are responsible for keeping your credentials secret and for what
          happens under your account. Give accurate details when registering,
          and tell the operator if you believe your account has been misused.
          Accounts are for individual use; do not share them.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <ul>
          <li>
            Do not use the service to break the law, or to infringe anyone
            else&apos;s rights.
          </li>
          <li>
            Do not attempt to gain access to other users&apos; accounts or data,
            to the server, or to any system connected to it.
          </li>
          <li>
            Do not overload the service — no automated scraping, flooding, or
            deliberate abuse of the feed refresh or API endpoints.
          </li>
          <li>
            Do not use the service to download, redistribute or republish
            YouTube content in ways YouTube&apos;s own terms forbid.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="YouTube and Google">
        <p>
          TubeShelf uses YouTube API Services. By using this instance you also
          agree to be bound by the{" "}
          <a
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer noopener"
          >
            YouTube Terms of Service
          </a>
          , and your use of Google services is governed by the{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google Privacy Policy
          </a>
          .
        </p>
        <p>
          Linking a Google account is optional and enables only the like
          feature. You may unlink at any time in your settings, or revoke
          TubeShelf&apos;s access from your{" "}
          <a
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google account&apos;s third-party access page
          </a>
          . All video and channel content belongs to its respective owners;
          TubeShelf claims no rights over it.
        </p>
      </LegalSection>

      <LegalSection title="Availability and changes">
        <p>
          The operator may change, suspend or shut down this instance at any
          time, with or without notice, and is under no obligation to retain
          your data after doing so. Export your subscriptions if you want a copy
          you control.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          You may delete your account at any time from your settings. The
          operator may suspend or remove an account that breaches these terms or
          endangers the service or its other users.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The service is provided <strong>&quot;as is&quot;</strong>, without
          warranty of any kind, express or implied, including but not limited to
          the warranties of merchantability, fitness for a particular purpose
          and non-infringement. The operator does not guarantee that the service
          will be available, uninterrupted, accurate, or free of defects.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither the operator nor the
          authors of the TubeShelf software are liable for any indirect,
          incidental, special or consequential damages, or for any loss of data,
          profits or goodwill, arising out of your use of or inability to use
          the service. Nothing here limits liability that cannot be limited
          under applicable law.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          Updated terms appear on this page with a new &quot;last updated&quot;
          date. Continuing to use the service after a change means you accept
          the revised terms.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <LegalContact email={contactEmail} />
      </LegalSection>
    </LegalPage>
  );
}
