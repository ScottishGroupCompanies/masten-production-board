import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-instrument-sans",
  adjustFontFallback: true,
});

export const metadata: Metadata = {
  title: "Masten Production Board",
  description: "Shop floor board for Masten Fine Framing work orders in Greenwood Village.",
  robots: { index: false, follow: false },
};

// Pages read the database and the session. Skip build-time prerender so `next build`
// does not need production credentials and does not migrate D1 during the build.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className={`${sans.className} min-h-full bg-background text-base leading-normal tracking-normal text-foreground`}>
        <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
          <TooltipProvider>
            {children}
            <Toaster position="top-right" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
