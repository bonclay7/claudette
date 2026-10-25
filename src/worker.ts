import type { S3Handler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Resource } from "sst";
import { getCustomer, updateRequest } from "./db.js";
import { transcribeAudio } from "./transcribe.js";
import { parseTasks } from "./bedrock.js";
import { sendRequestNotification } from "./email.js";

const s3 = new S3Client({});

export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const key = decodeURIComponent(record.s3.object.key);
    const bucketName = record.s3.bucket.name;

    try {
      await processRecord(key, bucketName);
    } catch (err) {
      console.error(`Failed to process ${key}:`, err);
      // Best-effort status update — don't throw so other records still process
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

  // Transcribe
  await updateRequest(slug, requestId, { status: "transcribing" });

  const s3Uri = `s3://${bucketName}/${key}`;
  const transcript = await transcribeAudio({
    jobName: requestId,
    s3Uri,
    mediaFormat: format,
    languageCode: customer.language,
    outputBucket: Resource.AudioBucket.name,
  });

  await updateRequest(slug, requestId, { status: "processing", transcript });

  // Parse tasks with Claude
  const tasks = await parseTasks(transcript, customer.name);

  // Generate signed URL for audio playback (valid 7 days)
  const audioSignedUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucketName, Key: key }),
    { expiresIn: 60 * 60 * 24 * 7 },
  );

  // Notify contacts
  await sendRequestNotification({
    contacts: customer.contacts,
    customerName: customer.name,
    transcript,
    tasks,
    audioSignedUrl,
    fromEmail: Resource.FromEmail.value,
  });

  await updateRequest(slug, requestId, { status: "notified", tasks });
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
