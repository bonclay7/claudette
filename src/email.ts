import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { Task } from "./types.js";

const client = new SESClient({});

const PRIORITY_BADGE: Record<Task["priority"], string> = {
  high: "#c0392b",
  medium: "#e67e22",
  low: "#27ae60",
};

export async function sendRequestNotification(params: {
  contacts: string[];
  customerName: string;
  transcript: string;
  tasks: Task[];
  audioSignedUrl: string;
  fromEmail: string;
}): Promise<void> {
  const { contacts, customerName, transcript, tasks, audioSignedUrl, fromEmail } =
    params;

  const taskRows = tasks
    .map(
      (t) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">
        <strong>${t.title}</strong><br>
        <span style="color:#555;font-size:14px;">${t.description}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;vertical-align:top;">
        <span style="background:${PRIORITY_BADGE[t.priority]};color:#fff;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:bold;">
          ${t.priority.toUpperCase()}
        </span>
      </td>
    </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#222;">
  <h2 style="color:#2c3e50;">New request from ${customerName}</h2>

  <h3 style="color:#555;font-size:16px;margin-top:24px;">What they said</h3>
  <blockquote style="border-left:4px solid #3498db;margin:0;padding:12px 16px;background:#f0f7ff;border-radius:4px;font-style:italic;">
    "${transcript}"
  </blockquote>

  <h3 style="color:#555;font-size:16px;margin-top:24px;">Identified tasks</h3>
  <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:4px;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:8px 12px;text-align:left;font-size:13px;color:#666;">Task</th>
        <th style="padding:8px 12px;text-align:left;font-size:13px;color:#666;">Priority</th>
      </tr>
    </thead>
    <tbody>${taskRows}</tbody>
  </table>

  <p style="margin-top:24px;">
    <a href="${audioSignedUrl}" style="display:inline-block;background:#3498db;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:bold;">
      Listen to audio (valid 7 days)
    </a>
  </p>

  <p style="margin-top:32px;font-size:12px;color:#999;">
    This message was sent by Claudette on behalf of ${customerName}.
  </p>
</body>
</html>`;

  await client.send(
    new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: contacts },
      Message: {
        Subject: { Data: `New request from ${customerName}`, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: {
            Data: `New request from ${customerName}\n\nTranscript: "${transcript}"\n\nTasks:\n${tasks.map((t) => `- [${t.priority.toUpperCase()}] ${t.title}: ${t.description}`).join("\n")}\n\nListen: ${audioSignedUrl}`,
            Charset: "UTF-8",
          },
        },
      },
    }),
  );
}
