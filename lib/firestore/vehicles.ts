import {
  Timestamp,
  type QueryDocumentSnapshot,
  type DocumentData
} from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  bodyClass?: string;
  driveType?: string;
  fuelType?: string;
  engineCylinders?: number;
  trims?: string[];
  specEnrichmentStatus?: "complete" | "unavailable";
  specEnrichmentMessage?: string;
  specEnrichmentCheckedAt?: Timestamp;
  lastUpdated: Timestamp;
}

export interface VehicleResponse {
  id: string;
  make: string;
  model: string;
  year: number;
  bodyClass?: string;
  driveType?: string;
  fuelType?: string;
  engineCylinders?: number;
  trims?: string[];
  specEnrichmentStatus?: "complete" | "unavailable";
  specEnrichmentMessage?: string;
  specEnrichmentCheckedAt?: string;
  lastUpdated: string;
}

const VEHICLES_COLLECTION = "vehicles";

function normalizeVehicle(snapshot: QueryDocumentSnapshot<DocumentData>): Vehicle {
  const data = snapshot.data() as Vehicle;
  return {
    id: data.id,
    make: data.make,
    model: data.model,
    year: data.year,
    bodyClass: data.bodyClass,
    driveType: data.driveType,
    fuelType: data.fuelType,
    engineCylinders: data.engineCylinders,
    trims: data.trims,
    specEnrichmentStatus: data.specEnrichmentStatus,
    specEnrichmentMessage: data.specEnrichmentMessage,
    specEnrichmentCheckedAt: data.specEnrichmentCheckedAt,
    lastUpdated: data.lastUpdated
  };
}

export function vehicleIdFor(make: string, model: string, year: number): string {
  return `${make}_${model}_${year}`.toLowerCase().replace(/ /g, "_");
}

export async function getVehicleById(id: string): Promise<Vehicle | null> {
  const doc = await adminDb.collection(VEHICLES_COLLECTION).doc(id).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() as Vehicle;
  return {
    ...data,
    id: doc.id
  };
}

export async function upsertVehicle(vehicle: Vehicle): Promise<void> {
  const sanitized = Object.fromEntries(
    Object.entries(vehicle).filter(([, value]) => value !== undefined)
  );

  await adminDb
    .collection(VEHICLES_COLLECTION)
    .doc(vehicle.id)
    .set(sanitized, { merge: true });
}

export async function getRecentVehicles(limit = 5): Promise<Vehicle[]> {
  const snapshot = await adminDb
    .collection(VEHICLES_COLLECTION)
    .orderBy("lastUpdated", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map(normalizeVehicle);
}

export function toVehicleResponse(vehicle: Vehicle): VehicleResponse {
  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    bodyClass: vehicle.bodyClass,
    driveType: vehicle.driveType,
    fuelType: vehicle.fuelType,
    engineCylinders: vehicle.engineCylinders,
    trims: vehicle.trims,
    specEnrichmentStatus: vehicle.specEnrichmentStatus,
    specEnrichmentMessage: vehicle.specEnrichmentMessage,
    specEnrichmentCheckedAt:
      vehicle.specEnrichmentCheckedAt === undefined
        ? undefined
        : vehicle.specEnrichmentCheckedAt.toDate().toISOString(),
    lastUpdated: vehicle.lastUpdated.toDate().toISOString()
  };
}
