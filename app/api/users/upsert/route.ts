import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

type UpsertBody = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
};

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token === "" ? null : token;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const token = bearerToken(request);
    if (token === null) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const body = (await request.json()) as UpsertBody;

    if (body.uid !== decoded.uid) {
      return NextResponse.json({ error: "User mismatch." }, { status: 403 });
    }

    const users = adminDb.collection("users");
    const userRef = users.doc(decoded.uid);
    const existing = await userRef.get();

    const now = Timestamp.now();
    await userRef.set(
      {
        uid: decoded.uid,
        email: body.email ?? decoded.email ?? null,
        displayName: body.displayName ?? decoded.name ?? null,
        photoURL: body.photoURL ?? decoded.picture ?? null,
        provider: "google",
        lastLoginAt: now,
        ...(existing.exists ? {} : { createdAt: now })
      },
      { merge: true }
    );

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `User upsert failed: ${message}` }, { status: 500 });
  }
}
