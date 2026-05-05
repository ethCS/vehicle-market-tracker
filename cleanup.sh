#!/bin/bash
set -euo pipefail

PROJECT=${PROJECT:-vehicle-market-tracker}
REGION=${REGION:-us-central1}

echo "Using project: $PROJECT"
gcloud config set project "$PROJECT" >/dev/null

# Cloud Scheduler jobs
for job in daily-vehicle-refresh daily-price-refresh; do
  gcloud scheduler jobs describe "$job" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1 && \
    gcloud scheduler jobs delete "$job" --location="$REGION" --project="$PROJECT" --quiet || true
done

# Cloud Functions (2nd gen)
for fn in ingestVehicles ingestPrices computeAnalytics; do
  gcloud functions describe "$fn" --gen2 --region="$REGION" --project="$PROJECT" >/dev/null 2>&1 && \
    gcloud functions delete "$fn" --gen2 --region="$REGION" --project="$PROJECT" --quiet || true
done

# Cloud Run service
gcloud run services describe vehicle-market-tracker --region="$REGION" --project="$PROJECT" >/dev/null 2>&1 && \
  gcloud run services delete vehicle-market-tracker --region="$REGION" --project="$PROJECT" --quiet || true

# Pub/Sub subscriptions (legacy and optional)
for sub in vehicle-ingest-sub price-ingest-sub; do
  gcloud pubsub subscriptions describe "$sub" --project="$PROJECT" >/dev/null 2>&1 && \
    gcloud pubsub subscriptions delete "$sub" --project="$PROJECT" --quiet || true
done

# Pub/Sub topics
for topic in vehicle-ingest price-ingest; do
  gcloud pubsub topics describe "$topic" --project="$PROJECT" >/dev/null 2>&1 && \
    gcloud pubsub topics delete "$topic" --project="$PROJECT" --quiet || true
done

# Secret Manager secrets used by Cloud Run / CI
for secret in INGEST_SECRET MARKETCHECK_API_KEY MARKETCHECK_CLIENT_SECRET; do
  gcloud secrets describe "$secret" --project="$PROJECT" >/dev/null 2>&1 && \
    gcloud secrets delete "$secret" --project="$PROJECT" --quiet || true
done

if [[ "${DELETE_PROJECT:-0}" == "1" ]]; then
  echo "Deleting entire project: $PROJECT"
  gcloud projects delete "$PROJECT" --quiet
else
  echo "Project-level teardown not executed."
  echo "To delete the entire GCP project and guarantee no residual billing, run:"
  echo "  DELETE_PROJECT=1 bash cleanup.sh"
fi

echo "Teardown complete for project infrastructure resources."
