import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Resource } from "sst";
import { ulid } from "ulid";
import { getCustomer, createRequest } from "./db.js";

const s3 = new S3Client({});

const app = new Hono();

/** GET /r/:slug — return customer display name */
app.get("/r/:slug", async (c) => {
  const { slug } = c.req.param();
  const customer = await getCustomer(slug);

  if (!customer) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ name: customer.name });
});

/** POST /r/:slug/request — receive audio blob, store to S3, create request record */
app.post("/r/:slug/request", async (c) => {
  const { slug } = c.req.param();

  const customer = await getCustomer(slug);
  if (!customer) {
    return c.json({ error: "Not found" }, 404);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength < 500) {
    return c.json({ error: "Recording too short" }, 400);
  }

  const contentType = c.req.header("Content-Type") ?? "audio/webm";
  const format = detectFormat(contentType);
  const requestId = ulid();
  const audioKey = `audio/${slug}/${requestId}.${format}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: Resource.AudioBucket.name,
      Key: audioKey,
      Body: Buffer.from(body),
      ContentType: contentType,
    }),
  );

  await createRequest({
    requestId,
    slug,
    audioKey,
    audioFormat: format,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  return c.json({ requestId }, 201);
});

function detectFormat(contentType: string): string {
  const raw = contentType.split("/")[1]?.split(";")[0]?.trim() ?? "webm";
  if (raw === "mpeg") return "mp3";
  if (raw === "x-m4a") return "mp4";
  return raw;
}

export const handler = handle(app);
