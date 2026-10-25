import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
  LanguageCode,
} from "@aws-sdk/client-transcribe";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const transcribeClient = new TranscribeClient({});
const s3Client = new S3Client({});

interface TranscriptResult {
  results: {
    transcripts: Array<{ transcript: string }>;
  };
}

export async function transcribeAudio(params: {
  jobName: string;
  s3Uri: string;
  mediaFormat: string;
  languageCode: string;
  outputBucket: string;
}): Promise<string> {
  const { jobName, s3Uri, mediaFormat, languageCode, outputBucket } = params;

  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: s3Uri },
      MediaFormat: mediaFormat as "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm",
      LanguageCode: languageCode as LanguageCode,
      OutputBucketName: outputBucket,
      OutputKey: `transcripts/${jobName}.json`,
    }),
  );

  // Poll until complete (max ~10 minutes)
  for (let attempt = 0; attempt < 120; attempt++) {
    await sleep(5000);

    const { TranscriptionJob } = await transcribeClient.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
    );

    if (!TranscriptionJob) throw new Error("Transcription job not found");

    const status = TranscriptionJob.TranscriptionJobStatus;

    if (status === TranscriptionJobStatus.COMPLETED) {
      const result = await s3Client.send(
        new GetObjectCommand({
          Bucket: outputBucket,
          Key: `transcripts/${jobName}.json`,
        }),
      );
      const body = await result.Body!.transformToString();
      const data = JSON.parse(body) as TranscriptResult;
      return data.results.transcripts[0].transcript;
    }

    if (status === TranscriptionJobStatus.FAILED) {
      throw new Error(
        `Transcription failed: ${TranscriptionJob.FailureReason ?? "unknown reason"}`,
      );
    }
  }

  throw new Error("Transcription timed out after 10 minutes");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
