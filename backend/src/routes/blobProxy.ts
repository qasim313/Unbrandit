import { Router, Request, Response } from "express";
import { streamBlob } from "../lib/blobHelpers";

const router = Router();

/**
 * GET /api/blob-proxy?url=<encoded-azure-blob-url>
 *
 * Streams the blob content to the client. This avoids SAS token
 * version / expiry issues by keeping all Azure auth server-side.
 */
router.get("/", async (req: Request, res: Response) => {
    let blobUrl = req.query.url as string;
    if (!blobUrl) {
        return res.status(400).json({ error: "Missing blob URL" });
    }

    // Unwrap nested proxy URLs — extract the actual Azure blob URL
    const MAX_UNWRAP = 5;
    for (let i = 0; i < MAX_UNWRAP; i++) {
        if (blobUrl.includes("blob-proxy")) {
            try {
                const parsed = new URL(blobUrl);
                const inner = parsed.searchParams.get("url");
                if (inner) { blobUrl = inner; continue; }
            } catch { /* not a valid URL, continue */ }
        }
        break;
    }

    if (!blobUrl.includes("blob.core.windows.net")) {
        return res.status(400).json({ error: "Invalid blob URL" });
    }

    try {
        const { stream, contentType, contentLength } = await streamBlob(blobUrl);
        if (!stream) {
            return res.status(404).json({ error: "Blob not found" });
        }

        res.setHeader("Content-Type", contentType);
        if (contentLength) res.setHeader("Content-Length", contentLength);
        res.setHeader("Cache-Control", "public, max-age=3600");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Access-Control-Allow-Origin", "*");

        (stream as NodeJS.ReadableStream).pipe(res);
    } catch (err: any) {
        console.error("Blob proxy error:", err?.message || err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to stream blob" });
        }
    }
});

export default router;
