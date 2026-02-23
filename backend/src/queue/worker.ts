import { Worker } from "bullmq";
import axios from "axios";

function parseRedisUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "redis",
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password || undefined,
    };
  } catch {
    return { host: "redis", port: 6379 };
  }
}

const redisConfig = parseRedisUrl(process.env.REDIS_URL || "redis://redis:6379");

const workerConnection = {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  maxRetriesPerRequest: null as null,
};

interface BuildJobData {
  buildId: string;
  flavorId: string;
  sourceUrl: string;
  sourceType: string;
  config: Record<string, any>;
  buildType: string;
  projectSourceUrl?: string | null;
}

export function initBuildWorker() {
  new Worker(
    "builds",
    async (job) => {
      const data = job.data as BuildJobData;
      const workerUrl = process.env.WORKER_SERVICE_URL || "http://worker:5000";
      await axios.post(`${workerUrl}/build`, data);
    },
    {
      connection: workerConnection
    }
  );
}

export function initDecompileWorker() {
  new Worker(
    "decompile",
    async (job) => {
      const { projectId, apkUrl } = job.data;
      const workerUrl = process.env.WORKER_SERVICE_URL || "http://worker:5000";
      await axios.post(`${workerUrl}/decompile`, { projectId, apkUrl });
    },
    {
      connection: workerConnection
    }
  );
}
