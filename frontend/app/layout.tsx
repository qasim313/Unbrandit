import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "APK WhiteLabel Studio",
  description: "White-label Android apps at scale"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-950 text-slate-50">
        <div className="min-h-screen flex flex-col">{children}</div>
      </body>
    </html>
  );
}

