import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "./video-editor-appcut/components/ui/sonner";
import { TooltipProvider } from "./video-editor-appcut/components/ui/tooltip";
import { ThemeProvider } from "./video-editor-appcut/components/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "AppCut",
  description:
    "A simple but powerful video editor that gets the job done. In your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster />
            <Script
              src="https://app.databuddy.cc/databuddy.js"
              strategy="afterInteractive"
              async
              data-client-id="UP-Wcoy5arxFeK7oyjMMZ"
              data-track-attributes={true}
              data-track-errors={true}
              data-track-outgoing-links={true}
              data-track-web-vitals={true}
            />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
} 