import { Router, Request, Response } from "express";
import { PrismaClient, BuildStatus, ProjectStatus } from "@prisma/client";
import { deepSignBlobUrls } from "../lib/blobHelpers";

const prisma = new PrismaClient();
const router = Router();

function verifyInternalToken(req: Request, res: Response): boolean {
  const internalToken = process.env.BACKEND_INTERNAL_TOKEN;
  if (internalToken && req.headers["x-internal-token"] !== internalToken) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!internalToken && process.env.NODE_ENV === "production") {
    res.status(500).json({ error: "BACKEND_INTERNAL_TOKEN must be configured in production" });
    return false;
  }
  return true;
}

// Internal endpoint for worker to push logs and status updates.
// Protected via BACKEND_INTERNAL_TOKEN and NOT behind JWT middleware.
router.post("/builds/:buildId/logs", async (req, res) => {
  if (!verifyInternalToken(req, res)) return;

  const { buildId } = req.params;
  const { append, status, downloadUrl } = req.body as {
    append?: string;
    status?: BuildStatus;
    downloadUrl?: string;
  };

  const build = await prisma.build.findUnique({
    where: { id: buildId }
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
  io.to(build.id).emit("buildUpdate", deepSignBlobUrls({
    buildId: build.id,
    status: updated.status,
    logs: updated.logs,
    downloadUrl: updated.downloadUrl
  }));

  return res.json(deepSignBlobUrls(updated));
});

router.post("/projects/:projectId/logs", async (req, res) => {
  if (!verifyInternalToken(req, res)) return;

  const { projectId } = req.params;
  const { append, status, metadata } = req.body as {
    append?: string;
    status?: ProjectStatus;
    metadata?: {
      packageName?: string;
      appName?: string;
      versionName?: string;
      versionCode?: number;
      logoUrl?: string;
      sourceUrl?: string;
    };
  };

  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      logs: append ? project.logs + append : project.logs,
      status: status ?? project.status,
      packageName: metadata?.packageName ?? project.packageName,
      appName: metadata?.appName ?? project.appName,
      versionName: metadata?.versionName ?? project.versionName,
      versionCode: metadata?.versionCode ?? project.versionCode,
      logoUrl: metadata?.logoUrl ?? project.logoUrl,
      sourceUrl: metadata?.sourceUrl ?? project.sourceUrl,
    }
  });

  const io = req.app.get("io");
  io.to(project.id).emit("projectUpdate", deepSignBlobUrls({
    projectId: project.id,
    status: updated.status,
    logs: updated.logs,
    metadata: {
      packageName: updated.packageName,
      appName: updated.appName,
      versionName: updated.versionName,
      versionCode: updated.versionCode,
      logoUrl: updated.logoUrl,
      sourceUrl: updated.sourceUrl
    }
  }));

  return res.json(deepSignBlobUrls(updated));
});

router.patch("/flavors/:flavorId/config", async (req, res) => {
  if (!verifyInternalToken(req, res)) return;

  const { flavorId } = req.params;
  const { config } = req.body as { config: any };

  const flavor = await prisma.flavor.findUnique({
    where: { id: flavorId }
  });

  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }

  // Update flavor config
  const updatedFlavor = await prisma.flavor.update({
    where: { id: flavorId },
    data: { configJson: config }
  });

  // Create new version
  const version = await prisma.flavorVersion.create({
    data: {
      flavorId,
      configJson: config
    }
  });

  return res.json({ flavor: updatedFlavor, version });
});

export default router;

