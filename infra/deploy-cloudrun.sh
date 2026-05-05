#!/bin/bash
PROJECT=vehicle-market-tracker
REGION=us-central1
SERVICE=vehicle-market-tracker

if [ -n "$CLOUD_RUN_RUNTIME_SA" ]; then
  RUNTIME_SA="$CLOUD_RUN_RUNTIME_SA"
else
  RUNTIME_SA="$(gcloud config get-value account)"
fi

if [ -z "$RUNTIME_SA" ] || [ "$RUNTIME_SA" = "(unset)" ]; then
  echo "Unable to resolve runtime service account. Set CLOUD_RUN_RUNTIME_SA or login with gcloud auth." >&2
  exit 1
fi

echo "Using runtime service account: $RUNTIME_SA"

for SECRET in MARKETCHECK_API_KEY MARKETCHECK_CLIENT_SECRET INGEST_SECRET; do
  if gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT" \
    --quiet; then
    echo "Granted access on $SECRET"
  else
    echo "Warning: could not update IAM for $SECRET; continuing"
  fi
done

gcloud builds submit --tag gcr.io/$PROJECT/$SERVICE
gcloud run deploy $SERVICE \
  --image gcr.io/$PROJECT/$SERVICE \
  --platform managed \
  --region $REGION \
  --service-account "$RUNTIME_SA" \
  --clear-base-image \
  --allow-unauthenticated \
  --set-env-vars GCLOUD_PROJECT=$PROJECT,PUBSUB_TOPIC_INGEST=vehicle-ingest,PUBSUB_TOPIC_PRICES=price-ingest,FB_ADMIN_PROJECT_ID=$PROJECT,MARKETCHECK_COUNTRY=us,MARKETCHECK_ROWS=25 \
  --set-secrets MARKETCHECK_API_KEY=MARKETCHECK_API_KEY:latest,MARKETCHECK_CLIENT_SECRET=MARKETCHECK_CLIENT_SECRET:latest,INGEST_SECRET=INGEST_SECRET:latest \
  --project $PROJECT
