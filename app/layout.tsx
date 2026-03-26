import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dither Studio",
  description: "Convert logos into dithered dot coordinates for interactive canvas experiences",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}