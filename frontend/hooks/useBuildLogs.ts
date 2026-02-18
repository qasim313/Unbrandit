"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function useBuildLogs(buildId: string) {
  const [logs, setLogs] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_WS_URL || "");
    }
    const s = socket;
    s.emit("subscribeBuild", buildId);

    function onUpdate(payload: any) {
      if (payload.buildId !== buildId) return;
      if (payload.logs) setLogs(payload.logs);
      if (payload.status) setStatus(payload.status);
      if (payload.downloadUrl) setDownloadUrl(payload.downloadUrl);
    }

    s.on("buildUpdate", onUpdate);

    return () => {
      s.off("buildUpdate", onUpdate);
    };
  }, [buildId]);

  return { logs, status, downloadUrl };
}

