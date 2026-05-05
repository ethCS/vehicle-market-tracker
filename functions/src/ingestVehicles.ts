import { PubSub } from "@google-cloud/pubsub";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onMessagePublished } from "firebase-functions/v2/pubsub";

type IngestVehiclePayload = {
  make: string;
  model: string;
  year: number;
};

type MarketCheckListing = {
  vin?: string;
  body_type?: string;
  drivetrain?: string;
  fuel_type?: string;
  engine_cylinders?: number | string;
  trim?: string;
  build?: {
    body_type?: string;
    drivetrain?: string;
    fuel_type?: string;
    cylinders?: number | string;
    trim?: string;
  };
};

type MarketCheckResponse = {
  listings?: MarketCheckListing[];
};

type MarketSpecEnrichment = {
  bodyClass?: string;
  driveType?: string;
  fuelType?: string;
  engineCylinders?: number;
  trims: string[];
  status: "complete" | "unavailable";
  message: string;
};

type RapidApiVinResponse = {
  trim?: string | null;
  specs?: {
    body_class?: string | null;
    drive_type?: string | null;
    fuel_type_primary?: string | null;
    engine_number_of_cylinders?: number | string | null;
    trim?: string | null;
  };
  trims?: Array<{
    name?: string | null;
    make_model_submodel?: {
      submodel?: string | null;
    } | null;
  }>;
};

const pubsub = new PubSub({ projectId: process.env.GCLOUD_PROJECT });

function vehicleIdFor(make: string, model: string, year: number): string {
  return `${make}_${model}_${year}`.toLowerCase().replace(/ /g, "_");
}

function parseCylinders(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return undefined;
}

function normalizeVin(vin: string | undefined): string | undefined {
  if (vin === undefined) {
    return undefined;
  }

  const normalized = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
}

function sanitizeProviderText(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const normalized = trimmed.toLowerCase();
  if (
    trimmed.startsWith("***") ||
    normalized.includes("subscription required") ||
    normalized.includes("unlock this data") ||
    normalized.includes("data is limited") ||
    normalized.includes("if you are still seeing this message") ||
    normalized === "(hidden)" ||
    normalized.includes("hidden)")
  ) {
    return undefined;
  }

  return trimmed;
}

function uniqueTrimValues(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => sanitizeProviderText(value))
        .filter((value): value is string => value !== undefined)
    )
  ).slice(0, 20);
}

function buildSpecEnrichment(
  partial: Omit<MarketSpecEnrichment, "status" | "message">,
  message: string
): MarketSpecEnrichment {
  const hasAnySpec =
    partial.bodyClass !== undefined ||
    partial.driveType !== undefined ||
    partial.fuelType !== undefined ||
    partial.engineCylinders !== undefined ||
    partial.trims.length > 0;

  return {
    ...partial,
    status: hasAnySpec ? "complete" : "unavailable",
    message
  };
}

function mergeSpecEnrichments(
  primary: MarketSpecEnrichment,
  fallback: MarketSpecEnrichment,
  successMessage: string,
  failureMessage: string
): MarketSpecEnrichment {
  const merged = buildSpecEnrichment(
    {
      bodyClass: primary.bodyClass ?? fallback.bodyClass,
      driveType: primary.driveType ?? fallback.driveType,
      fuelType: primary.fuelType ?? fallback.fuelType,
      engineCylinders: primary.engineCylinders ?? fallback.engineCylinders,
      trims: uniqueTrimValues([...primary.trims, ...fallback.trims])
    },
    failureMessage
  );

  return {
    ...merged,
    message: merged.status === "complete" ? successMessage : failureMessage
  };
}

function mostCommon(values: string[]): string | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const counts = new Map<string, number>();
  for (const value of values) {
    const key = sanitizeProviderText(value);
    if (key === undefined) {
      continue;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let best: string | undefined;
  let bestCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }

  return best;
}

function extractSpecEnrichmentFromListings(listings: MarketCheckListing[]): MarketSpecEnrichment {
  const bodyValues: string[] = [];
  const driveValues: string[] = [];
  const fuelValues: string[] = [];
  const trimValues: string[] = [];
  const cylinders: number[] = [];

  for (const listing of listings) {
    const bodyType = listing.body_type ?? listing.build?.body_type;
    const drive = listing.drivetrain ?? listing.build?.drivetrain;
    const fuel = listing.fuel_type ?? listing.build?.fuel_type;
    const trim = listing.trim ?? listing.build?.trim;
    const cyl = parseCylinders(listing.engine_cylinders ?? listing.build?.cylinders);

    if (typeof bodyType === "string" && bodyType.trim() !== "") {
      bodyValues.push(bodyType);
    }

    if (typeof drive === "string" && drive.trim() !== "") {
      driveValues.push(drive);
    }

    if (typeof fuel === "string" && fuel.trim() !== "") {
      fuelValues.push(fuel);
    }

    if (typeof trim === "string" && trim.trim() !== "") {
      trimValues.push(trim);
    }

    if (cyl !== undefined) {
      cylinders.push(cyl);
    }
  }

  return buildSpecEnrichment(
    {
      bodyClass: mostCommon(bodyValues),
      driveType: mostCommon(driveValues),
      fuelType: mostCommon(fuelValues),
      engineCylinders:
        cylinders.length > 0
          ? Math.round(cylinders.reduce((sum, value) => sum + value, 0) / cylinders.length)
          : undefined,
      trims: uniqueTrimValues(trimValues)
    },
    "MarketCheck listings did not include usable spec fields for this query."
  );
}

async function fetchRapidApiVinSpecEnrichment(vin: string): Promise<MarketSpecEnrichment> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return buildSpecEnrichment(
      { trims: [] },
      "RAPIDAPI_KEY is not configured for VIN-based spec enrichment."
    );
  }

  const host = process.env.RAPIDAPI_HOST ?? "car-api2.p.rapidapi.com";
  const response = await fetch(`https://${host}/api/vin/${encodeURIComponent(vin)}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-rapidapi-host": host,
      "x-rapidapi-key": apiKey
    }
  });

  if (!response.ok) {
    return buildSpecEnrichment(
      { trims: [] },
      `RapidAPI VIN decode returned status ${response.status}.`
    );
  }

  const body = (await response.json()) as RapidApiVinResponse;
  return buildSpecEnrichment(
    {
      bodyClass: sanitizeProviderText(body.specs?.body_class ?? undefined),
      driveType: sanitizeProviderText(body.specs?.drive_type ?? undefined),
      fuelType: sanitizeProviderText(body.specs?.fuel_type_primary ?? undefined),
      engineCylinders: parseCylinders(body.specs?.engine_number_of_cylinders ?? undefined),
      trims: uniqueTrimValues([
        body.trim ?? undefined,
        body.specs?.trim ?? undefined,
        ...(body.trims ?? []).flatMap((trim) => [trim.name ?? undefined, trim.make_model_submodel?.submodel ?? undefined])
      ])
    },
    `RapidAPI VIN decode did not return usable spec fields for VIN ${vin}.`
  );
}

async function fetchVehicleSpecEnrichment(
  make: string,
  model: string,
  year: number
): Promise<MarketSpecEnrichment> {
  const apiKey = process.env.MARKETCHECK_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    return buildSpecEnrichment(
      { trims: [] },
      "MARKETCHECK_API_KEY is not configured for spec enrichment."
    );
  }

  const country = process.env.MARKETCHECK_COUNTRY ?? "us";
  const rows = Number(process.env.MARKETCHECK_ROWS ?? 25);
  const normalizedRows = Number.isFinite(rows)
    ? Math.max(1, Math.min(50, Math.trunc(rows)))
    : 25;

  const params = new URLSearchParams({
    api_key: apiKey,
    make,
    model,
    year: year.toString(),
    car_type: "used",
    country,
    rows: normalizedRows.toString()
  });

  const response = await fetch(
    `https://api.marketcheck.com/v2/search/car/active?${params.toString()}`,
    { headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    return buildSpecEnrichment(
      { trims: [] },
      `MarketCheck spec enrichment returned status ${response.status}.`
    );
  }

  const body = (await response.json()) as MarketCheckResponse;
  const listings = body.listings ?? [];
  if (listings.length === 0) {
    return buildSpecEnrichment(
      { trims: [] },
      "MarketCheck did not return listings for VIN-based spec enrichment."
    );
  }

  const marketSpec = extractSpecEnrichmentFromListings(listings);
  const vins = uniqueTrimValues(listings.map((listing) => normalizeVin(listing.vin)));
  let rapidSpec = buildSpecEnrichment(
    { trims: [] },
    vins.length === 0
      ? "MarketCheck listings did not include a VIN for RapidAPI spec enrichment."
      : "RapidAPI VIN decode did not return usable spec fields for the available MarketCheck listings."
  );

  for (const vin of vins) {
    const enrichment = await fetchRapidApiVinSpecEnrichment(vin);
    if (enrichment.status === "complete") {
      rapidSpec = {
        ...enrichment,
        message: `Spec enrichment succeeded via RapidAPI VIN decode for ${vin}.`
      };
      break;
    }
  }

  return mergeSpecEnrichments(
    rapidSpec,
    marketSpec,
    "Spec enrichment succeeded via RapidAPI VIN decode with MarketCheck listing fallback.",
    rapidSpec.message
  );
}

export async function handleVehicleIngest(payload: IngestVehiclePayload): Promise<void> {
  const make = payload.make.trim();
  const model = payload.model.trim();
  const year = payload.year;

  const vpicUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(make)}/modelyear/${year}?format=json`;
  const vpicResponse = await fetch(vpicUrl);

  if (!vpicResponse.ok) {
    throw new Error("NHTSA API request failed.");
  }

  const vpicBody = (await vpicResponse.json()) as {
    Results?: Array<{ Make_Name?: string; Model_Name?: string }>;
  };

  const exists =
    vpicBody.Results?.some(
      (entry) =>
        (entry.Make_Name ?? "").toLowerCase() === make.toLowerCase() &&
        (entry.Model_Name ?? "").toLowerCase() === model.toLowerCase()
    ) ?? false;

  if (!exists) {
    throw new Error("Vehicle not found in NHTSA dataset.");
  }

  const specEnrichment = await fetchVehicleSpecEnrichment(make, model, year);

  const db = getFirestore();
  const vehicleId = vehicleIdFor(make, model, year);

  await db.collection("vehicles").doc(vehicleId).set(
    {
      id: vehicleId,
      make,
      model,
      year,
      bodyClass: specEnrichment.bodyClass ?? null,
      driveType: specEnrichment.driveType ?? null,
      fuelType: specEnrichment.fuelType ?? null,
      engineCylinders: specEnrichment.engineCylinders ?? null,
      trims: specEnrichment.trims,
      specEnrichmentStatus: specEnrichment.status,
      specEnrichmentMessage: specEnrichment.message,
      specEnrichmentCheckedAt: Timestamp.now(),
      lastUpdated: Timestamp.now()
    },
    { merge: true }
  );

  const topicName = process.env.PUBSUB_TOPIC_PRICES ?? "price-ingest";
  await pubsub.topic(topicName).publishMessage({
    data: Buffer.from(
      JSON.stringify({
        vehicleId,
        make,
        model,
        year
      })
    ),
    attributes: {
      type: "prices",
      vehicleId,
      make,
      model,
      year: year.toString()
    }
  });

  logger.info("Vehicle ingested and price event published", {
    vehicleId,
    topicName
  });
}

export const ingestVehicles = onMessagePublished("vehicle-ingest", async (event) => {
  const attributes = event.data.message.attributes ?? {};
  const data = event.data.message.data;

  let payload: IngestVehiclePayload;
  if (data !== undefined) {
    payload = JSON.parse(
      Buffer.from(data, "base64").toString("utf8")
    ) as IngestVehiclePayload;
  } else {
    payload = {
      make: attributes.make ?? "",
      model: attributes.model ?? "",
      year: Number(attributes.year ?? 0)
    };
  }

  if (payload.make.trim() === "" || payload.model.trim() === "" || payload.year <= 0) {
    logger.error("Invalid vehicle ingest payload", { attributes });
    return;
  }

  await handleVehicleIngest(payload);
});
