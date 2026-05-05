import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

declare global {
  interface Window {
    __FB_CONFIG__?: Partial<FirebaseClientConfig>;
  }
}

function getClientConfig(): FirebaseClientConfig {
  const runtimeConfig = typeof window !== "undefined" ? window.__FB_CONFIG__ : undefined;
  return {
    apiKey: runtimeConfig?.apiKey ?? process.env.NEXT_PUBLIC_FB_API_KEY ?? "",
    authDomain: runtimeConfig?.authDomain ?? process.env.NEXT_PUBLIC_FB_AUTH_DOMAIN ?? "",
    projectId: runtimeConfig?.projectId ?? process.env.NEXT_PUBLIC_FB_PROJECT_ID ?? "",
    storageBucket: runtimeConfig?.storageBucket ?? process.env.NEXT_PUBLIC_FB_STORAGE_BUCKET ?? "",
    messagingSenderId:
      runtimeConfig?.messagingSenderId ?? process.env.NEXT_PUBLIC_FB_MESSAGING_SENDER_ID ?? "",
    appId: runtimeConfig?.appId ?? process.env.NEXT_PUBLIC_FB_APP_ID ?? ""
  };
}

export function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null;
  const clientConfig = getClientConfig();
  if (clientConfig.apiKey === "") return null;
  return getApps().length === 0 ? initializeApp(clientConfig) : getApp();
}

export function getClientAuth(): Auth | null {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
}
