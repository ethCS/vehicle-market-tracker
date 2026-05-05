#!/bin/bash
PROJECT=vehicle-market-tracker
REGION=us-central1
SERVICE=vehicle-market-tracker
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in MARKETCHECK_API_KEY MARKETCHECK_CLIENT_SECRET INGEST_SECRET; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --project "$PROJECT" \
    --quiet
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
