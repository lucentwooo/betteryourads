import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import type { Job, AnalysisInput, JobStatus, ProgressStep } from "../types";
import { kvGet, kvSet } from "../storage/kv";
import { STORAGE_ROOT } from "../storage-root";

// Ephemeral in-process cache to avoid hammering KV within a single request.
const jobs = new Map<string, Job>();

function jobKey(id: string): string {
  return `job:${id}`;
}

export async function createJob(input: AnalysisInput): Promise<Job> {
  const id = uuidv4().slice(0, 8);
  const job: Job = {
    id,
    status: "queued",
    input,
    progress: [],
    createdAt: new Date().toISOString(),
  };

  jobs.set(id, job);

  // Scratch dirs for pipeline tools that need a filesystem (Playwright,
  // sharp, python image scripts). Artifacts users will see are uploaded to
  // Blob; this stays ephemeral.
  const jobDir = getJobDir(id);
  await fs.mkdir(path.join(jobDir, "ads"), { recursive: true });

  await persistJob(job);
  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  if (jobs.has(id)) return jobs.get(id)!;
  const job = await kvGet<Job>(jobKey(id));
  if (job) jobs.set(id, job);
  return job;
}

export async function updateJob(
  id: string,
  update: Partial<Job>
): Promise<Job | null> {
  const job = await getJob(id);
  if (!job) return null;

  Object.assign(job, update);
  jobs.set(id, job);
  await persistJob(job);

  return job;
}

export async function addProgress(
  id: string,
  step: string,
  detail: string,
  opts?: { agent?: string; qaOutcome?: "pass" | "retry" | "escalate" }
): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  const progressStep: ProgressStep = {
    step,
    detail,
    timestamp: new Date().toISOString(),
    agent: opts?.agent,
    qaOutcome: opts?.qaOutcome,
  };

  job.progress.push(progressStep);
  await persistJob(job);
}

export async function setStatus(
  id: string,
  status: JobStatus
): Promise<void> {
  const job = await getJob(id);
  if (!job) return;

  job.status = status;
  if (status === "complete" || status === "error") {
    job.completedAt = new Date().toISOString();
  }
  await persistJob(job);
}

export function getJobDir(id: string): string {
  return path.join(STORAGE_ROOT, "jobs", id);
}

async function persistJob(job: Job): Promise<void> {
  await kvSet(jobKey(job.id), job);
}
