import { Router } from "express";
import { PrismaClient, BuildStatus } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

// Internal endpoint for worker to push logs and status updates.
// Protected via BACKEND_INTERNAL_TOKEN and NOT behind JWT middleware.
router.post("/builds/:buildId/logs", async (req, res) => {
  const internalToken = process.env.BACKEND_INTERNAL_TOKEN;
  if (!internalToken || req.headers["x-internal-token"] !== internalToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

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
  io.to(build.id).emit("buildUpdate", {
    buildId: build.id,
    status: updated.status,
    logs: updated.logs,
    downloadUrl: updated.downloadUrl
  });

  return res.json(updated);
});

export default router;

