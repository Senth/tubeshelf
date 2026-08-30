import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import "plyr/dist/plyr.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { RememberSession } from "@/components/RememberSession";

export const metadata: Metadata = {
  // "TubeShelf" has to read the same here as on the Google OAuth consent
  // screen; verification compares the two names.
  title: "TubeShelf — Your Clean YouTube Feed",
  description:
    "TubeShelf is a self-hosted YouTube subscription feed with chronological ordering",
  applicationName: "TubeShelf",
  icons: {
    icon: [
      { url: "/icon-light.svg", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.svg", media: "(prefers-color-scheme: dark)" },
      { url: "/icon-flat.svg" },
    ],
    apple: [
      { url: "/icon-light.svg", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark.svg", media: "(prefers-color-scheme: dark)" },
    ],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'system';
                  if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <RememberSession />
          <Suspense fallback={null}>{children}</Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
