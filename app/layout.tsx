import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EDITIO — Create. Edit. Post.",
  description: "AI and human-powered video editing for creators.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
