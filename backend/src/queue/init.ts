import { Queue } from "bullmq";
import { initBuildWorker, initDecompileWorker } from "./worker";

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

export const connection = {
  host: redisConfig.host,
  port: redisConfig.port,
  password: redisConfig.password,
  maxRetriesPerRequest: null as null,
};

export const buildQueue = new Queue("builds", {
  connection
});

export const decompileQueue = new Queue("decompile", {
  connection
});

export async function initQueues() {
  await Promise.all([
    buildQueue.waitUntilReady(),
    decompileQueue.waitUntilReady(),
  ]);
  initBuildWorker();
  initDecompileWorker();
}
