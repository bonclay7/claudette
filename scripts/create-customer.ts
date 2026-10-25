#!/usr/bin/env tsx
/**
 * Create a new Claudette customer.
 *
 * Usage:
 *   TABLE_NAME=claudette-Table-xxx npm run create-customer -- [slug] [name] [email1,email2]
 *
 * Examples:
 *   TABLE_NAME=xxx npm run create-customer -- marie-dupont "Marie Dupont" daughter@example.com,son@example.com
 *   TABLE_NAME=xxx npm run create-customer                   # generates a random slug
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";

const tableName = process.env.TABLE_NAME;
if (!tableName) {
  console.error("Error: TABLE_NAME environment variable is required.");
  console.error("Run: TABLE_NAME=<your-table-name> npm run create-customer -- ...");
  process.exit(1);
}

const [, , slugArg, nameArg, contactsArg] = process.argv;

const slug = slugArg ?? randomBytes(4).toString("hex");
const name = nameArg ?? "Customer";
const contacts = contactsArg ? contactsArg.split(",").map((e) => e.trim()) : [];
const language = "en-US";

if (contacts.length === 0) {
  console.warn("Warning: no contacts provided. Notifications will not be sent.");
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Check for duplicate slug
const existing = await client.send(
  new GetCommand({
    TableName: tableName,
    Key: { pk: `CUSTOMER#${slug}`, sk: "METADATA" },
  }),
);

if (existing.Item) {
  console.error(`Error: slug "${slug}" already exists.`);
  process.exit(1);
}

await client.send(
  new PutCommand({
    TableName: tableName,
    Item: {
      pk: `CUSTOMER#${slug}`,
      sk: "METADATA",
      slug,
      name,
      contacts,
      language,
      createdAt: new Date().toISOString(),
    },
  }),
);

console.log("\n✓ Customer created successfully\n");
console.log(`  Name     : ${name}`);
console.log(`  Slug     : ${slug}`);
console.log(`  Contacts : ${contacts.join(", ") || "(none)"}`);
console.log(`  Language : ${language}`);
console.log(`\n  Share this URL with ${name}:`);
console.log(`  https://<your-domain>/r/${slug}\n`);
