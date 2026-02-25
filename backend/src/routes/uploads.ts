import { Router } from "express";
import multer from "multer";
import { AuthRequest } from "../middleware/auth";
import { z } from "zod";
import { BlobServiceClient } from "@azure/storage-blob";
import crypto from "crypto";
import axios from "axios";
import { generateProxyUrl } from "../lib/blobHelpers";

const WORKER_URL = process.env.WORKER_URL || "http://worker:5000";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB max
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype !== "application/vnd.android.package-archive" &&
      file.mimetype !== "application/zip" &&
      file.mimetype !== "application/x-authorware-bin" &&
      file.mimetype !== "application/octet-stream" &&
      !file.originalname.endsWith(".apk") &&
      !file.originalname.endsWith(".aab") &&
      !file.originalname.endsWith(".zip")
    ) {
      return cb(new Error("Invalid file type. Allowed: APK, AAB, ZIP"));
    }
    return cb(null, true);
  }
});

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for logos
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Invalid image type. Allowed: PNG, JPG, WebP, SVG"));
    }
    return cb(null, true);
  }
});

const keystoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for keystores
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith(".jks") && !file.originalname.endsWith(".keystore")) {
      return cb(new Error("Invalid file type. Allowed: JKS, Keystore"));
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
  projectId: z.string().cuid().optional(),
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
      return res.status(400).json({
        error: "Invalid payload",
        details: parse.error.flatten().fieldErrors
      });
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
        displayUrl: generateProxyUrl(blockBlob.url),
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
      return res.status(400).json({
        error: "Invalid payload",
        details: parse.error.flatten().fieldErrors
      });
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
        displayUrl: generateProxyUrl(blockBlob.url),
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

router.post(
  "/upload-logo",
  logoUpload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    try {
      const container = getBlobClient();
      await container.createIfNotExists();
      const key = `logos/${crypto.randomUUID()}-${req.file.originalname}`;
      const blockBlob = container.getBlockBlobClient(key);
      await blockBlob.uploadData(req.file.buffer, {
        blobHTTPHeaders: { blobContentType: req.file.mimetype }
      });

      return res.status(201).json({
        url: blockBlob.url,
        displayUrl: generateProxyUrl(blockBlob.url),
        storageKey: key,
        type: "LOGO"
      });
    } catch (err) {
      console.error("upload-logo storage error", err);
      return res.status(502).json({
        error: "Failed to store logo in Azure Blob Storage.",
        code: "STORAGE_ERROR"
      });
    }
  }
);

router.post(
  "/upload-keystore",
  keystoreUpload.single("file"),
  async (req: AuthRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "File required" });
    }

    try {
      const container = getBlobClient();
      await container.createIfNotExists();
      const key = `keystores/${crypto.randomUUID()}-${req.file.originalname}`;
      const blockBlob = container.getBlockBlobClient(key);
      await blockBlob.uploadData(req.file.buffer, {
        blobHTTPHeaders: { blobContentType: req.file.mimetype || "application/octet-stream" }
      });

      return res.status(201).json({
        url: blockBlob.url,
        storageKey: key,
        type: "KEYSTORE"
      });
    } catch (err) {
      console.error("upload-keystore storage error", err);
      return res.status(502).json({
        error: "Failed to store keystore in Azure Blob Storage.",
        code: "STORAGE_ERROR"
      });
    }
  }
);

export default router;

