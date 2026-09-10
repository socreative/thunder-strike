import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const GA_ID = "G-8P4HWC5HHF";

export const metadata: Metadata = {
  title: "Thunder Strike",
  applicationName: "Thunder Strike",
  description:
    "An isometric attack helicopter game in the spirit of Desert Strike, rendered with Three.js WebGPU.",
  manifest: "/manifest.webmanifest",
  // Home Screen web app on iOS: no Safari chrome, translucent status bar.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Thunder Strike",
  },
  formatDetection: { telephone: false },
  // Next emits the standard mobile-web-app-capable; older iOS only reads the Apple name.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Lets the page extend under the notch; the HUD pads itself with the safe-area insets.
  viewportFit: "cover",
  themeColor: "#0b0e0c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "production" && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
