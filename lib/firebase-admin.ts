import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, statSync } from "node:fs";
import { readFileSync } from "node:fs";

function resolveCredential() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath === undefined || credentialsPath.trim() === "") {
    return undefined;
  }

  try {
    if (!existsSync(credentialsPath) || !statSync(credentialsPath).isFile()) {
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      return undefined;
    }
  } catch {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return undefined;
  }

  try {
    const raw = readFileSync(credentialsPath, "utf8");
    const parsed = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    if (
      parsed.project_id === undefined ||
      parsed.client_email === undefined ||
      parsed.private_key === undefined
    ) {
      return undefined;
    }

    return cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key
    });
  } catch {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    return undefined;
  }
}

const app =
  getApps()[0] ??
  (() => {
    const credential = resolveCredential();
    const projectId = process.env.FB_ADMIN_PROJECT_ID ?? process.env.GCLOUD_PROJECT;

    if (credential !== undefined) {
      return initializeApp({
        credential,
        projectId
      });
    }

    return initializeApp({
      credential: applicationDefault(),
      projectId
    });
  })();

export const adminDb = getFirestore(app);
export const adminAuth = getAuth(app);
