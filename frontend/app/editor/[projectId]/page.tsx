"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

// ── Dynamic import of Monaco (no SSR) ──
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ── Constants ──
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
function isImageFile(path: string) {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    return IMAGE_EXTENSIONS.has(ext);
}

function getLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() || "";
    const map: Record<string, string> = {
        xml: "xml", json: "json", java: "java", kt: "kotlin",
        gradle: "groovy", properties: "ini", yml: "yaml", yaml: "yaml",
        md: "markdown", html: "html", css: "css", js: "javascript",
        ts: "typescript", txt: "plaintext", smali: "plaintext",
        pro: "plaintext", cfg: "ini", sh: "shell",
    };
    return map[ext] || "plaintext";
}

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
}

interface Override {
    type: "string" | "resource" | "file";
    search?: string;
    replace?: string;
    path?: string;
    replaceUrl?: string;
    fileName?: string;
}

// ── File Icons ──
function getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const icons: Record<string, string> = {
        xml: "📄", smali: "⚙️", txt: "📝", json: "📋", yml: "📋",
        yaml: "📋", properties: "🔧", png: "🖼️", jpg: "🖼️", jpeg: "🖼️",
        gif: "🖼️", webp: "🖼️", svg: "🖼️", java: "☕", kt: "💜",
        pro: "🔧", gradle: "🐘", md: "📑", html: "🌐", css: "🎨",
        js: "💛", ts: "💙",
    };
    return icons[ext] || "📄";
}

// ── Tree Component ──
function TreeItem({ node, depth, selectedPath, expandedDirs, onFileClick, onToggleDir }: {
    node: TreeNode; depth: number; selectedPath: string | null;
    expandedDirs: Set<string>; onFileClick: (p: string) => void; onToggleDir: (p: string) => void;
}) {
    const isDir = node.type === "directory";
    const isExpanded = expandedDirs.has(node.path);
    const isSelected = selectedPath === node.path;
    return (
        <div>
            <button type="button"
                onClick={() => isDir ? onToggleDir(node.path) : onFileClick(node.path)}
                className={`w-full text-left flex items-center gap-1.5 py-[3px] px-2 text-[11px] font-mono transition-all
                    ${isSelected ? "bg-[#37373d] text-white" : "text-[#cccccc] hover:bg-[#2a2d2e]"}`}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}>
                {isDir ? <span className={`text-[9px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span> : <span className="w-[9px]" />}
                <span className="text-xs">{isDir ? (isExpanded ? "📂" : "📁") : getFileIcon(node.name)}</span>
                <span className="truncate">{node.name}</span>
            </button>
            {isDir && isExpanded && node.children?.map(c => (
                <TreeItem key={c.path} node={c} depth={depth + 1} selectedPath={selectedPath}
                    expandedDirs={expandedDirs} onFileClick={onFileClick} onToggleDir={onToggleDir} />
            ))}
        </div>
    );
}

// ── Page ──
export default function EditorPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const projectId = params.projectId as string;
    const flavorId = searchParams.get("flavorId");

    // Source data
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [fileCache, setFileCache] = useState<Record<string, string | null>>({});
    const [totalFiles, setTotalFiles] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Editor state
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
    const [openTabs, setOpenTabs] = useState<string[]>([]);

    // Overrides
    const [overrides, setOverrides] = useState<Override[]>([]);
    const [originalOverrides, setOriginalOverrides] = useState<Override[]>([]);

    // Search
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [showReplace, setShowReplace] = useState(false);
    const [replaceValue, setReplaceValue] = useState("");

    // Image preview
    const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

    // File replacement
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    // ── Load source ──
    useEffect(() => {
        api.get(`/source/${projectId}/load`)
            .then((res: any) => {
                setTree(res.data.tree || []);
                setTotalFiles(res.data.totalFiles || 0);
                setFileCache(res.data.files || {});
            })
            .catch((err: any) => setLoadError(err?.response?.data?.error || "Failed to load source"))
            .finally(() => setLoading(false));
    }, [projectId]);

    // ── Load flavor overrides ──
    useEffect(() => {
        if (!flavorId) return;
        api.get(`/projects/flavors/${flavorId}`)
            .then((res: any) => {
                const cfg = res.data.configJson || {};
                const ov = cfg.overrides || [];
                setOverrides(ov);
                setOriginalOverrides(ov);
            })
            .catch(() => { });
    }, [flavorId]);

    // ── Image preview ──
    useEffect(() => {
        if (!selectedFile || !isImageFile(selectedFile)) { setImagePreviewUrl(null); return; }
        let revoked = false;
        api.get(`/source/${projectId}/file/raw`, { params: { path: selectedFile }, responseType: "blob" })
            .then((res: any) => { if (!revoked) setImagePreviewUrl(URL.createObjectURL(res.data)); })
            .catch(() => setImagePreviewUrl(null));
        return () => { revoked = true; };
    }, [selectedFile, projectId]);

    // ── Derived ──
    const fileContent = selectedFile ? fileCache[selectedFile] : null;
    const fileBinary = selectedFile ? (selectedFile in fileCache && fileCache[selectedFile] === null) : false;
    const hasChanges = JSON.stringify(overrides) !== JSON.stringify(originalOverrides);

    // ── Cross-file search ──
    useEffect(() => {
        if (!searchQuery.trim() || searchQuery.length < 2) { setSearchResults([]); return; }
        const MAX = 200;
        const results: SearchResult[] = [];
        let pattern: RegExp;
        try { pattern = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"); }
        catch { setSearchResults([]); return; }
        for (const [filePath, content] of Object.entries(fileCache)) {
            if (results.length >= MAX || !content) continue;
            const lines = content.split("\n");
            for (let i = 0; i < lines.length && results.length < MAX; i++) {
                pattern.lastIndex = 0;
                if (pattern.test(lines[i])) {
                    results.push({ file: filePath, lineNumber: i + 1, content: lines[i].substring(0, 200) });
                }
            }
        }
        setSearchResults(results);
    }, [searchQuery, fileCache]);

    // ── Handlers ──
    const handleFileClick = useCallback((path: string) => {
        setSelectedFile(path);
        setOpenTabs((prev: string[]) => prev.includes(path) ? prev : [...prev, path]);
    }, []);

    const handleCloseTab = useCallback((path: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setOpenTabs((prev: string[]) => prev.filter(p => p !== path));
        if (selectedFile === path) {
            setSelectedFile(null);
        }
    }, [selectedFile]);

    const handleToggleDir = useCallback((path: string) => {
        setExpandedDirs((prev: Set<string>) => {
            const next = new Set<string>(prev);
            next.has(path) ? next.delete(path) : next.add(path);
            return next;
        });
    }, []);

    const handleAddOverride = useCallback(() => {
        if (!searchQuery.trim() || !replaceValue) return;
        const exists = overrides.some(o => o.type === "string" && o.search === searchQuery && o.replace === replaceValue);
        if (!exists) setOverrides([...overrides, { type: "string", search: searchQuery, replace: replaceValue }]);
    }, [searchQuery, replaceValue, overrides]);

    const handleFileReplace = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedFile) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await api.post("/uploads/upload-logo", formData, { headers: { "Content-Type": "multipart/form-data" } });
            const url = res.data.displayUrl || res.data.url || res.data.storageKey;
            const exists = overrides.some(o => o.type === "file" && o.path === selectedFile);
            setOverrides(exists
                ? overrides.map(o => o.type === "file" && o.path === selectedFile ? { ...o, replaceUrl: url, fileName: file.name } : o)
                : [...overrides, { type: "file" as const, path: selectedFile, replaceUrl: url, fileName: file.name }]);
        } catch (err) { console.error("Upload failed:", err); }
        finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
    }, [selectedFile, overrides]);

    const handleSearchResultClick = useCallback((r: SearchResult) => {
        handleFileClick(r.file);
        // Expand parent dirs
        const parts = r.file.split("/");
        const newExpanded = new Set<string>(expandedDirs);
        let p = "";
        for (let i = 0; i < parts.length - 1; i++) { p = p ? `${p}/${parts[i]}` : parts[i]; newExpanded.add(p); }
        setExpandedDirs(newExpanded);
    }, [expandedDirs, handleFileClick]);

    // ── Save ──
    const handleSave = useCallback(async () => {
        if (!flavorId) return;
        try {
            // Get current config
            const flavorRes = await api.get(`/projects/flavors/${flavorId}`);
            const currentConfig = flavorRes.data.configJson || {};
            const config = { ...currentConfig, overrides: overrides.length > 0 ? overrides : undefined };
            await api.patch(`/projects/flavors/${flavorId}`, { config });
            // Sync to parent tab via localStorage
            localStorage.setItem(`editor-overrides-${flavorId}`, JSON.stringify(overrides));
            localStorage.setItem(`editor-overrides-${flavorId}-ts`, Date.now().toString());
            setOriginalOverrides(overrides);
            window.close();
        } catch (err) { console.error("Save failed:", err); }
    }, [flavorId, overrides]);

    const handleCancel = useCallback(() => { window.close(); }, []);

    // ── Render ──
    return (
        <div className="h-screen w-screen flex flex-col bg-[#1e1e1e] overflow-hidden"
            style={{ fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace" }}>

            {/* ── Title Bar ── */}
            <div className="h-[38px] bg-[#323233] flex items-center justify-between px-4 shrink-0 border-b border-[#252526]">
                <div className="flex items-center gap-3">
                    <span className="text-[12px] text-[#cccccc] font-medium">⚙️ Advanced Config Editor</span>
                    <span className="text-[10px] text-[#858585]">— {totalFiles} files</span>
                    {hasChanges && <span className="text-[10px] text-[#dcdcaa] bg-[#dcdcaa]/10 px-2 py-0.5 rounded font-medium">● Unsaved</span>}
                </div>
                <div className="flex items-center gap-2">
                    {overrides.length > 0 && (
                        <span className="text-[10px] text-[#4ec9b0] bg-[#4ec9b0]/10 px-2.5 py-0.5 rounded-full font-semibold">
                            {overrides.length} override{overrides.length > 1 ? "s" : ""}
                        </span>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={handleCancel}
                        className="h-7 px-3 text-[11px] text-[#cccccc] hover:text-white hover:bg-[#3c3c3c] border border-[#4c4c4c]">
                        Cancel
                    </Button>
                    <Button type="button" size="sm" onClick={handleSave} disabled={!hasChanges}
                        className={`h-7 px-4 text-[11px] font-semibold rounded ${hasChanges ? "bg-[#007acc] text-white hover:bg-[#006bb3]" : "bg-[#3c3c3c] text-[#858585] cursor-not-allowed"}`}>
                        💾 Save & Close
                    </Button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex min-h-0">

                {/* ── Sidebar ── */}
                <div className="w-[260px] bg-[#252526] border-r border-[#3c3c3c] flex flex-col shrink-0">
                    {/* Search */}
                    <div className="p-2 border-b border-[#3c3c3c]">
                        <input type="text" value={searchQuery} onChange={(e: any) => setSearchQuery(e.target.value)}
                            placeholder="🔍 Search across files..."
                            className="w-full bg-[#3c3c3c] text-[#cccccc] text-[11px] px-2.5 py-1.5 rounded border border-[#4c4c4c] focus:border-[#007acc] focus:outline-none placeholder:text-[#858585]" />
                        <div className="flex items-center gap-1 mt-1.5">
                            <button onClick={() => setShowReplace(!showReplace)}
                                className={`text-[9px] px-1.5 py-0.5 rounded ${showReplace ? "bg-[#007acc] text-white" : "text-[#858585] hover:text-[#cccccc]"}`}>
                                Replace
                            </button>
                            {searchResults.length > 0 && <span className="ml-auto text-[9px] text-[#858585]">{searchResults.length} results</span>}
                        </div>
                        {showReplace && (
                            <div className="flex gap-1 mt-1.5">
                                <input type="text" value={replaceValue} onChange={(e: any) => setReplaceValue(e.target.value)}
                                    placeholder="Replace with..."
                                    className="flex-1 bg-[#3c3c3c] text-[#cccccc] text-[11px] px-2 py-1 rounded border border-[#4c4c4c] focus:border-[#007acc] focus:outline-none placeholder:text-[#858585]" />
                                <button onClick={handleAddOverride}
                                    className="text-[10px] px-2 py-1 bg-[#007acc] text-white rounded hover:bg-[#006bb3] transition-colors">
                                    + Add
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Tree / Search Results */}
                    <div className="flex-1 overflow-auto py-1">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 text-[#858585]">
                                <div className="w-5 h-5 border-2 border-[#858585] border-t-transparent rounded-full animate-spin" />
                                <p className="text-[11px]">Loading source...</p>
                            </div>
                        ) : loadError ? (
                            <div className="p-4 text-center"><p className="text-[11px] text-[#f85149]">{loadError}</p></div>
                        ) : searchQuery.trim().length >= 2 && searchResults.length > 0 ? (
                            <div className="text-[11px]">
                                <div className="px-2 py-1 text-[10px] text-[#858585] uppercase tracking-wider">Search Results</div>
                                {searchResults.slice(0, 50).map((r: SearchResult, i: number) => (
                                    <button key={i} type="button" onClick={() => handleSearchResultClick(r)}
                                        className="w-full text-left px-2 py-1 hover:bg-[#2a2d2e] transition-colors block">
                                        <div className="text-[#007acc] truncate text-[10px]">
                                            {r.file.split("/").pop()}<span className="text-[#858585]">:{r.lineNumber}</span>
                                        </div>
                                        <div className="text-[#cccccc] truncate text-[10px]">{r.content}</div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            tree.map(node => (
                                <TreeItem key={node.path} node={node} depth={0} selectedPath={selectedFile}
                                    expandedDirs={expandedDirs} onFileClick={handleFileClick} onToggleDir={handleToggleDir} />
                            ))
                        )}
                    </div>

                    {/* ── Overrides ── */}
                    {overrides.length > 0 && (
                        <div className="border-t border-[#3c3c3c] max-h-[200px] overflow-auto">
                            <div className="px-2 py-1.5 text-[10px] text-[#858585] uppercase tracking-wider">
                                Overrides ({overrides.length})
                            </div>
                            <div className="px-1 pb-2 space-y-0.5">
                                {overrides.map((o, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[10px] px-1.5 py-1 rounded bg-[#2a2d2e] group">
                                        {o.type === "file" ? (
                                            <>
                                                <span className="text-[#569cd6] truncate max-w-[80px]">{o.path?.split("/").pop()}</span>
                                                <span className="text-[#858585]">→</span>
                                                <span className="text-[#4ec9b0] truncate max-w-[70px]">{o.fileName}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="text-[#f85149] line-through opacity-70 truncate max-w-[70px]">{o.search}</span>
                                                <span className="text-[#858585]">→</span>
                                                <span className="text-[#4ec9b0] truncate max-w-[70px]">{o.replace}</span>
                                            </>
                                        )}
                                        <span className="text-[8px] text-[#858585] bg-[#1e1e1e] px-1 rounded ml-auto">{o.type}</span>
                                        <button onClick={() => setOverrides(overrides.filter((_, j) => j !== i))}
                                            className="text-[#858585] hover:text-[#f85149] opacity-0 group-hover:opacity-100 transition-all text-[10px]">✕</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Editor Pane ── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Tab bar */}
                    {openTabs.length > 0 && (
                        <div className="h-[35px] bg-[#252526] border-b border-[#3c3c3c] flex items-center overflow-x-auto shrink-0">
                            {openTabs.map(tab => (
                                <button key={tab} type="button" onClick={() => setSelectedFile(tab)}
                                    className={`h-full flex items-center gap-1.5 px-3 text-[11px] border-r border-[#3c3c3c] shrink-0 transition-all
                                        ${selectedFile === tab ? "bg-[#1e1e1e] text-[#cccccc] border-b-2 border-b-[#007acc]" : "bg-[#2d2d2d] text-[#858585] hover:text-[#cccccc]"}`}>
                                    <span className="text-xs">{getFileIcon(tab.split("/").pop() || "")}</span>
                                    <span>{tab.split("/").pop()}</span>
                                    {overrides.some(o => o.type === "file" && o.path === tab) && <span className="text-[8px] text-[#4ec9b0]">●</span>}
                                    <button onClick={(e) => handleCloseTab(tab, e)}
                                        className="ml-1 text-[#858585] hover:text-white text-[10px] rounded hover:bg-[#3c3c3c] w-4 h-4 flex items-center justify-center">✕</button>
                                </button>
                            ))}
                            {/* Replace File button at end of tabs */}
                            {selectedFile && (
                                <div className="ml-auto flex items-center gap-1.5 px-2 shrink-0">
                                    <input ref={fileInputRef} type="file" className="hidden"
                                        accept={selectedFile && isImageFile(selectedFile) ? "image/*" : "*/*"}
                                        onChange={handleFileReplace} />
                                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                                        className="text-[10px] px-2 py-1 text-[#cccccc] hover:text-white hover:bg-[#3c3c3c] border border-[#4c4c4c] rounded transition-colors">
                                        {uploading ? "Uploading…" : "↑ Replace File"}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Editor content */}
                    <div className="flex-1 min-h-0">
                        {selectedFile ? (
                            fileBinary ? (
                                isImageFile(selectedFile) ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-5 p-8 bg-[#1e1e1e]">
                                        {overrides.some(o => o.type === "file" && o.path === selectedFile) && (
                                            <div className="text-center">
                                                <span className="text-[10px] text-[#4ec9b0] bg-[#4ec9b0]/10 px-3 py-1 rounded-full font-semibold">
                                                    ⟳ Replacement queued: {overrides.find(o => o.type === "file" && o.path === selectedFile)?.fileName}
                                                </span>
                                            </div>
                                        )}
                                        <div className="rounded-lg border border-[#3c3c3c] bg-[#252526] p-6 shadow-2xl">
                                            {imagePreviewUrl ? (
                                                <img src={imagePreviewUrl} alt={selectedFile.split("/").pop() || ""}
                                                    className="max-w-[400px] max-h-[400px] object-contain"
                                                    style={{ imageRendering: selectedFile.includes("mipmap") || selectedFile.includes("drawable") ? "pixelated" : "auto" }} />
                                            ) : (
                                                <div className="w-[120px] h-[120px] flex items-center justify-center text-[#858585] animate-pulse text-sm">Loading…</div>
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[11px] text-[#cccccc] font-medium">{selectedFile.split("/").pop()}</p>
                                            <p className="text-[10px] text-[#858585] mt-0.5">{selectedFile.split(".").pop()?.toUpperCase()} image</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full gap-3 text-[#858585] bg-[#1e1e1e]">
                                        <span className="text-4xl">📦</span>
                                        <p className="text-sm">Binary file</p>
                                        <p className="text-[11px]">Use "Replace File" to swap this file</p>
                                    </div>
                                )
                            ) : fileContent !== null && fileContent !== undefined ? (
                                <MonacoEditor
                                    height="100%"
                                    language={getLanguage(selectedFile)}
                                    value={fileContent}
                                    theme="vs-dark"
                                    options={{
                                        readOnly: true,
                                        minimap: { enabled: true },
                                        fontSize: 13,
                                        lineNumbers: "on",
                                        scrollBeyondLastLine: false,
                                        wordWrap: "off",
                                        renderWhitespace: "selection",
                                        smoothScrolling: true,
                                        cursorBlinking: "smooth",
                                        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Menlo, monospace",
                                        fontLigatures: true,
                                        bracketPairColorization: { enabled: true },
                                        guides: { bracketPairs: true, indentation: true },
                                        padding: { top: 10 },
                                    }}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-[#858585] bg-[#1e1e1e]">
                                    <span className="text-4xl">📄</span>
                                    <p className="text-sm">Could not load file</p>
                                </div>
                            )
                        ) : (
                            /* Welcome screen */
                            <div className="flex flex-col items-center justify-center h-full gap-6 text-[#858585] bg-[#1e1e1e]">
                                <div className="w-24 h-24 rounded-2xl bg-[#252526] border border-[#3c3c3c] flex items-center justify-center text-5xl">⚙️</div>
                                <div className="text-center max-w-md">
                                    <h2 className="text-lg font-semibold text-[#cccccc] mb-2">Advanced Config Editor</h2>
                                    <p className="text-[12px] text-[#858585] leading-relaxed">
                                        Browse the decompiled APK source, preview images, and configure file overrides.
                                        Select a file from the tree to begin.
                                    </p>
                                </div>
                                <div className="flex gap-6 mt-2 text-[10px]">
                                    <div className="flex items-center gap-1.5">
                                        <kbd className="px-1.5 py-0.5 bg-[#3c3c3c] rounded text-[#cccccc]">Ctrl+F</kbd> Find in file
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <kbd className="px-1.5 py-0.5 bg-[#3c3c3c] rounded text-[#cccccc]">Sidebar</kbd> Cross-file search
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status bar */}
                    <div className="h-[22px] bg-[#007acc] flex items-center px-3 text-[10px] text-white shrink-0 justify-between">
                        <div className="flex items-center gap-4">
                            {selectedFile && <span>{getLanguage(selectedFile).toUpperCase()}</span>}
                            {selectedFile && fileContent && <span>Lines: {fileContent.split("\n").length}</span>}
                            {overrides.length > 0 && <span>{overrides.length} overrides</span>}
                        </div>
                        <div className="flex items-center gap-4">
                            <span>UTF-8</span>
                            {hasChanges && <span className="text-[#dcdcaa]">● Modified</span>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
