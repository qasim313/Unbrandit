import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Unbrandit – APK WhiteLabel Studio",
  description: "Automate Android app white-labeling. Rebrand, sign, and distribute APKs and AABs at scale.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-gh-bg text-gh-default antialiased">
        {children}
      </body>
    </html>
  );
}
