"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import api from "@/lib/api";
import { AppShell } from "@/components/app-shell";

const SOCKET_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export default function ProcessingPage() {
    const { projectId } = useParams<{ projectId: string }>();
    const router = useRouter();
    const [logs, setLogs] = useState("");
    const [status, setStatus] = useState("DECOMPILING");
    const logEndRef = useRef<HTMLDivElement>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        // 1. Fetch initial status & logs
        api.get(`/projects/${projectId}`)
            .then((res) => {
                setLogs(res.data.logs || "");
                setStatus(res.data.status);
                if (res.data.status === "READY") {
                    router.push(`/projects/${projectId}`);
                }
            })
            .catch(() => { });

        // 2. Setup Socket.io
        const socket = io(SOCKET_URL);
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("Connected to socket");
            socket.emit("subscribeProject", projectId);
        });

        socket.on("projectUpdate", (data: any) => {
            if (data.projectId === projectId) {
                if (data.logs !== undefined) setLogs(data.logs);
                if (data.status) {
                    setStatus(data.status);
                    if (data.status === "READY") {
                        setTimeout(() => {
                            router.push(`/projects/${projectId}`);
                        }, 1000);
                    }
                }
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [projectId, router]);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [logs]);

    return (
        <AppShell>
            <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
                <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 pb-4 border-b border-gh-border/50">
                    <div className="space-y-1 text-center md:text-left">
                        <h1 className="text-2xl font-black text-gh-default tracking-tight flex items-center justify-center md:justify-start gap-3">
                            {status === "FAILED" ? (
                                <span className="text-danger flex items-center gap-2">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                    Processing Failed
                                </span>
                            ) : (
                                <>
                                    <div className="relative">
                                        <span className="absolute inset-0 rounded-full bg-android/20 animate-ping" />
                                        <svg className="animate-spin text-android" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                        </svg>
                                    </div>
                                    Decompiling Base APK
                                </>
                            )}
                        </h1>
                        <p className="text-sm text-gh-muted max-w-lg">
                            Extracting resources, manifest, and assets. This one-time process prepares your base template for white-labeling.
                        </p>
                    </div>
                    {status !== "FAILED" && (
                        <div className="px-4 py-2 rounded-xl bg-android/5 border border-android/20 text-android text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                            Server Side Processing
                        </div>
                    )}
                </div>

                <div className="rounded-[2rem] border border-gh-border bg-[#0d1117] overflow-hidden shadow-2xl shadow-android/5">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gh-border bg-gh-surface/50 backdrop-blur-md">
                        <div className="flex gap-2">
                            <div className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] shadow-[0_0_8px_rgba(255,95,86,0.3)]" />
                            <div className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] shadow-[0_0_8px_rgba(255,189,46,0.3)]" />
                            <div className="w-3.5 h-3.5 rounded-full bg-[#27c93f] shadow-[0_0_8px_rgba(39,201,63,0.3)]" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-gh-faint uppercase tracking-widest bg-gh-bg px-3 py-1 rounded-full border border-gh-border">apk-extractor.sh</span>
                        </div>
                    </div>
                    <div className="p-6 font-mono text-[11px] leading-relaxed text-android/70 h-[550px] overflow-y-auto scrollbar-thin scrollbar-thumb-gh-border bg-[#0d1117]">
                        {logs.split("\n").map((line, i) => (
                            <div key={i} className="min-h-[1.4rem] flex group">
                                <span className="text-gh-faint/30 mr-5 select-none w-8 text-right shrink-0 group-hover:text-gh-faint transition-colors">{i + 1}</span>
                                <span className={line.toLowerCase().includes("error") ? "text-danger font-bold" : line.toLowerCase().includes("warning") ? "text-amber-400" : ""}>{line}</span>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>

                {status === "FAILED" && (
                    <div className="flex justify-center pt-4">
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="px-8 h-12 rounded-xl bg-gh-elevated hover:bg-gh-border text-gh-default text-sm font-bold transition-all hover:scale-[1.02] active:scale-95 border border-gh-border shadow-lg"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                )}
            </div>
        </AppShell>
    );
}
