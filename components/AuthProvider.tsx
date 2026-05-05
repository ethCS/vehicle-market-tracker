"use client";

import {
  type AuthError,
  GoogleAuthProvider,
  getIdToken,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { getClientAuth } from "@/lib/firebase-client";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  authError: null,
  signInWithGoogle: async () => {},
  signOutUser: async () => {},
  clearAuthError: () => {}
});

function getAuthErrorMessage(error: unknown): string {
  const authError = error as Partial<AuthError>;
  const code = authError.code;

  if (code === "auth/popup-blocked") {
    return "Your browser blocked the popup. We switched to a redirect sign-in flow.";
  }

  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized in Firebase Auth settings yet.";
  }

  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled in Firebase Authentication providers.";
  }

  if (code === "auth/invalid-api-key") {
    return "Firebase web config is invalid in this environment.";
  }

  if (code === "auth/network-request-failed") {
    return "Network error while contacting Google. Please try again.";
  }

  return "Sign-in failed. Please try again.";
}

async function upsertUserProfile(user: User): Promise<void> {
  const token = await getIdToken(user);
  await fetch("/api/users/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL
    })
  });
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({
  children
}: {
  children: React.ReactNode;
}): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getClientAuth();
    if (!auth) { setLoading(false); return; }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser !== null) {
        setAuthError(null);
        void upsertUserProfile(firebaseUser);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<void> => {
    const auth = getClientAuth();
    if (!auth) {
      setAuthError("Firebase Auth is not configured in this environment.");
      return;
    }

    setAuthError(null);
    const provider = new GoogleAuthProvider();

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const authError = error as Partial<AuthError>;

      if (
        authError.code === "auth/popup-blocked" ||
        authError.code === "auth/operation-not-supported-in-this-environment"
      ) {
        setAuthError("Popup blocked. Redirecting to Google sign-in...");
        await signInWithRedirect(auth, provider);
        return;
      }

      if (authError.code !== "auth/popup-closed-by-user") {
        setAuthError(getAuthErrorMessage(error));
      }
    }
  }, []);

  const signOutUser = useCallback(async (): Promise<void> => {
    const auth = getClientAuth();
    if (!auth) return;
    await signOut(auth);
    setAuthError(null);
  }, []);

  const clearAuthError = useCallback((): void => {
    setAuthError(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, authError, signInWithGoogle, signOutUser, clearAuthError }),
    [user, loading, authError, signInWithGoogle, signOutUser, clearAuthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
