# csci391 final project check-in: architecture pitch + budget

## concept
my project is a used car market tracker. you search by make/model/year and it shows you price history, volatility, and a buy-vs-wait score based on real listing data. the idea is that a car shopper can see whether prices for a specific vehicle are going up, down, or holding steady — way more useful than just one listing price.

## architecture
- compute: cloud run running next.js (handles both the ui and rest api)
- data/state: firestore for vehicle metadata, price snapshots, analytics, and user profiles
- background/event: pub/sub topics that trigger gen-2 cloud functions for ingestion + analytics recomputation
- scheduling: cloud scheduler publishes daily refresh messages into pub/sub without needing the frontend

### how the services talk to each other
1. browser hits cloud run
2. cloud run checks firestore for cached data
3. if it's missing, cloud run publishes to `vehicle-ingest` pub/sub
4. `ingestVehicles` picks it up, calls nhtsa + marketcheck + rapidapi, writes vehicle doc to firestore
5. `ingestVehicles` then publishes to `price-ingest`
6. `ingestPrices` calls marketcheck for active listings and writes price snapshots
7. `computeAnalytics` recalculates trend direction and buy score
8. cloud scheduler can kick off step 3 on a schedule without any user action

## cost estimate

| service | estimated monthly cost | notes |
| --- | ---: | --- |
| cloud run | $0–$8 | low traffic, minimal concurrency |
| firestore | $1–$5 | doc reads/writes for vehicles, snapshots, analytics, users |
| cloud functions (gen 2) | $0–$3 | event-driven, only runs on ingest |
| pub/sub | $0–$2 | low message volume |
| cloud scheduler | $0–$1 | a couple periodic jobs |
| **total** | **$5–$20** | stays safe within student credits |