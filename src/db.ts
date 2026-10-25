import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";
import type { Customer, Request, Task } from "./types.js";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const tableName = () => Resource.Table.name;

export async function getCustomer(slug: string): Promise<Customer | null> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: `CUSTOMER#${slug}`, sk: "METADATA" },
    }),
  );

  if (!result.Item) return null;

  return {
    slug,
    name: result.Item.name as string,
    contacts: result.Item.contacts as string[],
    language: result.Item.language as string,
    createdAt: result.Item.createdAt as string,
  };
}

export async function createRequest(
  req: Omit<Request, "updatedAt">,
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        pk: `CUSTOMER#${req.slug}`,
        sk: `REQUEST#${req.requestId}`,
        ...req,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
}

export async function updateRequest(
  slug: string,
  requestId: string,
  updates: Partial<Omit<Request, "requestId" | "slug">>,
): Promise<void> {
  const entries = Object.entries({ ...updates, updatedAt: new Date().toISOString() });

  const updateExpression =
    "SET " + entries.map((_, i) => `#k${i} = :v${i}`).join(", ");
  const expressionAttributeNames = Object.fromEntries(
    entries.map(([k], i) => [`#k${i}`, k]),
  );
  const expressionAttributeValues = Object.fromEntries(
    entries.map(([, v], i) => [`:v${i}`, v as Task[] | string | undefined]),
  );

  await client.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: { pk: `CUSTOMER#${slug}`, sk: `REQUEST#${requestId}` },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    }),
  );
}
