import path from "path";

// Vercel Functions run on a read-only filesystem except for /tmp. Locally we
// keep using ./data so dev behavior and git-committed artifacts are unchanged.
export const STORAGE_ROOT =
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    ? path.join("/tmp", "data")
    : path.join(process.cwd(), "data");
