import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import type { Task } from "./types.js";

const client = new BedrockRuntimeClient({});

const MODEL_ID = "anthropic.claude-haiku-4-5-20251001-v1:0";

export async function parseTasks(
  transcript: string,
  customerName: string,
): Promise<Task[]> {
  const prompt = `You are a care coordinator assistant helping elderly people get support.

${customerName} has left a voice message asking for help. Here is the transcription:

"${transcript}"

Extract the specific tasks or help they need. Return a JSON array of tasks. Each task must have:
- title: short action phrase (e.g. "Schedule doctor appointment")
- description: more detail about what is needed
- priority: "low", "medium", or "high" based on urgency

Respond with ONLY valid JSON, no explanation. Example:
[{"title":"Call pharmacy","description":"Needs prescription refill for blood pressure medication","priority":"high"}]`;

  const response = await client.send(
    new InvokeModelCommand({
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    }),
  );

  const responseBody = JSON.parse(
    new TextDecoder().decode(response.body),
  ) as { content: Array<{ text: string }> };

  const text = responseBody.content[0].text.trim();

  try {
    return JSON.parse(text) as Task[];
  } catch {
    // Fallback: return a single task with the full transcript
    return [
      {
        title: "Help requested",
        description: transcript,
        priority: "medium",
      },
    ];
  }
}
