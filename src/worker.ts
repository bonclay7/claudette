import type { S3Handler } from "aws-lambda";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Resource } from "sst";
import { getCustomer, updateRequest } from "./db.js";
import { transcribeAudio } from "./transcribe.js";

const sqs = new SQSClient({});

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key);
    const bucketName = record.s3.bucket.name;

    try {
      await processRecord(key, bucketName);
    } catch (err) {
      console.error(`Failed to process ${key}:`, err);
      try {
        const { slug, requestId } = parseKey(key);
        await updateRequest(slug, requestId, { status: "failed" });
      } catch {
        // ignore
      }
    }
  }
};

async function processRecord(key: string, bucketName: string): Promise<void> {
  const { slug, requestId, format } = parseKey(key);

  const customer = await getCustomer(slug);
  if (!customer) {
    console.warn(`Customer not found for slug: ${slug}`);
    return;
  }

  await updateRequest(slug, requestId, { status: "transcribing" });

  const transcript = await transcribeAudio({
    jobName: requestId,
    s3Uri: `s3://${bucketName}/${key}`,
    mediaFormat: format,
    languageCode: customer.language,
    outputBucket: Resource.AudioBucket.name,
  });

  await updateRequest(slug, requestId, { status: "pending_batch", transcript });

  // Enqueue a delayed batch job — fires after the customer's inactivity window.
  // Multiple presses within the window each enqueue a message; the batcher is
  // idempotent and only the first message to find pending requests does work.
  const delaySeconds = Math.min((customer.sessionWindowMinutes ?? 5) * 60, 900);

  await sqs.send(
    new SendMessageCommand({
      QueueUrl: Resource.BatchQueue.url,
      MessageBody: JSON.stringify({ slug }),
      DelaySeconds: delaySeconds,
    }),
  );
}

/** audio/{slug}/{requestId}.{format} */
function parseKey(key: string): { slug: string; requestId: string; format: string } {
  const parts = key.split("/");
  if (parts.length !== 3 || parts[0] !== "audio") {
    throw new Error(`Unexpected S3 key format: ${key}`);
  }
  const [, slug, filename] = parts;
  const dotIndex = filename!.lastIndexOf(".");
  const requestId = filename!.slice(0, dotIndex);
  const format = filename!.slice(dotIndex + 1);
  return { slug: slug!, requestId, format };
}
