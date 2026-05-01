import { NextRequest, NextResponse } from "next/server";
import {
  getAnalyticsByVehicleId,
  getPriceSnapshotsForVehicle,
  toAnalyticsResponse,
  toPriceSnapshotResponse
} from "@/lib/firestore/prices";
import { getVehicleById, toVehicleResponse } from "@/lib/firestore/vehicles";

interface VehicleDetailResponse {
  vehicle: ReturnType<typeof toVehicleResponse>;
  analytics: ReturnType<typeof toAnalyticsResponse> | null;
  priceSnapshots: ReturnType<typeof toPriceSnapshotResponse>[];
}

interface ErrorResponse {
  error: string;
}

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
): Promise<NextResponse<VehicleDetailResponse | ErrorResponse>> {
  try {
    const vehicleId = context.params.id;
    const vehicle = await getVehicleById(vehicleId);

    if (vehicle === null) {
      return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    }

    const [priceSnapshots, analytics] = await Promise.all([
      getPriceSnapshotsForVehicle(vehicleId, 90),
      getAnalyticsByVehicleId(vehicleId)
    ]);

    return NextResponse.json(
      {
        vehicle: toVehicleResponse(vehicle),
        analytics: analytics === null ? null : toAnalyticsResponse(analytics),
        priceSnapshots: priceSnapshots.map(toPriceSnapshotResponse)
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/vehicles/:id failed", error);
    return NextResponse.json(
      { error: "Failed to fetch vehicle details." },
      { status: 500 }
    );
  }
}
