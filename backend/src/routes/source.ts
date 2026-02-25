import { Router, Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { PrismaClient } from "@prisma/client";
import { BlobServiceClient } from "@azure/storage-blob";
import * as unzipper from "unzipper";

const prisma = new PrismaClient();
const router = Router();

// ── Helpers ──

function getBlobServiceClient() {
    const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
    return BlobServiceClient.fromConnectionString(conn);
}

function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return null;
        return {
            containerName: parts[0],
            blobName: decodeURIComponent(parts.slice(1).join("/"))
        };
    } catch {
        return null;
    }
}

async function downloadSourceZip(sourceUrl: string): Promise<Buffer> {
    const client = getBlobServiceClient();
    const parsed = parseBlobUrl(sourceUrl);
    if (!parsed) throw new Error("Invalid source URL");

    const containerClient = client.getContainerClient(parsed.containerName);
    const blobClient = containerClient.getBlobClient(parsed.blobName);
    return blobClient.downloadToBuffer();
}

async function getProjectSource(projectId: string, userId: string): Promise<{ sourceUrl: string }> {
    const project = await prisma.project.findFirst({
        where: { id: projectId, userId },
        select: { sourceUrl: true }
    });
    if (!project || !project.sourceUrl) {
        throw new Error("NOT_FOUND");
    }
    return { sourceUrl: project.sourceUrl };
}

// Binary file extensions that should not be searched or returned as text
const BINARY_EXTENSIONS = new Set([
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico",
    ".9.png", ".dex", ".so", ".jar", ".class",
    ".keystore", ".jks", ".p12", ".pfx",
    ".mp3", ".wav", ".ogg", ".mp4", ".avi",
    ".ttf", ".otf", ".woff", ".woff2",
    ".zip", ".gz", ".tar", ".rar"
]);

function isBinaryFile(path: string): boolean {
    const lower = path.toLowerCase();
    for (const ext of BINARY_EXTENSIONS) {
        if (lower.endsWith(ext)) return true;
    }
    return false;
}

// ── File Tree ──

interface TreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: TreeNode[];
    size?: number;
}

function buildTree(entries: { path: string; size: number }[]): TreeNode[] {
    const root: TreeNode[] = [];
    const dirMap = new Map<string, TreeNode>();

    // Sort entries so directories are created in order
    entries.sort((a, b) => a.path.localeCompare(b.path));

    for (const entry of entries) {
        const parts = entry.path.split("/").filter(Boolean);
        let currentLevel = root;
        let currentPath = "";

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const isLast = i === parts.length - 1;

            if (isLast && !entry.path.endsWith("/")) {
                // File node
                currentLevel.push({
                    name: part,
                    path: currentPath,
                    type: "file",
                    size: entry.size
                });
            } else {
                // Directory node — find or create
                let dirNode = dirMap.get(currentPath);
                if (!dirNode) {
                    dirNode = {
                        name: part,
                        path: currentPath,
                        type: "directory",
                        children: []
                    };
                    dirMap.set(currentPath, dirNode);
                    currentLevel.push(dirNode);
                }
                currentLevel = dirNode.children!;
            }
        }
    }

    // Sort: directories first, then alphabetically
    function sortNodes(nodes: TreeNode[]) {
        nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
        for (const node of nodes) {
            if (node.children) sortNodes(node.children);
        }
    }
    sortNodes(root);
    return root;
}

// ── Routes ──

/**
 * GET /source/:projectId/load
 * Bulk-load: returns the file tree AND all text file contents in one response.
 * The frontend caches this so individual file clicks are instant.
 */
router.get("/:projectId/load", async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const { sourceUrl } = await getProjectSource(projectId, req.user!.id);

        const zipBuffer = await downloadSourceZip(sourceUrl);
        const directory = await unzipper.Open.buffer(zipBuffer);

        const entryInfos: { path: string; size: number }[] = [];
        const files: Record<string, string | null> = {};

        for (const f of directory.files) {
            if (f.type !== "File") continue;
            entryInfos.push({ path: f.path, size: f.uncompressedSize });

            if (isBinaryFile(f.path)) {
                files[f.path] = null; // binary marker
            } else if (f.uncompressedSize > 1024 * 1024) {
                files[f.path] = null; // too large
            } else {
                try {
                    files[f.path] = (await f.buffer()).toString("utf-8");
                } catch {
                    files[f.path] = null;
                }
            }
        }

        const tree = buildTree(entryInfos);
        return res.json({ tree, totalFiles: entryInfos.length, files });
    } catch (err: any) {
        if (err.message === "NOT_FOUND") {
            return res.status(404).json({ error: "Project not found or no source available" });
        }
        console.error("source/load error:", err);
        return res.status(500).json({ error: "Failed to load source" });
    }
});

/**
 * GET /source/:projectId/tree
 * Returns a nested JSON file tree from the decompiled source zip.
 */
router.get("/:projectId/tree", async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const { sourceUrl } = await getProjectSource(projectId, req.user!.id);

        const zipBuffer = await downloadSourceZip(sourceUrl);
        const directory = await unzipper.Open.buffer(zipBuffer);

        const entries = directory.files
            .filter((f) => f.type === "File")
            .map((f) => ({
                path: f.path,
                size: f.uncompressedSize
            }));

        const tree = buildTree(entries);
        return res.json({ tree, totalFiles: entries.length });
    } catch (err: any) {
        if (err.message === "NOT_FOUND") {
            return res.status(404).json({ error: "Project not found or no source available" });
        }
        console.error("source/tree error:", err);
        return res.status(500).json({ error: "Failed to load source tree" });
    }
});

/**
 * GET /source/:projectId/file/raw?path=res/mipmap-hdpi/ic_launcher.png
 * Serves a binary file directly from the source zip with proper Content-Type.
 * Used for image previews in the Advanced Config panel.
 * MUST be defined before /:projectId/file to avoid Express route shadowing.
 */
router.get("/:projectId/file/raw", async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const filePath = req.query.path as string;
        if (!filePath) {
            return res.status(400).json({ error: "path query parameter required" });
        }

        const { sourceUrl } = await getProjectSource(projectId, req.user!.id);
        const zipBuffer = await downloadSourceZip(sourceUrl);
        const directory = await unzipper.Open.buffer(zipBuffer);

        const entry = directory.files.find((f) => f.path === filePath);
        if (!entry) {
            return res.status(404).json({ error: "File not found in source" });
        }

        const buffer = await entry.buffer();

        const ext = filePath.split(".").pop()?.toLowerCase() || "";
        const mimeTypes: Record<string, string> = {
            png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
            gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
            bmp: "image/bmp", ico: "image/x-icon",
            xml: "text/xml", json: "application/json",
            txt: "text/plain", html: "text/html",
        };
        const contentType = mimeTypes[ext] || "application/octet-stream";

        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Length", buffer.length.toString());
        res.setHeader("Cache-Control", "public, max-age=3600");
        return res.send(buffer);
    } catch (err: any) {
        if (err.message === "NOT_FOUND") {
            return res.status(404).json({ error: "Project not found or no source available" });
        }
        console.error("source/file/raw error:", err);
        return res.status(500).json({ error: "Failed to read file" });
    }
});

/**
 * GET /source/:projectId/file?path=res/values/strings.xml
 * Returns the text content of a single file from the zip.
 */
router.get("/:projectId/file", async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const filePath = req.query.path as string;
        if (!filePath) {
            return res.status(400).json({ error: "path query parameter required" });
        }

        const { sourceUrl } = await getProjectSource(projectId, req.user!.id);
        const zipBuffer = await downloadSourceZip(sourceUrl);
        const directory = await unzipper.Open.buffer(zipBuffer);

        const entry = directory.files.find((f) => f.path === filePath);
        if (!entry) {
            return res.status(404).json({ error: "File not found in source" });
        }

        if (isBinaryFile(filePath)) {
            return res.json({
                path: filePath,
                binary: true,
                size: entry.uncompressedSize,
                content: null
            });
        }

        const content = (await entry.buffer()).toString("utf-8");
        return res.json({
            path: filePath,
            binary: false,
            size: entry.uncompressedSize,
            content
        });
    } catch (err: any) {
        if (err.message === "NOT_FOUND") {
            return res.status(404).json({ error: "Project not found or no source available" });
        }
        console.error("source/file error:", err);
        return res.status(500).json({ error: "Failed to read file" });
    }
});

/**
 * POST /source/:projectId/search
 * Search through all text files in the source zip.
 * Body: { query: string, caseSensitive?: boolean, regex?: boolean }
 */
router.post("/:projectId/search", async (req: AuthRequest, res: Response) => {
    try {
        const { projectId } = req.params;
        const { query, caseSensitive = false, regex = false } = req.body as {
            query: string;
            caseSensitive?: boolean;
            regex?: boolean;
        };

        if (!query || query.length < 1) {
            return res.status(400).json({ error: "Search query required" });
        }

        const { sourceUrl } = await getProjectSource(projectId, req.user!.id);
        const zipBuffer = await downloadSourceZip(sourceUrl);
        const directory = await unzipper.Open.buffer(zipBuffer);

        const MAX_RESULTS = 200;
        const results: { file: string; lineNumber: number; content: string; matchStart: number; matchEnd: number }[] = [];

        let searchPattern: RegExp;
        if (regex) {
            try {
                searchPattern = new RegExp(query, caseSensitive ? "g" : "gi");
            } catch {
                return res.status(400).json({ error: "Invalid regex pattern" });
            }
        } else {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            searchPattern = new RegExp(escaped, caseSensitive ? "g" : "gi");
        }

        for (const entry of directory.files) {
            if (results.length >= MAX_RESULTS) break;
            if (entry.type !== "File") continue;
            if (isBinaryFile(entry.path)) continue;

            // Skip very large files (> 1MB)
            if (entry.uncompressedSize > 1024 * 1024) continue;

            try {
                const content = (await entry.buffer()).toString("utf-8");
                const lines = content.split("\n");

                for (let i = 0; i < lines.length; i++) {
                    if (results.length >= MAX_RESULTS) break;
                    const line = lines[i];
                    searchPattern.lastIndex = 0;
                    const match = searchPattern.exec(line);
                    if (match) {
                        results.push({
                            file: entry.path,
                            lineNumber: i + 1,
                            content: line.substring(0, 300), // Truncate long lines
                            matchStart: match.index,
                            matchEnd: match.index + match[0].length
                        });
                    }
                }
            } catch {
                // Skip files that can't be read as text
            }
        }

        return res.json({
            query,
            totalResults: results.length,
            capped: results.length >= MAX_RESULTS,
            results
        });
    } catch (err: any) {
        if (err.message === "NOT_FOUND") {
            return res.status(404).json({ error: "Project not found or no source available" });
        }
        console.error("source/search error:", err);
        return res.status(500).json({ error: "Failed to search source" });
    }
});

export default router;
