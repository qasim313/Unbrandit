import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";

let _blobServiceClient: BlobServiceClient | null = null;
let _sharedKeyCredential: StorageSharedKeyCredential | null = null;

function getBlobServiceClient(): BlobServiceClient {
    if (!_blobServiceClient) {
        const conn = process.env.AZURE_STORAGE_CONNECTION_STRING;
        if (!conn) throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
        _blobServiceClient = BlobServiceClient.fromConnectionString(conn);

        // Extract account name and key from connection string for SAS generation
        const accountNameMatch = conn.match(/AccountName=([^;]+)/);
        const accountKeyMatch = conn.match(/AccountKey=([^;]+)/);
        if (accountNameMatch && accountKeyMatch) {
            _sharedKeyCredential = new StorageSharedKeyCredential(
                accountNameMatch[1],
                accountKeyMatch[1]
            );
        }
    }
    return _blobServiceClient;
}

function getSharedKeyCredential(): StorageSharedKeyCredential | null {
    if (!_sharedKeyCredential) getBlobServiceClient(); // triggers lazy init
    return _sharedKeyCredential;
}

/**
 * Parse a blob URL into container name and blob name.
 * URL format: https://<account>.blob.core.windows.net/<container>/<blob_name>
 */
function parseBlobUrl(url: string): { containerName: string; blobName: string } | null {
    try {
        const parsed = new URL(url);
        if (!parsed.hostname.endsWith(".blob.core.windows.net")) return null;
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

/**
 * Convert a raw Azure blob URL into a backend proxy URL.
 * The proxy endpoint streams the blob content directly, avoiding
 * SAS token version / expiry issues entirely.
 */
export function generateProxyUrl(blobUrl: string): string {
    if (!blobUrl) return blobUrl;
    try {
        const parsed = parseBlobUrl(blobUrl);
        if (!parsed) return blobUrl;
        const backendUrl = (process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, "");
        return `${backendUrl}/api/blob-proxy?url=${encodeURIComponent(blobUrl)}`;
    } catch {
        return blobUrl;
    }
}

/** @deprecated Use generateProxyUrl instead */
export const generateSasUrl = generateProxyUrl;

/**
 * Add SAS tokens to all blob URL fields in an object.
 * Mutates and returns the same object for convenience.
 */
export function addSasUrls<T extends Record<string, any>>(obj: T, fields: string[]): T {
    for (const field of fields) {
        if (obj[field] && typeof obj[field] === "string" && obj[field].includes("blob.core.windows.net")) {
            (obj as any)[field] = generateSasUrl(obj[field]);
        }
    }
    return obj;
}

/**
 * Recursively walk an object and convert ANY Azure blob URL into a proxy URL.
 * This catches nested objects (e.g. flavor.project.logoUrl, configJson.branding.logoUrl).
 */
export function deepSignBlobUrls<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") {
        if (obj.includes("blob.core.windows.net") && !obj.includes("blob-proxy")) {
            return generateProxyUrl(obj) as any;
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => deepSignBlobUrls(item)) as any;
    }
    if (typeof obj === "object") {
        const result: any = { ...obj };
        for (const key of Object.keys(result)) {
            result[key] = deepSignBlobUrls(result[key]);
        }
        return result;
    }
    return obj;
}

/**
 * Stream a blob's content by its URL.
 * Used by the proxy endpoint to serve private blobs to the frontend.
 */
export async function streamBlob(blobUrl: string) {
    const client = getBlobServiceClient();
    const parsed = parseBlobUrl(blobUrl);
    if (!parsed) throw new Error("Invalid blob URL");

    const containerClient = client.getContainerClient(parsed.containerName);
    const blobClient = containerClient.getBlobClient(parsed.blobName);
    const downloadResponse = await blobClient.download(0);

    return {
        stream: downloadResponse.readableStreamBody,
        contentType: downloadResponse.contentType || "application/octet-stream",
        contentLength: downloadResponse.contentLength,
    };
}
