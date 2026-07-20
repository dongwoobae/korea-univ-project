import { S3Client } from "@aws-sdk/client-s3";

const baseOptions = {
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
} as const;

export const r2 = new S3Client(baseOptions);

export const r2Presign = new S3Client({
  ...baseOptions,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

export const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET_NAME!;
export const R2_PUBLIC_URL = process.env.CLOUDFLARE_R2_PUBLIC_URL!;

export function getPublicR2Url(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

export function getR2KeyFromPublicUrl(url: string): string | null {
  return url.startsWith(R2_PUBLIC_URL + "/")
    ? url.slice(R2_PUBLIC_URL.length + 1)
    : null;
}
