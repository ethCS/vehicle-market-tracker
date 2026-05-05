#!/bin/bash
set -e

PROJECT=vehicle-market-tracker
REGION=us-central1

cd functions
npm install
npm run build

firebase deploy --only functions --project $PROJECT
