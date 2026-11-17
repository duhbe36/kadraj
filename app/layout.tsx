import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kadraj - Özel Sinema & Dizi Kulübü",
  description: "Kişisel ve Ortak Film/Dizi Arşivi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="h-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col bg-[#0d1117] text-gray-100 antialiased`}
        suppressHydrationWarning={true}
      >
        {children}
      </body>
    </html>
  );
}