import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ambassador Platform · Prime Engage",
  description:
    "Operational dashboard for the Prime Engage Ambassador Club — admin and ambassador tooling.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink overflow-x-hidden font-sans">
        {children}
      </body>
    </html>
  );
}
