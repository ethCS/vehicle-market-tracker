#!/bin/bash
PROJECT=vehicle-market-tracker
CLOUD_RUN_URL=${CLOUD_RUN_URL:-}

if [ -z "$CLOUD_RUN_URL" ]; then
  echo "Missing CLOUD_RUN_URL. Example: CLOUD_RUN_URL=vehicle-market-tracker-abc123-uc.a.run.app bash infra/setup-pubsub.sh"
  exit 1
fi

gcloud pubsub topics create vehicle-ingest --project=$PROJECT
gcloud pubsub topics create price-ingest --project=$PROJECT

# Push subscription pointing to Cloud Run ingest endpoint
gcloud pubsub subscriptions create vehicle-ingest-sub \
  --topic=vehicle-ingest \
  --push-endpoint=https://$CLOUD_RUN_URL/api/ingest \
  --push-auth-service-account=211740032292-compute@developer.gserviceaccount.com \
  --project=$PROJECT

gcloud pubsub subscriptions create price-ingest-sub \
  --topic=price-ingest \
  --push-endpoint=https://$CLOUD_RUN_URL/api/ingest \
  --push-auth-service-account=211740032292-compute@developer.gserviceaccount.com \
  --project=$PROJECT
