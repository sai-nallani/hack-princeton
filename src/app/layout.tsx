import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { VibeKanbanProvider } from "@/components/VibeKanbanProvider";
import "../styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Next.js Boilerplate",
  description: "A modern Next.js boilerplate with TypeScript and Tailwind CSS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <VibeKanbanProvider />
        {children}
      </body>
    </html>
  );
}
