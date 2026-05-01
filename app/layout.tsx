import type { Metadata } from "next";
import { Manrope, Oswald } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import ColorBends from "@/components/ColorBends";
import DotField from "@/components/DotField";
import "./globals.css";
import "../reactbits-background.css";

type FirebaseRuntimeConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const displayFont = Oswald({
  subsets: ["latin"],
  variable: "--font-display"
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  title: "Vehicle Market Tracker",
  description:
    "Search vehicle pricing trends, volatility, and buy-versus-wait recommendations."
};

export const dynamic = "force-dynamic";

function getFirebaseRuntimeConfig(): FirebaseRuntimeConfig {
  const apiKey = process.env.FB_WEB_API_KEY ?? process.env.NEXT_PUBLIC_FB_API_KEY ?? "";
  const authDomain =
    process.env.FB_WEB_AUTH_DOMAIN ?? process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN ?? "";
  const projectId =
    process.env.FB_WEB_PROJECT_ID ?? process.env.NEXT_PUBLIC_FB_PROJECT_ID ?? "";
  const storageBucket =
    process.env.FB_WEB_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET ?? "";
  const messagingSenderId =
    process.env.FB_WEB_MESSAGING_SENDER_ID ??
    process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID ??
    "";
  const appId = process.env.FB_WEB_APP_ID ?? process.env.NEXT_PUBLIC_FB_APP_ID ?? "";

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId
  };
}

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>): JSX.Element {
  const runtimeFirebaseConfig = getFirebaseRuntimeConfig();
  const serializedConfig = JSON.stringify(runtimeFirebaseConfig).replace(/</g, "\\u003c");

  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable} relative isolate bg-[#120f17] text-ink antialiased`}>
        <ColorBends
          colors={["#a855f7", "#d946ef", "#7c3aed"]}
          rotation={90}
          speed={0.2}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={0.5}
          parallax={0.5}
          noise={0.15}
          iterations={1}
          intensity={1.3}
          bandWidth={6}
          transparent
        />
        <DotField
          dotRadius={1.5}
          dotSpacing={14}
          bulgeStrength={67}
          glowRadius={160}
          sparkle={false}
          waveAmplitude={0}
          className="pointer-events-none"
          style={{ position: "fixed", inset: 0, zIndex: 5 }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__FB_CONFIG__ = ${serializedConfig};`
          }}
        />
        <div className="relative z-10">
          <AuthProvider>{children}</AuthProvider>
        </div>
      </body>
    </html>
  );
}
