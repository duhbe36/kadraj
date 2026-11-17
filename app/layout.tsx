import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kadraj - Özel Sinema & Dizi Kulübü",
  description: "Arkadaş grubuna özel film ve dizi arşiv platformu",
  icons: {
    icon: "/icon.jpg?v=2",
    apple: "/icon.jpg?v=2",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}