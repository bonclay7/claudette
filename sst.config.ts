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

    audioBucket.subscribe(
      {
        handler: "src/worker.handler",
        timeout: "10 minutes",
        link: [table, audioBucket, fromEmail],
        permissions: [
          {
            actions: [
              "transcribe:StartTranscriptionJob",
              "transcribe:GetTranscriptionJob",
            ],
            resources: ["*"],
          },
          {
            actions: ["bedrock:InvokeModel"],
            resources: ["*"],
          },
          {
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"],
          },
        ],
      },
      {
        events: ["s3:ObjectCreated:*"],
        filterPrefix: "audio/",
      },
    );

    const api = new sst.aws.Function("Api", {
      handler: "src/api.handler",
      url: true,
      link: [table, audioBucket],
    });

    const web = new sst.aws.StaticSite("Web", {
      path: "web",
      build: {
        command: "npm run build",
        output: "dist",
      },
      environment: {
        VITE_API_URL: api.url,
      },
      errorPage: "index.html",
    });

    return {
      apiUrl: api.url,
      webUrl: web.url,
    };
  },
});
