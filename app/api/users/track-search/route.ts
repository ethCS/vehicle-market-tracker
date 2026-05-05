import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

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
    const body = (await request.json()) as { vehicleId?: unknown };

    if (typeof body.vehicleId !== "string" || body.vehicleId.trim() === "") {
      return NextResponse.json({ error: "Missing vehicleId." }, { status: 400 });
    }

    const vehicleId = body.vehicleId.trim();

    await adminDb
      .collection("users")
      .doc(decoded.uid)
      .collection("searches")
      .doc(vehicleId)
      .set({ vehicleId, lastSearchedAt: Timestamp.now() }, { merge: true });

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Track search failed: ${message}` }, { status: 500 });
  }
}
