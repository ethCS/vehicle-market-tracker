# Final Project Check-In: Architecture Pitch & Budget

## Concept
Vehicle Market Tracker is a cloud-hosted market intelligence application for used vehicles. A user searches by make, model, and year, and the system returns pricing trends, volatility, and a buy-versus-wait recommendation based on persisted historical snapshots. The intended user is a car shopper who wants more context than a single listing price and needs a quick read on whether the market for a specific vehicle looks favorable.

## Architecture
- Compute layer: Cloud Run hosts the Next.js web application and REST API.
- Data/state layer: Firestore stores vehicle metadata, historical price snapshots, analytics summaries, and per-user profile records.
- Event/background layer: Pub/Sub topics trigger second-generation Cloud Functions for vehicle ingestion, price ingestion, and analytics recomputation.
- Scheduled automation: Cloud Scheduler publishes periodic refresh events into Pub/Sub.

### Service Communication
1. A browser request reaches the Cloud Run Next.js app.
2. Cloud Run reads cached vehicle and analytics data from Firestore.
3. If data is missing or stale, Cloud Run publishes an ingest request to Pub/Sub.
4. `ingestVehicles` consumes the vehicle ingest event, enriches data from external APIs, and writes normalized vehicle docs to Firestore.
5. `ingestVehicles` publishes a follow-up price ingest event to Pub/Sub.
6. `ingestPrices` writes price snapshots to Firestore.
7. `computeAnalytics` recalculates trend and buy-score data and persists it back to Firestore.
8. Cloud Scheduler can seed or refresh ingestion without the frontend being involved.

## Cost Estimate
Estimated monthly cost for a student-scale deployment:

| Service | Estimated Monthly Cost | Notes |
| --- | ---: | --- |
| Cloud Run | $0 - $8 | Small web workload, low concurrency, light traffic |
| Firestore | $1 - $5 | Persistent document reads/writes for vehicles, snapshots, analytics, users |
| Cloud Functions (Gen 2) | $0 - $3 | Event-driven background ingestion and analytics |
| Pub/Sub | $0 - $2 | Low message volume for ingest events |
| Cloud Scheduler | $0 - $1 | One or a few periodic jobs |
| Total | $5 - $20 | Approximate operating range for class-project scale |

This estimate intentionally avoids expensive GPUs, large VM instances, or high-throughput managed databases so the project remains safe within student credit limits.