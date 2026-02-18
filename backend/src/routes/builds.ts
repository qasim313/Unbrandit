import { Router } from "express";
import { z } from "zod";
import { PrismaClient, BuildStatus } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { buildQueue } from "../queue/init";

const prisma = new PrismaClient();
const router = Router();

router.get("/", async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const builds = await prisma.build.findMany({
    where: {
      flavor: {
        project: {
          userId
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(builds);
});

router.get("/flavor/:flavorId", async (req: AuthRequest, res) => {
  const { flavorId } = req.params;
  const userId = req.user!.id;
  const builds = await prisma.build.findMany({
    where: {
      flavorId,
      flavor: {
        project: {
          userId
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(builds);
});

const buildSchema = z.object({
  flavorId: z.string().cuid(),
  buildType: z.enum(["APK", "AAB", "BOTH"]).default("APK"),
  sourceUrl: z.string().url(),
  sourceType: z.enum(["APK", "SOURCE"])
});

// matches POST /build (wired in index)
router.post("/build", async (req: AuthRequest, res) => {
  const parse = buildSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const { flavorId, buildType, sourceUrl, sourceType } = parse.data;
  const flavor = await prisma.flavor.findFirst({
    where: {
      id: flavorId,
      project: { userId: req.user!.id }
    },
    include: { project: true }
  });
  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }

  const build = await prisma.build.create({
    data: {
      flavorId,
      status: BuildStatus.QUEUED,
      sourceUrl,
      sourceType,
      buildType
    }
  });

  await buildQueue.add("build", {
    buildId: build.id,
    flavorId,
    buildType,
    sourceUrl,
    sourceType,
    config: flavor.configJson as Record<string, unknown>
  });

  return res.status(202).json(build);
});

router.get("/:buildId", async (req: AuthRequest, res) => {
  const { buildId } = req.params;
  const build = await prisma.build.findFirst({
    where: {
      id: buildId,
      flavor: {
        project: { userId: req.user!.id }
      }
    }
  });
  if (!build) {
    return res.status(404).json({ error: "Build not found" });
  }
  return res.json(build);
});

router.post("/:buildId/logs", async (req: AuthRequest, res) => {
  const { buildId } = req.params;
  const { append, status, downloadUrl } = req.body as {
    append?: string;
    status?: BuildStatus;
    downloadUrl?: string;
  };

  const build = await prisma.build.findFirst({
    where: {
      id: buildId,
      flavor: {
        project: { userId: req.user!.id }
      }
    }
  });
  if (!build) {
    return res.status(404).json({ error: "Build not found" });
  }

  const updated = await prisma.build.update({
    where: { id: build.id },
    data: {
      logs: append ? build.logs + append : build.logs,
      status: status ?? build.status,
      downloadUrl: downloadUrl ?? build.downloadUrl
    }
  });

  const io = req.app.get("io");
  io.to(build.id).emit("buildUpdate", {
    buildId: build.id,
    status: updated.status,
    logs: updated.logs,
    downloadUrl: updated.downloadUrl
  });

  return res.json(updated);
});

export default router;

