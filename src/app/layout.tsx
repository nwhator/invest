import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: {
    default: "Bet 2026",
    template: "%s · Bet 2026",
  },
  description: "Track upcoming sports events, compare odds snapshots, and view suggestion probabilities.",
  applicationName: "Bet 2026",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    title: "Bet 2026",
    description: "Track upcoming sports events, compare odds snapshots, and view suggestion probabilities.",
    url: "/",
    siteName: "Bet 2026",
  },
  twitter: {
    card: "summary",
    title: "Bet 2026",
    description: "Track upcoming sports events, compare odds snapshots, and view suggestion probabilities.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-linear-to-b from-emerald-100 via-white to-indigo-100 text-zinc-900 antialiased">
        <div className="sticky top-0 z-10 border-b border-zinc-200/70 bg-white/80 backdrop-blur supports-backdrop-filter:bg-white/60">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-baseline justify-between gap-3">
                <div className="text-sm font-semibold tracking-tight text-zinc-900">
                  <span className="text-emerald-700">Bet</span> <span className="text-indigo-700">2026</span>
                </div>
                <div className="text-xs text-zinc-500 sm:hidden">Odds + picks tracker</div>
              </div>

              <nav className="flex flex-wrap items-center gap-2 text-sm">
                <a
                  className="rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-zinc-700 shadow-sm backdrop-blur hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-zinc-900"
                  href="/"
                >
                  Events
                </a>
                <a
                  className="rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-zinc-700 shadow-sm backdrop-blur hover:border-emerald-200 hover:bg-emerald-50/60 hover:text-zinc-900"
                  href="/suggestions"
                >
                  Suggestions
                </a>
                <a
                  className="rounded-full border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-zinc-700 shadow-sm backdrop-blur hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-zinc-900"
                  href="/admin/ingest-odds"
                >
                  Admin
                </a>
              </nav>

              <div className="hidden text-xs text-zinc-500 sm:block">Odds + picks tracker</div>
            </div>
          </div>
        </div>

        {children}
      </body>
    </html>
  );
}
