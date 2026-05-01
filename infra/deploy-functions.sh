#!/bin/bash
set -e

PROJECT=vehicle-market-tracker
REGION=us-central1

cd functions
npm install
npm run build

# Deploy all exported 2nd gen functions from functions/src/index.ts
firebase deploy --only functions --project $PROJECT

# Alternate direct gcloud deployment can be used if preferred.
# gcloud functions deploy ingestVehicles --gen2 --runtime=nodejs20 --region=$REGION --source=. --entry-point=ingestVehicles --trigger-topic=vehicle-ingest --project=$PROJECT
# gcloud functions deploy ingestPrices --gen2 --runtime=nodejs20 --region=$REGION --source=. --entry-point=ingestPrices --trigger-topic=price-ingest --project=$PROJECT
