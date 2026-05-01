import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  addPriceSnapshot,
  getPriceSnapshotsForVehicle,
  type PriceSnapshot,
  upsertAnalytics
} from "@/lib/firestore/prices";
import { type Vehicle, upsertVehicle, vehicleIdFor } from "@/lib/firestore/vehicles";
import {
  computeBuyScore,
  computePriceDirection,
  computeVolatility
} from "@/lib/analytics";
import { publishPriceMessage } from "@/lib/pubsub";

interface PubSubPushEnvelope {
  message: {
    data?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

interface IngestVehiclePayload {
  make: string;
  model: string;
  year: number;
}

interface IngestPricesPayload {
  vehicleId: string;
  make: string;
  year: number;
}

function parseCarQueryJsonp(raw: string): unknown {
  const start = raw.indexOf("(");
  const end = raw.lastIndexOf(")");

  if (start < 0 || end <= start) {
    throw new Error("Invalid CarQuery JSONP response.");
  }

  const payload = raw.slice(start + 1, end);
  return JSON.parse(payload) as unknown;
}

function simulatePrice(make: string, year: number): number {
  const basePrice: Record<string, number> = {
    toyota: 28000,
    honda: 27000,
    ford: 32000,
    chevrolet: 31000,
    bmw: 52000,
    mercedes: 58000,
    audi: 50000,
    subaru: 29000,
    default: 30000
  };

  const base = basePrice[make.toLowerCase()] ?? basePrice.default;
  const age = new Date().getFullYear() - year;
  const depreciation = Math.pow(0.85, age);
  const noise = 1 + (Math.random() - 0.5) * 0.12;

  return Math.round(base * depreciation * noise);
}

async function computeAndStoreAnalytics(vehicleId: string): Promise<void> {
  const snapshots = await getPriceSnapshotsForVehicle(vehicleId, 90);

  if (snapshots.length === 0) {
    return;
  }

  const now = Timestamp.now();
  const thirtyDaysAgo = now.toDate();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thresholdMillis = thirtyDaysAgo.getTime();

  const snapshots30d = snapshots.filter(
    (snapshot) => snapshot.capturedAt.toMillis() >= thresholdMillis
  );

  const avgPrice30d =
    snapshots30d.length === 0
      ? snapshots[0].avgPrice
      : Math.round(
          snapshots30d.reduce((sum, item) => sum + item.avgPrice, 0) /
            snapshots30d.length
        );

  const avgPrice90d = Math.round(
    snapshots.reduce((sum, item) => sum + item.avgPrice, 0) / snapshots.length
  );

  const volatility = computeVolatility(snapshots);
  const priceDirection = computePriceDirection(snapshots);
  const buyScore = computeBuyScore(priceDirection, volatility);

  await upsertAnalytics(vehicleId, {
    vehicleId,
    avgPrice30d,
    avgPrice90d,
    volatility,
    priceDirection,
    buyScore,
    lastComputed: now
  });
}

async function handleVehicleIngest(payload: IngestVehiclePayload): Promise<void> {
  const { make, model, year } = payload;
  const vehicleId = vehicleIdFor(make, model, year);

  const vpicUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
  const vpicResponse = await fetch(vpicUrl, { cache: "no-store" });

  if (!vpicResponse.ok) {
    throw new Error("Failed to fetch NHTSA model metadata.");
  }

  const vpicBody = (await vpicResponse.json()) as {
    Results?: Array<{ Make_Name?: string; Model_Name?: string }>;
  };

  const matchedModel =
    vpicBody.Results?.find(
      (entry) =>
        (entry.Model_Name ?? "").toLowerCase() === model.toLowerCase() &&
        (entry.Make_Name ?? "").toLowerCase() === make.toLowerCase()
    ) ?? null;

  if (matchedModel === null) {
    throw new Error("Requested make/model/year was not found in NHTSA results.");
  }

  const carQueryUrl = `https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`;
  const carQueryResponse = await fetch(carQueryUrl, { cache: "no-store" });

  if (!carQueryResponse.ok) {
    throw new Error("Failed to fetch CarQuery trim data.");
  }

  const carQueryRaw = await carQueryResponse.text();
  const parsed = parseCarQueryJsonp(carQueryRaw) as {
    Trims?: Array<{
      model_trim?: string;
      model_drive?: string;
      model_fuel_type?: string;
      model_engine_cyl?: string;
      model_body?: string;
    }>;
  };

  const trims = parsed.Trims ?? [];
  const firstTrim = trims[0];

  const vehicleDoc: Vehicle = {
    id: vehicleId,
    make,
    model,
    year,
    bodyClass: firstTrim?.model_body ?? undefined,
    driveType: firstTrim?.model_drive ?? undefined,
    fuelType: firstTrim?.model_fuel_type ?? undefined,
    engineCylinders:
      firstTrim?.model_engine_cyl === undefined
        ? undefined
        : Number(firstTrim.model_engine_cyl),
    trims: trims
      .map((trim) => trim.model_trim)
      .filter((trim): trim is string => trim !== undefined && trim.trim() !== ""),
    lastUpdated: Timestamp.now()
  };

  await upsertVehicle(vehicleDoc);
  await publishPriceMessage({
    vehicleId,
    make,
    year
  });
}

async function handlePriceIngest(payload: IngestPricesPayload): Promise<void> {
  const sampleCount = 10;
  const prices = Array.from({ length: sampleCount }, () =>
    simulatePrice(payload.make, payload.year)
  );

  const avgPrice = Math.round(
    prices.reduce((sum, value) => sum + value, 0) / prices.length
  );

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  await addPriceSnapshot({
    vehicleId: payload.vehicleId,
    capturedAt: Timestamp.now(),
    sampleSize: prices.length,
    avgPrice,
    minPrice,
    maxPrice,
    source: "simulated"
  });

  await computeAndStoreAnalytics(payload.vehicleId);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const secret = process.env.INGEST_SECRET;
    const authHeader = request.headers.get("authorization") ?? "";

    if (
      secret === undefined ||
      secret.trim() === "" ||
      authHeader !== `Bearer ${secret}`
    ) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const envelope = (await request.json()) as PubSubPushEnvelope;
    const encodedData = envelope.message.data;

    if (encodedData === undefined) {
      return NextResponse.json({ error: "Pub/Sub message data is missing." }, { status: 400 });
    }

    const decodedRaw = Buffer.from(encodedData, "base64").toString("utf8");
    const decoded = JSON.parse(decodedRaw) as Record<string, unknown>;
    const type = envelope.message.attributes?.type;

    if (type === "vehicle") {
      const payload: IngestVehiclePayload = {
        make: String(decoded.make ?? envelope.message.attributes?.make ?? ""),
        model: String(decoded.model ?? envelope.message.attributes?.model ?? ""),
        year: Number(decoded.year ?? envelope.message.attributes?.year ?? 0)
      };
      await handleVehicleIngest(payload);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    if (type === "prices") {
      const payload: IngestPricesPayload = {
        vehicleId: String(
          decoded.vehicleId ?? envelope.message.attributes?.vehicleId ?? ""
        ),
        make: String(decoded.make ?? envelope.message.attributes?.make ?? ""),
        year: Number(decoded.year ?? envelope.message.attributes?.year ?? 0)
      };
      await handlePriceIngest(payload);
      return NextResponse.json({ status: "ok" }, { status: 200 });
    }

    return NextResponse.json(
      { error: "Unsupported ingestion message type." },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/ingest failed", error);
    return NextResponse.json({ error: "Ingestion failed." }, { status: 500 });
  }
}
