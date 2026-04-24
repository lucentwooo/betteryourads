import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import type { Job, AnalysisInput, JobStatus, ProgressStep } from "../types";
import { STORAGE_ROOT } from "../storage-root";

const DATA_DIR = path.join(STORAGE_ROOT, "jobs");
const jobs = new Map<string, Job>();

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
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

  const jobDir = path.join(DATA_DIR, id);
  await ensureDir(jobDir);
  await ensureDir(path.join(jobDir, "ads"));
  await persistJob(job);

  return job;
}

export async function getJob(id: string): Promise<Job | null> {
  if (jobs.has(id)) {
    return jobs.get(id)!;
  }

  try {
    const filePath = path.join(DATA_DIR, id, "job.json");
    const data = await fs.readFile(filePath, "utf-8");
    const job = JSON.parse(data) as Job;
    jobs.set(id, job);
    return job;
  } catch {
    return null;
  }
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
  return path.join(DATA_DIR, id);
}

async function persistJob(job: Job): Promise<void> {
  const jobDir = path.join(DATA_DIR, job.id);
  await ensureDir(jobDir);
  await fs.writeFile(
    path.join(jobDir, "job.json"),
    JSON.stringify(job, null, 2)
  );
}
