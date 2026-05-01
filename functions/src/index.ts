import { initializeApp } from "firebase-admin/app";
import { computeAnalytics } from "./computeAnalytics";
import { ingestPrices } from "./ingestPrices";
import { ingestVehicles } from "./ingestVehicles";

initializeApp();

export { ingestVehicles, ingestPrices, computeAnalytics };
