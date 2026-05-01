import { PubSub } from "@google-cloud/pubsub";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onMessagePublished } from "firebase-functions/v2/pubsub";

type IngestVehiclePayload = {
  make: string;
  model: string;
  year: number;
};

type CarQueryResult = {
  Trims?: Array<{
    model_trim?: string;
    model_drive?: string;
    model_fuel_type?: string;
    model_engine_cyl?: string;
    model_body?: string;
  }>;
};

const pubsub = new PubSub({ projectId: process.env.GCLOUD_PROJECT });

function vehicleIdFor(make: string, model: string, year: number): string {
  return `${make}_${model}_${year}`.toLowerCase().replace(/ /g, "_");
}

function parseCarQueryJsonp(raw: string): CarQueryResult {
  const openParenIndex = raw.indexOf("(");
  const closeParenIndex = raw.lastIndexOf(")");
  if (openParenIndex < 0 || closeParenIndex <= openParenIndex) {
    throw new Error("Unexpected CarQuery response format.");
  }

  return JSON.parse(raw.slice(openParenIndex + 1, closeParenIndex)) as CarQueryResult;
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

  const carQueryUrl = `https://www.carqueryapi.com/api/0.3/?cmd=getTrims&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${year}`;
  const carQueryResponse = await fetch(carQueryUrl);

  if (!carQueryResponse.ok) {
    throw new Error("CarQuery API request failed.");
  }

  const carQueryParsed = parseCarQueryJsonp(await carQueryResponse.text());
  const trims = carQueryParsed.Trims ?? [];
  const firstTrim = trims[0];

  const db = getFirestore();
  const vehicleId = vehicleIdFor(make, model, year);

  await db.collection("vehicles").doc(vehicleId).set(
    {
      id: vehicleId,
      make,
      model,
      year,
      bodyClass: firstTrim?.model_body ?? null,
      driveType: firstTrim?.model_drive ?? null,
      fuelType: firstTrim?.model_fuel_type ?? null,
      engineCylinders:
        firstTrim?.model_engine_cyl === undefined
          ? null
          : Number(firstTrim.model_engine_cyl),
      trims: trims
        .map((trim) => trim.model_trim)
        .filter((trim): trim is string => trim !== undefined && trim.trim() !== ""),
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
        year
      })
    ),
    attributes: {
      type: "prices",
      vehicleId,
      make,
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
