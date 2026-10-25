import type { SQSHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Resource } from "sst";
import { getCustomer, queryPendingRequests, updateRequest } from "./db.js";
import { parseTasks } from "./bedrock.js";
import { sendRequestNotification } from "./email.js";
import type { Request } from "./types.js";

const s3 = new S3Client({});

export const handler: SQSHandler = async (event) => {
  // Deduplicate slugs across batch — SQS may deliver multiple messages for the same slug
  const slugs = [...new Set(event.Records.map((r) => (JSON.parse(r.body) as { slug: string }).slug))];

  for (const slug of slugs) {
    try {
      await processBatch(slug);
    } catch (err) {
      console.error(`Failed to process batch for slug ${slug}:`, err);
      // Don't rethrow — let other slugs in the batch complete
    }
  }
};

async function processBatch(slug: string): Promise<void> {
  const pending = await queryPendingRequests(slug);

  if (pending.length === 0) {
    // An earlier message already handled this session — no-op
    console.log(`No pending requests for ${slug}, skipping`);
    return;
  }

  const customer = await getCustomer(slug);
  if (!customer) {
    console.warn(`Customer not found for slug: ${slug}`);
    return;
  }

  // Sort chronologically so the LLM gets context in order
  const sorted = pending.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Mark all as processing atomically before the expensive calls
  await Promise.all(
    sorted.map((r) => updateRequest(slug, r.requestId, { status: "processing" })),
  );

  const transcripts = sorted.map((r) => r.transcript ?? "");

  // One LLM call with all transcripts concatenated — maximises context,
  // minimises API calls. The model sees them as one continuous message.
  const combinedTranscript = transcripts.join(" ");
  const tasks = await parseTasks(combinedTranscript, customer.name);

  // Generate signed URLs for every audio file in the session
  const audioSignedUrls = await Promise.all(sorted.map((r) => signedAudioUrl(r)));

  await sendRequestNotification({
    contacts: customer.contacts,
    customerName: customer.name,
    transcripts,
    tasks,
    audioSignedUrls,
    fromEmail: Resource.FromEmail.value,
  });

  // Mark all notified with the shared task list
  await Promise.all(
    sorted.map((r) => updateRequest(slug, r.requestId, { status: "notified", tasks })),
  );
}

async function signedAudioUrl(request: Request): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: Resource.AudioBucket.name,
      Key: request.audioKey,
    }),
    { expiresIn: 60 * 60 * 24 * 7 }, // 7 days
  );
}
