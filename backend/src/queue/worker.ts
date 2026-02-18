import { Worker } from "bullmq";
import axios from "axios";
import { connection } from "./init";

interface BuildJobData {
  buildId: string;
  flavorId: string;
  buildType: "APK" | "AAB" | "BOTH";
  sourceUrl: string;
  sourceType: "APK" | "SOURCE";
  config: Record<string, unknown>;
}

export function initBuildWorker() {
  const workerServiceUrl = process.env.WORKER_SERVICE_URL || "http://worker:5000";

  // eslint-disable-next-line no-new
  new Worker<BuildJobData>(
    "builds",
    async (job) => {
      await axios.post(`${workerServiceUrl}/build`, job.data, {
        timeout: 1000 * 60 * 30 // 30 minutes
      });
    },
    {
      connection
    }
  );
}

