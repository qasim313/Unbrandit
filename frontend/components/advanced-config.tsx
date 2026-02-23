"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ── Types ──

interface TreeNode {
    name: string;
    path: string;
    type: "file" | "directory";
    children?: TreeNode[];
    size?: number;
}

interface SearchResult {
    file: string;
    lineNumber: number;
    content: string;
    matchStart: number;
    matchEnd: number;
}

interface Override {
    type: "string" | "resource";
    search: string;
    replace: string;
}

interface Props {
    projectId: string;
    overrides: Override[];
    setOverrides: (overrides: Override[]) => void;
}

// ── File Icons ──

function getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const icons: Record<string, string> = {
        xml: "📄", smali: "⚙️", txt: "📝", json: "📋", yml: "📋",
        yaml: "📋", properties: "🔧", png: "🖼️", jpg: "🖼️", jpeg: "🖼️",
        gif: "🖼️", webp: "🖼️", svg: "🖼️", apk: "📦", zip: "📦",
        dex: "📦", so: "🔗", jar: "📦", kt: "💜", java: "☕",
        pro: "🔧", gradle: "🐘", md: "📑", html: "🌐", css: "🎨",
        js: "💛", ts: "💙"
    };
    return icons[ext] || "📄";
}

// ── Tree Node Component ──

function TreeItem({
    node,
    depth,
    selectedPath,
    expandedDirs,
    onFileClick,
    onToggleDir,
}: {
    node: TreeNode;
    depth: number;
    selectedPath: string | null;
    expandedDirs: Set<string>;
    onFileClick: (path: string) => void;
    onToggleDir: (path: string) => void;
}) {
    const isDir = node.type === "directory";
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedPath === node.path;

    return (
        <div>
            <button
                type="button"
                onClick={() => (isDir ? onToggleDir(node.path) : onFileClick(node.path))}
                className={`w-full text-left flex items-center gap-1.5 py-1 px-2 text-xs font-mono rounded-md transition-all
          ${isSelected ? "bg-android/15 text-android" : "text-gh-subtle hover:bg-gh-surface hover:text-gh-default"}
        `}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
            >
                {isDir ? (
                    <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                ) : (
                    <span className="w-[10px]" />
                )}
                <span className="text-sm">{isDir ? (isExpanded ? "📂" : "📁") : getFileIcon(node.name)}</span>
                <span className="truncate">{node.name}</span>
                {!isDir && node.size !== undefined && (
                    <span className="ml-auto text-[9px] text-gh-faint opacity-60 shrink-0">
                        {node.size < 1024 ? `${node.size}B` : node.size < 1024 * 1024 ? `${(node.size / 1024).toFixed(0)}K` : `${(node.size / (1024 * 1024)).toFixed(1)}M`}
                    </span>
                )}
            </button>
            {isDir && isExpanded && node.children && (
                <div>
                    {node.children.map((child) => (
                        <TreeItem
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selectedPath={selectedPath}
                            expandedDirs={expandedDirs}
                            onFileClick={onFileClick}
                            onToggleDir={onToggleDir}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main Component ──

export function AdvancedConfig({ projectId, overrides, setOverrides }: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [totalFiles, setTotalFiles] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // All file contents cached in memory (path → content, null = binary)
    const [fileCache, setFileCache] = useState<Record<string, string | null>>({});

    // File viewer
    const [selectedFile, setSelectedFile] = useState<string | null>(null);

    // Tree navigation
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

    // Search (done client-side from cache)
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [showSearch, setShowSearch] = useState(false);

    // Replace
    const [replaceValue, setReplaceValue] = useState("");
    const [showReplace, setShowReplace] = useState(false);

    // Highlighted line
    const [highlightLine, setHighlightLine] = useState<number | null>(null);

    // ── Bulk load when opened ──
    useEffect(() => {
        if (!isOpen || tree.length > 0) return;
        setLoading(true);
        setLoadError(null);
        api
            .get(`/source/${projectId}/load`)
            .then((res) => {
                setTree(res.data.tree);
                setTotalFiles(res.data.totalFiles);
                setFileCache(res.data.files);
            })
            .catch((err) => {
                setLoadError(err?.response?.data?.error || "Failed to load source");
            })
            .finally(() => setLoading(false));
    }, [isOpen, projectId, tree.length]);

    // ── File click — instant from cache ──
    const openFile = useCallback((path: string) => {
        setSelectedFile(path);
        setHighlightLine(null);
    }, []);

    const fileContent = selectedFile ? fileCache[selectedFile] : null;
    const fileBinary = selectedFile ? fileCache[selectedFile] === null : false;

    // ── Toggle directory ──
    const toggleDir = useCallback((path: string) => {
        setExpandedDirs((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    }, []);

    // ── Search — all local! ──
    const runSearch = useCallback(() => {
        if (!searchQuery.trim()) return;
        const MAX_RESULTS = 200;
        const results: SearchResult[] = [];

        let searchPattern: RegExp;
        if (useRegex) {
            try {
                searchPattern = new RegExp(searchQuery, caseSensitive ? "g" : "gi");
            } catch {
                return; // invalid regex
            }
        } else {
            const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            searchPattern = new RegExp(escaped, caseSensitive ? "g" : "gi");
        }

        for (const [filePath, content] of Object.entries(fileCache)) {
            if (results.length >= MAX_RESULTS) break;
            if (content === null) continue; // skip binary

            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (results.length >= MAX_RESULTS) break;
                const line = lines[i];
                searchPattern.lastIndex = 0;
                const match = searchPattern.exec(line);
                if (match) {
                    results.push({
                        file: filePath,
                        lineNumber: i + 1,
                        content: line.substring(0, 300),
                        matchStart: match.index,
                        matchEnd: match.index + match[0].length,
                    });
                }
            }
        }
        setSearchResults(results);
    }, [searchQuery, fileCache, caseSensitive, useRegex]);

    // ── Navigate to search result ──
    const navigateToResult = useCallback(
        (result: SearchResult) => {
            // Expand parent directories
            const parts = result.file.split("/");
            const newExpanded = new Set(expandedDirs);
            let current = "";
            for (let i = 0; i < parts.length - 1; i++) {
                current = current ? `${current}/${parts[i]}` : parts[i];
                newExpanded.add(current);
            }
            setExpandedDirs(newExpanded);
            setSelectedFile(result.file);
            setHighlightLine(result.lineNumber);

            // Scroll to line
            setTimeout(() => {
                const lineEl = document.getElementById(`source-line-${result.lineNumber}`);
                if (lineEl) {
                    lineEl.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 50);
        },
        [expandedDirs]
    );

    // ── Replace (adds to overrides) ──
    const addOverride = useCallback(
        (search: string, replace: string) => {
            const exists = overrides.some(
                (o) => o.type === "string" && o.search === search && o.replace === replace
            );
            if (!exists) {
                setOverrides([...overrides, { type: "string", search, replace }]);
            }
        },
        [overrides, setOverrides]
    );

    const handleReplace = useCallback(() => {
        if (!searchQuery.trim() || !replaceValue) return;
        addOverride(searchQuery, replaceValue);
    }, [searchQuery, replaceValue, addOverride]);

    if (!isOpen) {
        return (
            <Card className="border-dashed border-gh-border/60 hover:border-android/30 transition-colors cursor-pointer group">
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="w-full p-6 flex items-center gap-4"
                >
                    <div className="w-12 h-12 rounded-2xl bg-gh-bg border border-gh-border flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                        ⚡
                    </div>
                    <div className="text-left flex-1">
                        <h3 className="font-display font-bold text-gh-default group-hover:text-android transition-colors">
                            Advanced Configuration
                        </h3>
                        <p className="text-sm text-gh-muted mt-0.5">
                            Browse, search, and modify decompiled source files, string resources, and more.
                        </p>
                    </div>
                    <svg
                        width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="text-gh-faint group-hover:text-android group-hover:translate-x-1 transition-all"
                    >
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gh-bg border border-gh-border flex items-center justify-center text-xl">⚡</div>
                        <div>
                            <h3 className="font-display font-semibold text-gh-default">Advanced Configuration</h3>
                            <p className="text-xs text-gh-muted mt-0.5">
                                {totalFiles > 0 ? `${totalFiles} files loaded • Search and browse instantly` : "Browse and search source files"}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setShowSearch(!showSearch)}
                            className={`h-8 px-3 text-xs ${showSearch ? "text-android bg-android/10" : ""}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
                                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                            </svg>
                            Search
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)}
                            className="h-8 px-3 text-xs text-gh-muted hover:text-gh-default">
                            Collapse
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-0 border-t border-gh-border">
                {/* ── Search Bar ── */}
                {showSearch && (
                    <div className="px-4 py-3 bg-gh-bg/80 border-b border-gh-border space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gh-faint">
                                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                                </svg>
                                <input type="text" value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && runSearch()}
                                    placeholder="Search in source files... (instant, all local)"
                                    className="w-full h-9 pl-9 pr-3 rounded-lg bg-gh-surface border border-gh-border text-sm text-gh-default placeholder-gh-faint focus:outline-none focus:ring-2 focus:ring-android/30 focus:border-android/40 font-mono"
                                />
                            </div>
                            <button type="button" onClick={() => setCaseSensitive(!caseSensitive)} title="Case Sensitive"
                                className={`h-9 w-9 flex items-center justify-center rounded-lg border text-xs font-bold transition-all
                  ${caseSensitive ? "bg-android/15 border-android/30 text-android" : "bg-gh-surface border-gh-border text-gh-faint hover:text-gh-subtle"}`}>
                                Aa
                            </button>
                            <button type="button" onClick={() => setUseRegex(!useRegex)} title="Use Regular Expression"
                                className={`h-9 w-9 flex items-center justify-center rounded-lg border text-xs font-bold transition-all font-mono
                  ${useRegex ? "bg-android/15 border-android/30 text-android" : "bg-gh-surface border-gh-border text-gh-faint hover:text-gh-subtle"}`}>
                                .*
                            </button>
                            <Button type="button" size="sm" onClick={runSearch} disabled={!searchQuery.trim()}
                                className="h-9 px-4 bg-android text-[#0d1117] font-bold text-xs">
                                Search
                            </Button>
                        </div>

                        {/* Replace row */}
                        <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setShowReplace(!showReplace)}
                                className="h-6 w-6 flex items-center justify-center text-gh-faint hover:text-gh-subtle transition-colors">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                    className={`transition-transform ${showReplace ? "rotate-90" : ""}`}>
                                    <path d="M9 18l6-6-6-6" />
                                </svg>
                            </button>
                            {showReplace && (
                                <>
                                    <input type="text" value={replaceValue}
                                        onChange={(e) => setReplaceValue(e.target.value)}
                                        placeholder="Replace with..."
                                        className="flex-1 h-9 px-3 rounded-lg bg-gh-surface border border-gh-border text-sm text-gh-default placeholder-gh-faint focus:outline-none focus:ring-2 focus:ring-android/30 focus:border-android/40 font-mono"
                                    />
                                    <Button type="button" size="sm" onClick={handleReplace}
                                        disabled={!searchQuery.trim() || !replaceValue}
                                        className="h-9 px-3 text-xs" variant="default"
                                        title="Add Replace All Override — applies during build">
                                        Replace All
                                    </Button>
                                </>
                            )}
                        </div>

                        {/* Results */}
                        {searchResults.length > 0 && (
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-gh-border bg-gh-surface divide-y divide-gh-border/40">
                                {searchResults.length >= 200 && (
                                    <div className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/10 font-bold uppercase tracking-wider">
                                        Results capped at 200 — refine your search
                                    </div>
                                )}
                                {searchResults.map((r, i) => (
                                    <button key={`${r.file}-${r.lineNumber}-${i}`} type="button"
                                        onClick={() => navigateToResult(r)}
                                        className="w-full text-left px-3 py-2 hover:bg-gh-bg transition-colors">
                                        <div className="flex items-center gap-2 text-[11px] font-mono">
                                            <span className="text-android/70 truncate max-w-[200px]">{r.file}</span>
                                            <span className="text-gh-faint">:{r.lineNumber}</span>
                                        </div>
                                        <div className="text-xs text-gh-subtle font-mono truncate mt-0.5">
                                            {r.content.substring(0, r.matchStart)}
                                            <span className="bg-android/25 text-android font-bold rounded-sm px-0.5">
                                                {r.content.substring(r.matchStart, r.matchEnd)}
                                            </span>
                                            {r.content.substring(r.matchEnd)}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Active Overrides ── */}
                {overrides.length > 0 && (
                    <div className="px-4 py-2 bg-android/5 border-b border-android/20">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-black text-android uppercase tracking-widest">Active Overrides ({overrides.length})</span>
                        </div>
                        <div className="space-y-1">
                            {overrides.map((o, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs font-mono">
                                    <span className="text-red-400 line-through opacity-60">{o.search}</span>
                                    <span className="text-gh-faint">→</span>
                                    <span className="text-emerald-400">{o.replace}</span>
                                    <span className="text-[9px] text-gh-faint px-1.5 py-0.5 bg-gh-bg rounded border border-gh-border">{o.type}</span>
                                    <button type="button" onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}
                                        className="ml-auto text-gh-faint hover:text-red-400 transition-colors" title="Remove override">
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Main split layout ── */}
                <div className="flex" style={{ height: "520px" }}>
                    {/* ── File Tree Sidebar ── */}
                    <div className="w-64 border-r border-gh-border bg-gh-bg/50 overflow-y-auto shrink-0">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gh-muted">
                                <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                <span className="text-xs">Loading all source files...</span>
                                <span className="text-[10px] text-gh-faint">This may take a moment for large APKs</span>
                            </div>
                        ) : loadError ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                                <span className="text-3xl">⚠️</span>
                                <p className="text-sm text-red-400 font-medium">{loadError}</p>
                                <p className="text-xs text-gh-faint">Make sure the project has been decompiled first.</p>
                            </div>
                        ) : (
                            <div className="py-1">
                                <div className="px-3 py-2 text-[9px] font-black text-gh-faint uppercase tracking-widest">
                                    Source Files
                                </div>
                                {tree.map((node) => (
                                    <TreeItem key={node.path} node={node} depth={0} selectedPath={selectedFile}
                                        expandedDirs={expandedDirs} onFileClick={openFile} onToggleDir={toggleDir} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── File Viewer ── */}
                    <div className="flex-1 flex flex-col min-w-0">
                        {selectedFile ? (
                            <>
                                {/* File header / breadcrumb */}
                                <div className="px-4 py-2 bg-gh-bg/80 border-b border-gh-border flex items-center gap-2 shrink-0">
                                    <span className="text-sm">{getFileIcon(selectedFile.split("/").pop() || "")}</span>
                                    <span className="text-xs font-mono text-gh-muted truncate">{selectedFile}</span>
                                </div>

                                {/* Code area */}
                                <div className="flex-1 overflow-auto bg-[#0d1117]">
                                    {fileBinary ? (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 text-gh-muted">
                                            <span className="text-4xl">🖼️</span>
                                            <p className="text-sm font-medium">Binary file — preview not available</p>
                                            <p className="text-xs text-gh-faint">{selectedFile.split(".").pop()?.toUpperCase()} file</p>
                                        </div>
                                    ) : fileContent !== null && fileContent !== undefined ? (
                                        <pre className="text-xs leading-5 font-mono p-0 m-0 overflow-x-auto">
                                            <div className="min-w-fit">
                                                {fileContent.split("\n").map((line, i) => {
                                                    const lineNum = i + 1;
                                                    const isHighlighted = lineNum === highlightLine;
                                                    return (
                                                        <div key={lineNum} id={`source-line-${lineNum}`}
                                                            className={`flex ${isHighlighted ? "bg-android/15" : "hover:bg-white/[0.03]"}`}>
                                                            <span className={`inline-block w-12 text-right pr-3 py-px select-none shrink-0 ${isHighlighted ? "text-android" : "text-gh-faint/40"}`}>
                                                                {lineNum}
                                                            </span>
                                                            <span className="text-[#c9d1d9] py-px pr-4 whitespace-pre">
                                                                {line}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </pre>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 text-gh-muted">
                                            <span className="text-4xl">📄</span>
                                            <p className="text-sm font-medium">Could not load file</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            /* Empty state */
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-gh-muted">
                                <div className="w-16 h-16 rounded-2xl bg-gh-surface border border-gh-border flex items-center justify-center text-3xl">📂</div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-gh-subtle">Select a file to view</p>
                                    <p className="text-xs text-gh-faint mt-1">
                                        Browse the file tree or use{" "}
                                        <button type="button" onClick={() => setShowSearch(true)} className="text-android hover:underline">
                                            Search
                                        </button>
                                        {" "}to find content
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
