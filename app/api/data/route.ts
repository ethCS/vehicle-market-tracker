import { NextRequest, NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

type UnknownRecord = Record<string, unknown>;

function toIsoString(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toIsoString(item));
  }

  if (value !== null && typeof value === "object") {
    const objectValue = value as UnknownRecord;
    const converted: UnknownRecord = {};

    for (const [key, nested] of Object.entries(objectValue)) {
      converted[key] = toIsoString(nested);
    }

    return converted;
  }

  return value;
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token === "" ? null : token;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const token = bearerToken(request);
    if (token === null) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;

    // Fetch user profile doc
    const userSnapshot = await adminDb.collection("users").doc(uid).get();
    const userRecord = userSnapshot.exists
      ? [{ id: userSnapshot.id, ...(toIsoString(userSnapshot.data()) as UnknownRecord) }]
      : [];

    // Fetch vehicleIds this user has searched
    const searchesSnapshot = await adminDb
      .collection("users")
      .doc(uid)
      .collection("searches")
      .get();

    const vehicleIds = searchesSnapshot.docs.map((doc) => doc.id);

    if (vehicleIds.length === 0) {
      return NextResponse.json(
        {
          counts: { vehicles: 0, priceSnapshots: 0, analytics: 0, users: userRecord.length },
          vehicles: [],
          priceSnapshots: [],
          analytics: [],
          users: userRecord
        },
        { status: 200 }
      );
    }

    // Fetch vehicles, analytics, and price snapshots for those vehicleIds in parallel
    const [vehicleDocs, analyticsDocs, snapshotDocs] = await Promise.all([
      Promise.all(
        vehicleIds.map((id) => adminDb.collection("vehicles").doc(id).get())
      ),
      Promise.all(
        vehicleIds.map((id) => adminDb.collection("analytics").doc(id).get())
      ),
      adminDb
        .collection("price_snapshots")
        .where("vehicleId", "in", vehicleIds.slice(0, 30))
        .get()
    ]);

    const vehicles = vehicleDocs
      .filter((doc) => doc.exists)
      .map((doc) => ({ id: doc.id, ...(toIsoString(doc.data()) as UnknownRecord) }));

    const analytics = analyticsDocs
      .filter((doc) => doc.exists)
      .map((doc) => ({ id: doc.id, ...(toIsoString(doc.data()) as UnknownRecord) }));

    const priceSnapshots = snapshotDocs.docs.map((doc) => ({
      id: doc.id,
      ...(toIsoString(doc.data()) as UnknownRecord)
    }));

    return NextResponse.json(
      {
        counts: {
          vehicles: vehicles.length,
          priceSnapshots: priceSnapshots.length,
          analytics: analytics.length,
          users: userRecord.length
        },
        vehicles,
        priceSnapshots,
        analytics,
        users: userRecord
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { error: `Failed to load stored DB data: ${message}` },
      { status: 500 }
    );
  }
}

