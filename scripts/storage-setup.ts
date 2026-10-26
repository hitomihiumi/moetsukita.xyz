/**
 * Prepares the buckets: creates them locally, allows browser uploads to the
 * private one from the site (CORS), expires watermarked copies after a day
 * and, on a local S3, makes the public bucket anonymously readable. On R2 the
 * public bucket is served through its custom domain instead, set up in the
 * Cloudflare dashboard.
 *
 *   npm run storage:setup
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
} from "@aws-sdk/client-s3";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { storageClient } = await import("../src/server/storage");
  const { client, bucket, publicBucket } = storageClient();
  const local = Boolean(process.env.R2_ENDPOINT?.trim());

  for (const name of [bucket, publicBucket]) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: name }));
      console.log(`✓ bucket ${name} exists`);
    } catch {
      if (!local)
        throw new Error(`Bucket ${name} not found. Create it in the Cloudflare dashboard.`);
      await client.send(new CreateBucketCommand({ Bucket: name }));
      console.log(`✓ bucket ${name} created`);
    }
  }

  const origins = (process.env.STORAGE_CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["GET", "HEAD", "PUT"],
            AllowedHeaders: ["content-type", "content-length"],
            // The browser reads ETag to complete multipart uploads.
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`✓ CORS on ${bucket} for ${origins.join(", ")}`);

  try {
    await client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: bucket,
        LifecycleConfiguration: {
          Rules: [
            {
              ID: "expire-derived",
              Status: "Enabled",
              Filter: { Prefix: "derived/" },
              Expiration: { Days: 1 },
            },
            {
              ID: "abort-stale-uploads",
              Status: "Enabled",
              Filter: { Prefix: "originals/" },
              AbortIncompleteMultipartUpload: { DaysAfterInitiation: 2 },
            },
          ],
        },
      }),
    );
    console.log("✓ lifecycle: derived/ expires after 1 day");
  } catch (error) {
    console.warn(`! lifecycle rules not applied: ${(error as Error).message}`);
  }

  if (local) {
    await client.send(
      new PutBucketPolicyCommand({
        Bucket: publicBucket,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: { AWS: ["*"] },
              Action: ["s3:GetObject"],
              Resource: [`arn:aws:s3:::${publicBucket}/*`],
            },
          ],
        }),
      }),
    );
    console.log(`✓ ${publicBucket} readable anonymously (local only)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
