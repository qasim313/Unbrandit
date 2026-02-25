"use client";

import React, { useEffect } from "react";

export interface Override {
    type: "string" | "resource" | "file";
    search?: string;
    replace?: string;
    path?: string;
    replaceUrl?: string;
    fileName?: string;
}

interface Props {
    projectId: string;
    flavorId: string;
    overrides: Override[];
    setOverrides: (overrides: Override[]) => void;
}

export function AdvancedConfig({ projectId, flavorId, overrides, setOverrides }: Props) {
    // Listen for override changes from the editor tab via localStorage
    useEffect(() => {
        const key = `editor-overrides-${flavorId}`;
        const handler = (e: StorageEvent) => {
            if (e.key === key && e.newValue) {
                try { setOverrides(JSON.parse(e.newValue)); } catch { }
            }
        };
        window.addEventListener("storage", handler);
        return () => window.removeEventListener("storage", handler);
    }, [flavorId, setOverrides]);

    const handleOpen = () => {
        window.open(`/editor/${projectId}?flavorId=${flavorId}`, "_blank");
    };

    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={handleOpen}
                className="w-full p-4 border border-dashed border-[#30363d] rounded-xl hover:border-[#007acc]/60 transition-all group flex items-center gap-4 hover:bg-[#007acc]/5"
            >
                <div className="w-12 h-12 rounded-lg bg-[#161b22] border border-[#30363d] flex items-center justify-center text-xl group-hover:border-[#007acc]/40 group-hover:shadow-lg group-hover:shadow-[#007acc]/10 transition-all">
                    ⚙️
                </div>
                <div className="text-left flex-1">
                    <p className="text-sm font-semibold text-[#e6edf3] group-hover:text-[#007acc] transition-colors">
                        Advanced Configuration
                    </p>
                    <p className="text-xs text-[#8b949e] mt-0.5">
                        Full code editor — browse source, preview images, search &amp; replace
                        {overrides.length > 0 && (
                            <span className="ml-2 text-[#4ec9b0] font-medium">({overrides.length} override{overrides.length > 1 ? "s" : ""} active)</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-[#8b949e] bg-[#21262d] px-2 py-1 rounded font-mono">Opens in new tab ↗</span>
                </div>
            </button>

            {/* Show active overrides summary */}
            {overrides.length > 0 && (
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] text-[#8b949e] uppercase tracking-wider font-semibold">
                            Active Overrides ({overrides.length})
                        </span>
                        <button onClick={() => setOverrides([])}
                            className="text-[10px] text-[#f85149] hover:text-[#ff7b72] transition-colors">
                            Clear all
                        </button>
                    </div>
                    <div className="space-y-1">
                        {overrides.map((o, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] px-2 py-1 rounded bg-[#0d1117] group">
                                {o.type === "file" ? (
                                    <>
                                        <span className="text-[#569cd6] font-mono truncate max-w-[120px]">{o.path?.split("/").pop()}</span>
                                        <span className="text-[#484f58]">→</span>
                                        <span className="text-[#4ec9b0] font-mono truncate max-w-[120px]">{o.fileName}</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-[#f85149] font-mono line-through opacity-70 truncate max-w-[120px]">{o.search}</span>
                                        <span className="text-[#484f58]">→</span>
                                        <span className="text-[#4ec9b0] font-mono truncate max-w-[120px]">{o.replace}</span>
                                    </>
                                )}
                                <span className="text-[8px] text-[#484f58] bg-[#161b22] px-1.5 py-0.5 rounded border border-[#30363d] ml-auto">{o.type}</span>
                                <button onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}
                                    className="text-[#484f58] hover:text-[#f85149] opacity-0 group-hover:opacity-100 transition-all">✕</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
