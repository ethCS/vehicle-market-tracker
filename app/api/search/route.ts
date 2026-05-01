import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAnalyticsByVehicleId, toAnalyticsResponse } from "@/lib/firestore/prices";
import {
  getVehicleById,
  toVehicleResponse,
  vehicleIdFor
} from "@/lib/firestore/vehicles";
import { publishIngestionMessage } from "@/lib/pubsub";

interface SearchReadyResponse {
  status: "ready";
  vehicle: ReturnType<typeof toVehicleResponse>;
  analytics: ReturnType<typeof toAnalyticsResponse> | null;
}

interface SearchIngestingResponse {
  status: "ingesting";
  vehicleId: string;
}

interface ErrorResponse {
  error: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function GET(
  request: NextRequest
): Promise<
  NextResponse<SearchReadyResponse | SearchIngestingResponse | ErrorResponse>
> {
  try {
    const make = request.nextUrl.searchParams.get("make")?.trim() ?? "";
    const model = request.nextUrl.searchParams.get("model")?.trim() ?? "";
    const yearValue = request.nextUrl.searchParams.get("year")?.trim() ?? "";

    const parsedYear = Number(yearValue);
    const currentYear = new Date().getFullYear();

    if (
      make === "" ||
      model === "" ||
      Number.isNaN(parsedYear) ||
      parsedYear < 1995 ||
      parsedYear > currentYear
    ) {
      return NextResponse.json(
        { error: "Invalid query params. make, model, and year are required." },
        { status: 400 }
      );
    }

    const vehicleId = vehicleIdFor(make, model, parsedYear);

    let vehicle;

    try {
      vehicle = await getVehicleById(vehicleId);
    } catch (error) {
      console.error("GET /api/search firestore lookup failed", {
        vehicleId,
        make,
        model,
        year: parsedYear,
        message: getErrorMessage(error)
      });

      return NextResponse.json(
        { error: "Vehicle lookup failed." },
        { status: 500 }
      );
    }

    if (vehicle !== null) {
      const analytics = await getAnalyticsByVehicleId(vehicleId);
      return NextResponse.json(
        {
          status: "ready",
          vehicle: toVehicleResponse(vehicle),
          analytics: analytics === null ? null : toAnalyticsResponse(analytics)
        },
        { status: 200 }
      );
    }

    try {
      await publishIngestionMessage({
        type: "vehicle",
        make,
        model,
        year: parsedYear
      });
    } catch (error) {
      console.error("GET /api/search pubsub publish failed", {
        vehicleId,
        make,
        model,
        year: parsedYear,
        message: getErrorMessage(error)
      });

      return NextResponse.json(
        { error: "Vehicle ingestion could not be queued." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        status: "ingesting",
        vehicleId
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("GET /api/search failed", {
      message: getErrorMessage(error),
      timestamp: Timestamp.now().toDate().toISOString()
    });
    return NextResponse.json(
      { error: "Failed to process search request." },
      { status: 500 }
    );
  }
}
