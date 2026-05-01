import { PubSub } from "@google-cloud/pubsub";

export interface PublishPayload {
  type: "vehicle" | "prices";
  make?: string;
  model?: string;
  year?: number;
  vehicleId?: string;
}

let pubsubClient: PubSub | null = null;

function getClient(): PubSub {
  if (pubsubClient !== null) {
    return pubsubClient;
  }

  const projectId = process.env.GCLOUD_PROJECT;
  pubsubClient = new PubSub(
    projectId === undefined || projectId.trim() === ""
      ? undefined
      : { projectId }
  );

  return pubsubClient;
}

export async function publishIngestionMessage(payload: PublishPayload): Promise<string> {
  const topicName = process.env.PUBSUB_TOPIC_INGEST;
  if (topicName === undefined || topicName.trim() === "") {
    throw new Error("PUBSUB_TOPIC_INGEST is not configured.");
  }

  const messageBuffer = Buffer.from(JSON.stringify(payload));
  return getClient().topic(topicName).publishMessage({
    data: messageBuffer,
    attributes: {
      type: payload.type,
      make: payload.make ?? "",
      model: payload.model ?? "",
      year: payload.year === undefined ? "" : payload.year.toString(),
      vehicleId: payload.vehicleId ?? ""
    }
  });
}

export async function publishPriceMessage(payload: {
  vehicleId: string;
  make: string;
  year: number;
}): Promise<string> {
  const topicName = process.env.PUBSUB_TOPIC_PRICES;
  if (topicName === undefined || topicName.trim() === "") {
    throw new Error("PUBSUB_TOPIC_PRICES is not configured.");
  }

  return getClient().topic(topicName).publishMessage({
    data: Buffer.from(JSON.stringify(payload)),
    attributes: {
      type: "prices",
      vehicleId: payload.vehicleId,
      make: payload.make,
      year: payload.year.toString()
    }
  });
}
