import { Router } from "express";
import { z } from "zod";
import { PrismaClient, BuildStatus } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { buildQueue } from "../queue/init";
import { addSasUrls, deepSignBlobUrls, streamBlob } from "../lib/blobHelpers";

const BUILD_BLOB_FIELDS = ["downloadUrl", "sourceUrl"];

const prisma = new PrismaClient();
const router = Router();

router.get("/", async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const builds = await prisma.build.findMany({
    where: {
      flavor: {
        project: { userId }
      }
    },
    include: {
      flavor: {
        include: {
          project: true
        }
      },
      flavorVersion: true
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(builds.map(b => deepSignBlobUrls(b)));
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
    include: {
      flavorVersion: true
    },
    orderBy: { createdAt: "desc" }
  });
  return res.json(builds.map(b => deepSignBlobUrls(b)));
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
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
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

  const version = await prisma.flavorVersion.findFirst({
    where: { flavorId },
    orderBy: { createdAt: "desc" }
  });

  const build = await prisma.build.create({
    data: {
      flavorId,
      flavorVersionId: version?.id,
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
    config: (version?.configJson || flavor.configJson) as Record<string, unknown>,
    projectSourceUrl: (flavor as any).project?.sourceUrl || null
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
  return res.json(deepSignBlobUrls(build));
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

router.delete("/:buildId", async (req: AuthRequest, res) => {
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

  await prisma.build.delete({
    where: { id: buildId }
  });

  return res.json({ success: true });
});

router.post("/:buildId/clear-logs", async (req: AuthRequest, res) => {
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

  const updated = await prisma.build.update({
    where: { id: buildId },
    data: { logs: "" }
  });

  return res.json(updated);
});

/**
 * GET /builds/:buildId/download
 * Proxy-stream the build artifact through the backend.
 * This avoids needing SAS URLs entirely — the browser downloads from us,
 * and we download from Azure using the connection string credentials.
 */
router.get("/:buildId/download", async (req: AuthRequest, res) => {
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
  if (!build.downloadUrl) {
    return res.status(404).json({ error: "No download artifact available" });
  }

  try {
    const { stream, contentType, contentLength } = await streamBlob(build.downloadUrl);
    if (!stream) {
      return res.status(500).json({ error: "Failed to stream artifact" });
    }

    // Determine filename from the blob URL
    const urlParts = build.downloadUrl.split("/");
    const blobName = urlParts[urlParts.length - 1] || `build-${buildId}.apk`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${blobName}"`);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength.toString());
    }

    stream.pipe(res);
  } catch (err: any) {
    console.error("Download proxy error:", err);
    return res.status(500).json({ error: "Failed to download artifact" });
  }
});

export default router;

