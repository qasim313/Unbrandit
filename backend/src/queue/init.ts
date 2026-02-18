import { Queue } from "bullmq";
import { initBuildWorker } from "./worker";

export const connection = {
  url: process.env.REDIS_URL || "redis://redis:6379"
};

export const buildQueue = new Queue("builds", {
  connection
});

export async function initQueues() {
  await buildQueue.waitUntilReady();
  initBuildWorker();
}


