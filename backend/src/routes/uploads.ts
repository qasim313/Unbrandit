import { Router } from "express";
import multer from "multer";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { BlobServiceClient } from "@azure/storage-blob";
import crypto from "crypto";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype !== "application/vnd.android.package-archive" &&
      file.mimetype !== "application/zip" &&
      !file.originalname.endsWith(".apk") &&
      !file.originalname.endsWith(".zip")
    ) {
      return cb(new Error("Invalid file type"));
    }
    return cb(null, true);
  }
});

function getBlobClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
  }
  const blobServiceClient = BlobServiceClient.fromConnectionString(conn);
  const containerName = process.env.AZURE_STORAGE_CONTAINER || "uploads";
  return blobServiceClient.getContainerClient(containerName);
}

async function virusScanHook(_buffer: Buffer): Promise<void> {
  // integrate with real AV like ClamAV in production
  return;
}

const uploadSchema = z.object({
  projectId: z.string().cuid(),
  flavorId: z.string().cuid().optional()
});

router.post(
  "/upload-apk",
  upload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    try {
      await virusScanHook(req.file.buffer);
    } catch {
      return res.status(400).json({ error: "File failed virus scan" });
    }

    const parse = uploadSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    try {
      const container = getBlobClient();
      await container.createIfNotExists();
      const key = `apk/${crypto.randomUUID()}-${req.file.originalname}`;
      const blockBlob = container.getBlockBlobClient(key);
      await blockBlob.uploadData(req.file.buffer, {
        blobHTTPHeaders: { blobContentType: req.file.mimetype }
      });

      return res.status(201).json({
        url: blockBlob.url,
        storageKey: key,
        type: "APK"
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("upload-apk storage error", err);
      return res.status(502).json({
        error: "Failed to store file in Azure Blob Storage. Check credentials.",
        code: "STORAGE_ERROR"
      });
    }
  }
);

router.post(
  "/upload-source",
  upload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    try {
      await virusScanHook(req.file.buffer);
    } catch {
      return res.status(400).json({ error: "File failed virus scan" });
    }

    const parse = uploadSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    try {
      const container = getBlobClient();
      await container.createIfNotExists();
      const key = `source/${crypto.randomUUID()}-${req.file.originalname}`;
      const blockBlob = container.getBlockBlobClient(key);
      await blockBlob.uploadData(req.file.buffer, {
        blobHTTPHeaders: { blobContentType: req.file.mimetype }
      });

      return res.status(201).json({
        url: blockBlob.url,
        storageKey: key,
        type: "SOURCE"
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("upload-source storage error", err);
      return res.status(502).json({
        error: "Failed to store file in Azure Blob Storage. Check credentials.",
        code: "STORAGE_ERROR"
      });
    }
  }
);

export default router;

