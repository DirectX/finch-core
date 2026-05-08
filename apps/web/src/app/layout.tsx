import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Finch — Contract Intelligence",
  description: "Contract negotiation and clause analysis",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
        <Providers>
          <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
              <Link href="/" className="font-semibold text-lg tracking-tight">
                Finch
              </Link>
              <nav className="flex gap-4 text-sm">
                <Link href="/" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                  Dashboard
                </Link>
                <Link href="/upload" className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
                  Upload
                </Link>
              </nav>
            </div>
          </header>
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
