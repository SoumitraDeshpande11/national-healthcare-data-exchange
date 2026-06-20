import { env } from "../config/env.js";

type ElasticLogEvent = {
  event: string;
  level?: "info" | "warn" | "error";
  actorOrgId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function indexOperationalLog(event: ElasticLogEvent) {
  if (env.NODE_ENV === "test") {
    return;
  }

  const document = {
    "@timestamp": new Date().toISOString(),
    service: "exchange-api",
    level: event.level ?? "info",
    event: event.event,
    actorOrgId: event.actorOrgId ?? null,
    resourceType: event.resourceType ?? null,
    resourceId: event.resourceId ?? null,
    metadata: event.metadata ?? {}
  };

  try {
    await fetch(`${env.ELASTICSEARCH_URL.replace(/\/$/, "")}/${env.ELASTICSEARCH_LOG_INDEX}/_doc`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(document)
    });
  } catch {
    // Logging must never break healthcare exchange workflows.
  }
}
