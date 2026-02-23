import { Router } from "express";
import { z } from "zod";
import { PrismaClient, ProjectStatus } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";
import { decompileQueue } from "../queue/init";
import { addSasUrls, deepSignBlobUrls } from "../lib/blobHelpers";

const prisma = new PrismaClient();
const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1),
  originalApkUrl: z.string().url().optional()
});

const BLOB_FIELDS = ["logoUrl", "sourceUrl", "originalApkUrl"];

router.get("/", async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const projects = await prisma.project.findMany({
    where: { userId },
    include: { flavors: true }
  });
  return res.json(projects.map(p => deepSignBlobUrls(p)));
});

router.post("/", async (req: AuthRequest, res) => {
  const parse = createProjectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
  }
  const userId = req.user!.id;
  const project = await prisma.project.create({
    data: {
      name: parse.data.name,
      userId,
      originalApkUrl: parse.data.originalApkUrl,
      status: parse.data.originalApkUrl ? ProjectStatus.DECOMPILING : ProjectStatus.PENDING
    }
  });

  if (project.originalApkUrl) {
    await decompileQueue.add("decompile", {
      projectId: project.id,
      apkUrl: project.originalApkUrl
    });
  }

  return res.status(201).json(project);
});

router.get("/:projectId", async (req: AuthRequest, res) => {
  const { projectId } = req.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user!.id },
    include: { flavors: true }
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  return res.json(deepSignBlobUrls(project));
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional()
});

router.patch("/:projectId", async (req: AuthRequest, res) => {
  const { projectId } = req.params;
  const parse = updateProjectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user!.id }
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: parse.data
  });
  return res.json(deepSignBlobUrls(updated));
});

router.delete("/:projectId", async (req: AuthRequest, res) => {
  try {
    const { projectId } = req.params;
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.user!.id },
      include: { flavors: true }
    });
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }
    await prisma.$transaction(async (tx) => {
      for (const flavor of project.flavors) {
        await tx.build.deleteMany({ where: { flavorId: flavor.id } });
        await tx.flavorVersion.deleteMany({ where: { flavorId: flavor.id } });
      }
      await tx.flavor.deleteMany({ where: { projectId } });
      await tx.project.delete({ where: { id: projectId } });
    });
    return res.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2003") {
      return res.status(409).json({ error: "Could not delete project: dependent data exists." });
    }
    console.error("Project delete error:", err);
    return res.status(500).json({ error: "Failed to delete project." });
  }
});

const createFlavorSchema = z.object({
  projectId: z.string().cuid(),
  name: z.string().min(1),
  config: z.record(z.any())
});

// matches POST /create-flavor (wired in index)
router.post("/create-flavor", async (req: AuthRequest, res) => {
  const parse = createFlavorSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
  }
  const { projectId, name, config } = parse.data;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user!.id }
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  const flavor = await prisma.flavor.create({
    data: {
      name,
      projectId,
      configJson: config,
      versions: {
        create: {
          configJson: config
        }
      }
    }
  });
  return res.status(201).json(flavor);
});

router.get("/:projectId/flavors", async (req: AuthRequest, res) => {
  const { projectId } = req.params;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.user!.id }
  });
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  const flavors = await prisma.flavor.findMany({
    where: { projectId }
  });
  return res.json(flavors);
});

router.get("/flavors/:flavorId", async (req: AuthRequest, res) => {
  const { flavorId } = req.params;
  const flavor = await prisma.flavor.findFirst({
    where: {
      id: flavorId,
      project: {
        userId: req.user!.id
      }
    },
    include: {
      project: true
    }
  });
  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }
  return res.json(deepSignBlobUrls(flavor));
});

const updateFlavorSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.any()).optional()
});

router.patch("/flavors/:flavorId", async (req: AuthRequest, res) => {
  const { flavorId } = req.params;
  const parse = updateFlavorSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid payload",
      details: parse.error.flatten().fieldErrors
    });
  }
  const flavor = await prisma.flavor.findFirst({
    where: {
      id: flavorId,
      project: {
        userId: req.user!.id
      }
    }
  });
  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }

  const data: any = {};
  if (parse.data.name) data.name = parse.data.name;
  if (parse.data.config) data.configJson = parse.data.config;

  const updated = await prisma.flavor.update({
    where: { id: flavorId },
    data
  });

  if (parse.data.config) {
    await prisma.flavorVersion.create({
      data: {
        flavorId,
        configJson: updated.configJson as any
      }
    });
  }

  return res.json(updated);
});

router.delete("/flavors/:flavorId", async (req: AuthRequest, res) => {
  const { flavorId } = req.params;
  const flavor = await prisma.flavor.findFirst({
    where: {
      id: flavorId,
      project: { userId: req.user!.id }
    }
  });
  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }
  await prisma.$transaction(async (tx) => {
    await tx.build.deleteMany({ where: { flavorId } });
    await tx.flavorVersion.deleteMany({ where: { flavorId } });
    await tx.flavor.delete({ where: { id: flavorId } });
  });
  return res.json({ success: true });
});

router.get("/flavors/:flavorId/versions", async (req: AuthRequest, res) => {
  const { flavorId } = req.params;
  const flavor = await prisma.flavor.findFirst({
    where: {
      id: flavorId,
      project: { userId: req.user!.id }
    }
  });
  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }

  const versions = await prisma.flavorVersion.findMany({
    where: { flavorId },
    orderBy: { createdAt: "desc" }
  });

  return res.json(versions);
});

router.post("/flavors/:flavorId/rollback/:versionId", async (req: AuthRequest, res) => {
  const { flavorId, versionId } = req.params;
  const userId = req.user!.id;

  const flavor = await prisma.flavor.findFirst({
    where: {
      id: flavorId,
      project: { userId }
    }
  });

  if (!flavor) {
    return res.status(404).json({ error: "Flavor not found" });
  }

  const version = await prisma.flavorVersion.findUnique({
    where: { id: versionId }
  });

  if (!version || version.flavorId !== flavorId) {
    return res.status(404).json({ error: "Version not found" });
  }

  const updated = await prisma.flavor.update({
    where: { id: flavorId },
    data: {
      configJson: version.configJson as any
    }
  });

  // Create a new version for this rollback to keep the linear history clear
  const newVersion = await prisma.flavorVersion.create({
    data: {
      flavorId,
      configJson: version.configJson as any
    }
  });

  return res.json({ flavor: updated, version: newVersion });
});

export default router;

