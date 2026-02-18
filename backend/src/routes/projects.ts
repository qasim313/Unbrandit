import { Router } from "express";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

const prisma = new PrismaClient();
const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1)
});

router.get("/", async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const projects = await prisma.project.findMany({
    where: { userId },
    include: { flavors: true }
  });
  return res.json(projects);
});

router.post("/", async (req: AuthRequest, res) => {
  const parse = createProjectSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const userId = req.user!.id;
  const project = await prisma.project.create({
    data: {
      name: parse.data.name,
      userId
    }
  });
  return res.status(201).json(project);
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
    return res.status(400).json({ error: "Invalid payload" });
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
      configJson: config
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
  return res.json(flavor);
});

const updateFlavorSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.record(z.any()).optional()
});

router.patch("/flavors/:flavorId", async (req: AuthRequest, res) => {
  const { flavorId } = req.params;
  const parse = updateFlavorSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "Invalid payload" });
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

  return res.json(updated);
});

export default router;

