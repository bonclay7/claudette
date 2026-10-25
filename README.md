# Claudette

A voice-first help request app for elderly people. Press a button, speak your need, your family gets notified.

## How it works

1. Each customer gets a unique URL — no login required
2. They hold a button and speak their request
3. The audio is stored on S3, transcribed by AWS Transcribe, and parsed into tasks by Claude Haiku (via Bedrock)
4. An email is sent to the customer's contacts with the transcript, tasks, and a link to replay the audio

## Stack

- **Frontend** — Vanilla TypeScript + Vite, deployed to S3 + CloudFront
- **API** — AWS Lambda (Hono), Function URL
- **Worker** — AWS Lambda, triggered by S3 uploads
- **Storage** — S3 (audio + transcripts), DynamoDB (customers + requests)
- **Transcription** — AWS Transcribe
- **Task parsing** — Claude 3 Haiku via AWS Bedrock
- **Email** — AWS SES
- **Infrastructure** — SST Ion v3 (TypeScript, AWS-only)

## Prerequisites

- Node.js 22+
- AWS account with credentials configured (`aws configure` or `AWS_*` env vars)
- [AWS Bedrock](https://console.aws.amazon.com/bedrock) → Model access → enable **Claude 3 Haiku**
- [AWS SES](https://console.aws.amazon.com/ses) → Verified identities → verify your sender email
  - If SES is in sandbox mode, also verify every recipient email

## Setup

```bash
npm install
npx sst install   # generates local type definitions
```

## Deploy

```bash
npx sst deploy --stage dev
```

SST will print the outputs when it finishes:

```
✓  Complete
   ApiUrl: https://xxxx.lambda-url.us-east-1.on.aws
   WebUrl: https://xxxx.cloudfront.net
```

The `FROM_EMAIL` environment variable must be set to a SES-verified address:

```bash
FROM_EMAIL=help@yourdomain.com npx sst deploy --stage dev
```

## Onboard a customer

Use the `create-customer` script. You need the DynamoDB table name from the deploy output (or from the AWS console).

```bash
TABLE_NAME=claudette-dev-Table \
  npm run create-customer -- <slug> "<Full Name>" <email1,email2>
```

Example:

```bash
TABLE_NAME=claudette-dev-Table \
  npm run create-customer -- marie-dupont "Marie Dupont" daughter@example.com,son@example.com
```

Output:

```
✓ Customer created successfully

  Name     : Marie Dupont
  Slug     : marie-dupont
  Contacts : daughter@example.com, son@example.com
  Language : en-US

  Share this URL with Marie Dupont:
  https://xxxx.cloudfront.net/r/marie-dupont
```

Share that URL with the customer. That's it — no app to install, no password.

## Local development

```bash
npx sst dev
```

This deploys a dev stage to AWS with live Lambda reloading. The frontend can be run locally with:

```bash
cd web
VITE_API_URL=<your-api-url> npm run dev
```

## CI

GitHub Actions runs on every push and pull request to `main`:

- **Type check** — root (`src/`, `scripts/`) and `web/`
- **Lint** — `src/` and `scripts/`

No deployment happens in CI. Deploy manually or add a workflow step once you have AWS credentials stored as repository secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`).

## Project structure

```
src/
  api.ts          API Lambda — serves customer config, receives audio
  worker.ts       S3-triggered Lambda — transcribe → parse → email
  db.ts           DynamoDB helpers
  transcribe.ts   AWS Transcribe wrapper
  bedrock.ts      Claude Haiku task extraction
  email.ts        SES notification
  types.ts        Shared types
web/
  src/main.ts     Frontend — the big button
  src/style.css
  index.html
scripts/
  create-customer.ts   CLI to onboard a new customer
sst.config.ts     Infrastructure definition
```

## Stages

| Stage | Purpose |
|---|---|
| `dev` | Development — resources are deleted on `sst remove` |
| `production` | Production — S3 and DynamoDB are retained on `sst remove` |

```bash
npx sst deploy --stage production
npx sst remove --stage dev
```
