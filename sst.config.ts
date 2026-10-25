/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "claudette",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      // Tag every AWS resource for cost tracking and resource filtering
      providers: {
        aws: {
          defaultTags: {
            tags: {
              app: "claudette",
              stage: input?.stage ?? "dev",
              "managed-by": "sst",
            },
          },
        },
      },
    };
  },
  async run() {
    const fromEmail = new sst.Secret("FromEmail");

    const audioBucket = new sst.aws.Bucket("AudioBucket");

    const table = new sst.aws.Dynamo("Table", {
      fields: {
        pk: "string",
        sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
    });

    // Batch queue — delayed messages trigger the batcher after each customer's
    // inactivity window, allowing multiple recordings to be processed together.
    const batchQueue = new sst.aws.Queue("BatchQueue");

    batchQueue.subscribe({
      handler: "src/batcher.handler",
      timeout: "5 minutes",
      link: [table, audioBucket, fromEmail],
      permissions: [
        {
          actions: ["bedrock:InvokeModel"],
          resources: ["*"],
        },
        {
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        },
      ],
    });

    // Worker: transcribes audio then enqueues a batch message
    audioBucket.subscribe(
      {
        handler: "src/worker.handler",
        timeout: "10 minutes",
        link: [table, audioBucket, batchQueue],
        permissions: [
          {
            actions: [
              "transcribe:StartTranscriptionJob",
              "transcribe:GetTranscriptionJob",
            ],
            resources: ["*"],
          },
        ],
      },
      {
        events: ["s3:ObjectCreated:*"],
        filterPrefix: "audio/",
      },
    );

    // Single CloudFront distribution for all traffic
    const router = new sst.aws.Router("Router");

    // API Gateway HTTP API — no public Lambda Function URL
    const api = new sst.aws.ApiGatewayV2("Api");

    api.route("$default", {
      handler: "src/api.handler",
      link: [table, audioBucket],
    });

    // Route /api/* on CloudFront → API Gateway, stripping the /api prefix
    router.route("/api", api.url, {
      rewrite: {
        regex: "^/api/(.*)$",
        to: "/$1",
      },
    });

    // Static site at / on the same CloudFront distribution
    const web = new sst.aws.StaticSite("Web", {
      path: "web",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: "/api",
      },
      router: {
        instance: router,
      },
      errorPage: "index.html",
    });

    return {
      url: router.url,
    };
  },
});
