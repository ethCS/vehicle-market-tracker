import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

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

async function readCollection(collectionName: string, limit: number): Promise<UnknownRecord[]> {
  const snapshot = await adminDb.collection(collectionName).limit(limit).get();

  return snapshot.docs.map((doc) => {
    const data = toIsoString(doc.data()) as UnknownRecord;
    return {
      id: doc.id,
      ...data
    };
  });
}

export async function GET(): Promise<NextResponse> {
  try {
    const [vehicles, priceSnapshots, analytics, users] = await Promise.all([
      readCollection("vehicles", 300),
      readCollection("price_snapshots", 1200),
      readCollection("analytics", 300),
      readCollection("users", 300)
    ]);

    const sortedVehicles = vehicles.sort((a, b) => {
      const left = typeof a.lastUpdated === "string" ? Date.parse(a.lastUpdated) : 0;
      const right = typeof b.lastUpdated === "string" ? Date.parse(b.lastUpdated) : 0;
      return right - left;
    });

    const sortedSnapshots = priceSnapshots.sort((a, b) => {
      const left = typeof a.capturedAt === "string" ? Date.parse(a.capturedAt) : 0;
      const right = typeof b.capturedAt === "string" ? Date.parse(b.capturedAt) : 0;
      return right - left;
    });

    const sortedAnalytics = analytics.sort((a, b) => {
      const left = typeof a.lastComputed === "string" ? Date.parse(a.lastComputed) : 0;
      const right = typeof b.lastComputed === "string" ? Date.parse(b.lastComputed) : 0;
      return right - left;
    });

    return NextResponse.json(
      {
        counts: {
          vehicles: sortedVehicles.length,
          priceSnapshots: sortedSnapshots.length,
          analytics: sortedAnalytics.length,
          users: users.length
        },
        vehicles: sortedVehicles,
        priceSnapshots: sortedSnapshots,
        analytics: sortedAnalytics,
        users
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
