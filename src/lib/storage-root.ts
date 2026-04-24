import path from "path";

// On Vercel (and other read-only serverless filesystems), only /tmp is writable.
// Locally we keep using ./data so dev behavior is unchanged.
export const STORAGE_ROOT =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "data")
    : path.join(process.cwd(), "data");
