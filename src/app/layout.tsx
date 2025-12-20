import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bet 2026",
  description: "Bet 2026",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <div className="text-sm font-semibold tracking-tight">Bet 2026</div>
            <div className="text-xs text-zinc-500">Odds + picks tracker</div>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
