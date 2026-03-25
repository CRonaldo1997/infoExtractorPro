'use client';

import { Header } from '@/components/header';
import { use, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, File, CheckCircle2, AlertCircle, Clock, ChevronLeft, ChevronRight, ChevronDown, Folder, FolderOpen, PlayCircle, Eye, Settings2, Trash2, Copy, Check, Download, Edit3, BookOpen, Search, X, MapPin, Info, ChevronUp, FileText, XCircle, ZoomOut, ZoomIn } from 'lucide-react';
import { taskService, Task } from '@/lib/services/tasks';
import { fileService, FileRecord } from '@/lib/services/files';
import { promptService, PromptSet } from '@/lib/services/prompts';
import { toast } from 'sonner';

interface TreeNode {
    name: string;
    path: string;
    isFolder: boolean;
    file?: FileRecord;
    children?: TreeNode[];
}

const buildFileTree = (files: FileRecord[]): TreeNode[] => {
    const root: TreeNode = { name: 'root', path: 'root', isFolder: true, children: [] };

    files.forEach(file => {
        // 兼容 Windows 反斜杠并过滤空路径段
        const parts = file.name.split(/[/\\]/).filter(Boolean);
        let current = root;

        parts.forEach((part, index) => {
            if (index === parts.length - 1) {
                // file
                current.children!.push({ name: part, path: file.name, isFolder: false, file });
            } else {
                // folder
                let folder = current.children!.find(c => c.name === part && c.isFolder);
                if (!folder) {
                    const folderPath = parts.slice(0, index + 1).join('/');
                    folder = { name: part, path: folderPath, isFolder: true, children: [] };
                    current.children!.push(folder);
                }
                current = folder;
            }
        });
    });

    return root.children || [];
};

const getAllFileIds = (node: TreeNode): string[] => {
    if (!node.isFolder && node.file) return [node.file.id];
    let ids: string[] = [];
    node.children?.forEach(c => ids.push(...getAllFileIds(c)));
    return ids;
};

// 文件状态指示器组件
const FileStatusDot = ({ status }: { status?: string }) => {
    if (!status || status === 'uploaded') return null;
    const map: Record<string, { cls: string; title: string }> = {
        uploading: { cls: 'bg-blue-400 animate-pulse', title: '上传中' },
        upload_failed: { cls: 'bg-red-400', title: '上传失败' },
        extracting: { cls: 'bg-amber-400 animate-pulse', title: '提取中' },
        extracted: { cls: 'bg-green-400', title: '提取完成' },
        extract_failed: { cls: 'bg-red-400', title: '提取失败' },
    };
    const s = map[status];
    if (!s) return null;
    return <span className={`w-2 h-2 rounded-full shrink-0 ${s.cls}`} title={s.title} />;
};

const FileTreeView = ({ nodes, level = 0, selectedId, onSelect, checkedIds, onCheckChange }: { nodes: TreeNode[], level?: number, selectedId: string | null, onSelect: (id: string) => void, checkedIds: Set<string>, onCheckChange: (fileIds: string[], checked: boolean) => void }) => {
    // 自动展开所有文件夹
    const getAllFolderPaths = useCallback((items: TreeNode[]): string[] => {
        let paths: string[] = [];
        items.forEach(n => {
            if (n.isFolder) {
                paths.push(n.path);
                if (n.children) paths.push(...getAllFolderPaths(n.children));
            }
        });
        return paths;
    }, []);

    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [hasInitialized, setHasInitialized] = useState(false);

    useEffect(() => {
        if (nodes.length > 0 && !hasInitialized) {
            setExpanded(new Set(getAllFolderPaths(nodes)));
            setHasInitialized(true);
        }
    }, [nodes, hasInitialized, getAllFolderPaths]);

    const toggleFolder = (path: string) => {
        const next = new Set(expanded);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        setExpanded(next);
    };

    const handleNodeCheck = (e: React.ChangeEvent<HTMLInputElement>, node: TreeNode) => {
        const ids = getAllFileIds(node);
        onCheckChange(ids, e.target.checked);
    };

    const isNodeChecked = (node: TreeNode) => {
        const ids = getAllFileIds(node);
        return ids.length > 0 && ids.every(id => checkedIds.has(id));
    };

    const isNodeIndeterminate = (node: TreeNode) => {
        const ids = getAllFileIds(node);
        const checkedCount = ids.filter(id => checkedIds.has(id)).length;
        return checkedCount > 0 && checkedCount < ids.length;
    };

    return (
        <div className="space-y-0.5" style={{ paddingLeft: level > 0 ? 12 : 0 }}>
            {nodes.map(node => {
                if (node.isFolder) {
                    const isOpen = expanded.has(node.path);
                    return (
                        <div key={node.path}>
                            <div className="w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors hover:bg-slate-100">
                                <input
                                    type="checkbox"
                                    checked={isNodeChecked(node)}
                                    ref={input => { if (input) input.indeterminate = isNodeIndeterminate(node); }}
                                    onChange={(e) => handleNodeCheck(e, node)}
                                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer"
                                />
                                <button
                                    onClick={() => toggleFolder(node.path)}
                                    className="flex items-center gap-1.5 flex-1 min-w-0"
                                >
                                    {isOpen ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" /> : <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" />}
                                    {isOpen ? <FolderOpen className="w-4 h-4 shrink-0 text-primary drop-shadow-sm" /> : <Folder className="w-4 h-4 shrink-0 text-slate-400" />}
                                    <span className="text-sm truncate select-none text-slate-700 font-medium">{node.name}</span>
                                </button>
                            </div>
                            {isOpen && node.children && (
                                <FileTreeView nodes={node.children} level={level + 1} selectedId={selectedId} onSelect={onSelect} checkedIds={checkedIds} onCheckChange={onCheckChange} />
                            )}
                        </div>
                    );
                } else {
                    const file = node.file!;
                    const isSelected = selectedId === file.id;
                    return (
                        <div key={file.id} className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors mt-0.5 ${isSelected ? 'bg-primary/5 border border-primary/20' : 'hover:bg-slate-50 border border-transparent'}`} style={{ paddingLeft: 26 }}>
                            <input
                                type="checkbox"
                                checked={checkedIds.has(file.id)}
                                onChange={(e) => handleNodeCheck(e, node)}
                                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer shrink-0"
                            />
                            <button
                                onClick={() => onSelect(file.id)}
                                className="flex items-center gap-2 flex-1 min-w-0 group"
                            >
                                <File className={`w-4 h-4 shrink-0 ${isSelected ? 'text-primary drop-shadow-sm' : 'text-slate-400 group-hover:text-slate-500'}`} />
                                <div className="flex-1 min-w-0 text-left">
                                    <p className={`text-sm truncate ${isSelected ? 'font-bold text-primary' : 'font-medium text-slate-700'}`}>{node.name}</p>
                                    <p className="text-[10px] text-slate-400 opacity-80">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                                <FileStatusDot status={file.status} />
                            </button>
                        </div>
                    );
                }
            })}
        </div>
    );
};

export default function TaskDetails({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id } = use(params);

    const [task, setTask] = useState<Task | null>(null);
    const [files, setFiles] = useState<FileRecord[]>([]);
    const [promptSets, setPromptSets] = useState<PromptSet[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // 选中的模型、文件、和关联词组等状态
    const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
    const [checkedFileIds, setCheckedFileIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const stopPollingRef = useRef(false);

    // 预览相关状态
    const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
    const [textContent, setTextContent] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);

    const selectedFile = files.find(f => f.id === selectedFileId) || null;

    // 右栏：词组选择与字段与提取结果状态
    const [selectedPromptSetId, setSelectedPromptSetId] = useState<string | null>(null);
    const [promptFields, setPromptFields] = useState<import('@/lib/services/prompts').PromptField[]>([]);
    const [extractedValues, setExtractedValues] = useState<Record<string, string>>({}); // fieldId -> value
    const [extractedSources, setExtractedSources] = useState<Record<string, string>>({}); // fieldId -> source
    const [extractedBboxes, setExtractedBboxes] = useState<Record<string, any>>({}); // fieldId -> {bbox, page, width, height}
    const [isCopied, setIsCopied] = useState(false);
    const [isAdvanced, setIsAdvanced] = useState(false);

    // 中栏文本搜索与图片高亮状态
    const [searchTerm, setSearchTerm] = useState('');
    const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
    const [matchIndex, setMatchIndex] = useState(0);   // 当前高亮第几个（0-based）
    const textContainerRef = useRef<HTMLDivElement>(null);

    const [activeBbox, setActiveBbox] = useState<any>(null); // { bbox: number[], page?: number, width?: number, height?: number }
    const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
    const imageScrollRef = useRef<HTMLDivElement>(null);
    const lastLoadedFileIdRef = useRef<string | null>(null);
    const [pdfPage, setPdfPage] = useState(0);
    const [zoom, setZoom] = useState(80);
    const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
    const [previewMode, setPreviewMode] = useState<'visual' | 'text'>('visual');

    const isTxtFile = !!(selectedFile && (selectedFile.name.toLowerCase().endsWith('.txt') || selectedFile.mime_type === 'text/plain'));

    const highlightText = useCallback((text: string, term: string) => {
        if (!term.trim()) return [<span key="all">{text}</span>];
        const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
        let matchCount = 0;
        return parts.map((part, i) =>
            part.toLowerCase() === term.toLowerCase()
                ? <mark key={i} data-match-index={matchCount++} className="bg-amber-300/80 text-slate-900 rounded-sm px-0.5">{part}</mark>
                : <span key={i}>{part}</span>
        );
    }, []);

    // 计算当前文本中的匹配总数
    const matchCount = searchTerm && textContent
        ? (textContent.match(new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length
        : 0;

    const navigateMatch = (direction: 'next' | 'prev') => {
        if (matchCount === 0) return;
        const next = direction === 'next'
            ? (matchIndex + 1) % matchCount
            : (matchIndex - 1 + matchCount) % matchCount;
        setMatchIndex(next);
        setTimeout(() => {
            const marks = textContainerRef.current?.querySelectorAll('mark');
            if (marks && marks[next]) {
                marks[next].scrollIntoView({ behavior: 'smooth', block: 'center' });
                marks.forEach((m, i) => {
                    (m as HTMLElement).style.background = i === next ? 'rgb(251 191 36 / 0.95)' : 'rgb(251 191 36 / 0.5)';
                });
            }
        }, 50);
    };

    const handleLocateInText = (value: string) => {
        if (!value.trim() || !textContent) return;
        setSearchTerm(value.trim());
        setActiveHighlight(value.trim());
        setMatchIndex(0);
        // 滑动到第一个高亮处
        setTimeout(() => {
            const marks = textContainerRef.current?.querySelectorAll('mark');
            if (marks && marks.length > 0) {
                marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const handleLocateBbox = (data: any) => {
        if (!data) return;
        const bbox = data.bbox || data;
        setActiveBbox(data);
        if (data.page !== undefined) {
            setPdfPage(data.page);
        }

        // 滑动至高亮框居中
        setTimeout(() => {
            if (imageScrollRef.current) {
                const container = imageScrollRef.current;
                const scrollContent = container.querySelector('img') as HTMLElement;
                const targetHeight = data.height || imageDimensions.height;
                if (!scrollContent || !targetHeight) return;

                const yPercent = (bbox[1] + bbox[3]) / 2 / targetHeight;
                const scrollY = yPercent * scrollContent.clientHeight - container.clientHeight / 2;
                container.scrollTo({ top: Math.max(0, scrollY), behavior: 'smooth' });
            }
        }, 150);
    };

    const handleUpdateSetConfig = async (key: string, value: any) => {
        if (!selectedPromptSetId) return;
        try {
            const updated = await promptService.updatePromptSet(selectedPromptSetId, { [key]: value });
            setPromptSets(prev => prev.map(s => s.id === selectedPromptSetId ? updated : s));
            toast.success('配置已实时更新');
        } catch (e: any) {
            toast.error('更新失败: ' + e.message);
        }
    };

    const navigateFile = (direction: 'next' | 'prev') => {
        if (files.length <= 1) return;
        const currentIndex = selectedFileId ? files.findIndex(f => f.id === selectedFileId) : -1;
        let nextIndex;
        if (direction === 'next') {
            nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % files.length;
        } else {
            nextIndex = currentIndex === -1 ? files.length - 1 : (currentIndex - 1 + files.length) % files.length;
        }
        setSelectedFileId(files[nextIndex].id);
    };

    useEffect(() => {
        loadTaskDetails();
    }, [id]);

    const loadTaskDetails = async () => {
        setIsLoading(true);
        try {
            const [taskData, filesData, promptSetsData] = await Promise.all([
                taskService.getTaskById(id),
                fileService.getFilesByTaskId(id),
                promptService.getPromptSets()
            ]);
            setTask(taskData);
            setFiles(filesData);
            setPromptSets(promptSetsData);

            if (filesData.length > 0) {
                setSelectedFileId(filesData[0].id);
            }

            // 自动选中上次使用的词组，或者默认词组
            const lastUsedId = taskData.prompt_set_id;
            const targetSet = (lastUsedId && promptSetsData.find(p => p.id === lastUsedId)) ||
                promptSetsData.find(p => p.is_default) ||
                promptSetsData[0];

            if (targetSet) {
                setSelectedPromptSetId(targetSet.id);
            }
        } catch (error: any) {
            toast.error('加载任务详情失败: ' + error.message);
            router.push('/');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!selectedFileId) {
            setSelectedFileUrl(null);
            setTextContent(null);
            return;
        }

        const loadPreview = async () => {
            // 如果已经加载过这个文件且 URL 已存在，则不再重复触发加载状态，避免轮询导致的闪烁
            if (lastLoadedFileIdRef.current === selectedFileId && selectedFileUrl) {
                return;
            }

            setIsPreviewLoading(true);
            setTextContent(null);
            setPdfPage(0); // 切换文件时重置页码
            try {
                const file = files.find(f => f.id === selectedFileId);
                if (file) {
                    const url = await fileService.getFileUrl(file.path);
                    setSelectedFileUrl(url);
                    lastLoadedFileIdRef.current = selectedFileId;

                    // 优先尝试从后端文本 API 获取内容（支持 pdf, docx, txt 等）
                    try {
                        const tRes = await fetch(`http://localhost:8000/api/v1/preview/text/${file.id}`);
                        if (tRes.ok) {
                            const tData = await tRes.json();
                            if (tData.text) setTextContent(tData.text);
                        }
                    } catch (e) {
                        console.error("fetch text API error", e);
                    }
                } else {
                    setSelectedFileUrl(null);
                    lastLoadedFileIdRef.current = null;
                }
            } catch (error) {
                console.error("Failed to load file preview:", error);
                setSelectedFileUrl(null);
                lastLoadedFileIdRef.current = null;
            } finally {
                setIsPreviewLoading(false);
            }
        };

        loadPreview();
    }, [selectedFileId]);

    // 当选中词组发生变化时，加载该词组下的所有字段
    useEffect(() => {
        if (!selectedPromptSetId) {
            setPromptFields([]);
            setExtractedValues({});
            return;
        }
        promptService.getFieldsByPromptSetId(selectedPromptSetId).then(fields => {
            setPromptFields(fields);
            // 初始化空的结果 map
            const init: Record<string, string> = {};
            fields.forEach(f => { init[f.id] = ''; });
            setExtractedValues(init);
        }).catch(console.error);
    }, [selectedPromptSetId]);

    const handleCopyJson = () => {
        const json: Record<string, string> = {};
        promptFields.forEach(f => { json[f.name] = extractedValues[f.id] || ''; });
        navigator.clipboard.writeText(JSON.stringify(json, null, 2)).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    const handleExportCsv = () => {
        if (promptFields.length === 0) return;
        const headers = ['文件名', ...promptFields.map(f => f.name)];
        const row = [
            selectedFile?.name || '',
            ...promptFields.map(f => `"${(extractedValues[f.id] || '').replace(/"/g, '""')}"`),
        ];
        const csv = '\uFEFF' + headers.join(',') + '\n' + row.join(',');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${selectedFile?.name || 'export'}_提取结果.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleCheckChange = (fileIds: string[], checked: boolean) => {
        const next = new Set(checkedFileIds);
        fileIds.forEach(fid => {
            if (checked) next.add(fid);
            else next.delete(fid);
        });
        setCheckedFileIds(next);
    };

    const handleDeleteSelected = async () => {
        if (checkedFileIds.size === 0) return;
        if (!confirm(`确定要彻底删除选取的 ${checkedFileIds.size} 个文件吗？`)) return;

        setIsDeleting(true);
        try {
            const filesToDelete = files.filter(f => checkedFileIds.has(f.id));
            // 真实云端删除
            for (const file of filesToDelete) {
                await fileService.deleteFile(file.id, file.path);
            }

            const updatedFiles = files.filter(f => !checkedFileIds.has(f.id));
            setFiles(updatedFiles);
            setCheckedFileIds(new Set());
            toast.success(`成功销毁 ${filesToDelete.length} 个文件`);

            // 如果你正在查看的文件被删除了，重新聚焦第一个文件
            if (selectedFileId && checkedFileIds.has(selectedFileId)) {
                setSelectedFileId(updatedFiles.length > 0 ? updatedFiles[0].id : null);
            }
        } catch (error: any) {
            toast.error('删除文件发生故障: ' + error.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleStartExtraction = async () => {
        if (!selectedPromptSetId) {
            toast.error('请先在右栏选择一个提示词组');
            return;
        }

        // 如果未选中任何文件，代表提取全部。如果有选中，只提取选中的。
        const targetFiles = checkedFileIds.size > 0
            ? files.filter(f => checkedFileIds.has(f.id))
            : files;

        if (targetFiles.length === 0) {
            toast.error('当前任务中没有任何有效文件可供提取');
            return;
        }

        const supabaseUser = await import('@/lib/supabase/client').then(m => m.createClient()).then(c => c.auth.getUser());
        const userId = supabaseUser.data.user?.id;
        if (!userId) {
            toast.error('用户未登录');
            return;
        }

        setIsExtracting(true);
        stopPollingRef.current = false;
        try {
            const res = await fetch('http://localhost:8000/api/v1/extract/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task_id: id,
                    file_ids: checkedFileIds.size > 0 ? Array.from(checkedFileIds) : [],
                    prompt_set_id: selectedPromptSetId,
                    user_id: userId,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || '后端返回错误');
            }

            const data = await res.json();
            toast.success(data.message || `提取指令已下发！共 ${data.queued_file_count} 个文件`);
            setCheckedFileIds(new Set());

            // 进入轮询模式：每3秒检查一次文件状态，直到所有目标文件完成
            const targetFileIds = targetFiles.map(f => f.id);
            const pollInterval = setInterval(async () => {
                // 如果前端主动终止，则清理轮询
                if (stopPollingRef.current) {
                    clearInterval(pollInterval);
                    setIsExtracting(false);
                    return;
                }

                try {
                    const { fileService } = await import('@/lib/services/files');
                    const updatedFiles = await fileService.getFilesByTaskId(id);
                    setFiles(updatedFiles);

                    const allDone = targetFileIds.every(fid => {
                        const f = updatedFiles.find(uf => uf.id === fid);
                        return f && (f.status === 'extracted' || f.status === 'extract_failed');
                    });

                    if (allDone) {
                        clearInterval(pollInterval);
                        setIsExtracting(false);
                        toast.success('所有文件提取已完成！');
                        // 自动加载当前选中文件的提取结果
                        if (selectedFileId) loadExtractionResults(selectedFileId);
                    }
                } catch { /* ignore poll errors */ }
            }, 3000);

            // 最多轮询 5 分钟后停止
            setTimeout(() => {
                clearInterval(pollInterval);
                setIsExtracting(false);
            }, 5 * 60 * 1000);

        } catch (error: any) {
            toast.error('提取失败: ' + error.message);
            setIsExtracting(false);
        }
    };

    const handleTerminateExtraction = async () => {
        if (!confirm('确定要终止当前的批量提取任务吗？已发出的请求将尝试撤回。')) return;

        setIsTerminating(true);
        try {
            const res = await fetch(`http://localhost:8000/api/v1/extract/terminate/${id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            if (!res.ok) {
                const error = await res.json().catch(() => ({}));
                throw new Error(error.message || '终止指令下发失败');
            }

            toast.success('终止请求已发送');
            stopPollingRef.current = true;
            setIsExtracting(false);

            // 刷新一次页面数据查看状态
            loadTaskDetails();
        } catch (error: any) {
            toast.error('操作失败: ' + error.message);
        } finally {
            setIsTerminating(false);
        }
    };

    const loadExtractionResults = async (fileId: string) => {
        try {
            const res = await fetch(`http://localhost:8000/api/v1/extract/results/${fileId}`);
            if (!res.ok) {
                setExtractedValues({});
                setExtractedSources({});
                setExtractedBboxes({});
                return;
            }
            const data = await res.json();
            const results: any[] = data.results || [];

            const newValues: Record<string, string> = {};
            const newSources: Record<string, string> = {};
            const newBboxes: Record<string, any> = {};
            results.forEach(r => {
                if (r.field_id) {
                    newValues[r.field_id] = r.value || '';
                    newSources[r.field_id] = r.source || '';
                    newBboxes[r.field_id] = r.bbox ? {
                        bbox: r.bbox.bbox,
                        page: r.bbox.page || 0,
                        width: r.bbox.page_width,
                        height: r.bbox.page_height
                    } : null;
                }
            });
            setExtractedValues(newValues);
            setExtractedSources(newSources);
            setExtractedBboxes(newBboxes);
        } catch (error) {
            console.error("Failed to load extraction results:", error);
            setExtractedValues({});
            setExtractedSources({});
            setExtractedBboxes({});
        }
    };

    // 切换文件时自动加载存在的提取结果，清除高亮记录
    useEffect(() => {
        if (selectedFileId && selectedPromptSetId) {
            loadExtractionResults(selectedFileId);
            setActiveHighlight(null);
            setSearchTerm('');
            setActiveBbox(null);
            setImageDimensions({ width: 0, height: 0 });
            setPdfPage(0); // Reset PDF page when file changes
            setPreviewMode('visual'); // Default to visual for PDF/Images
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFileId, selectedPromptSetId]);

    if (isLoading) {
        return (
            <>
                <Header title="任务详情" />
                <div className="flex-1 flex items-center justify-center p-8 bg-slate-50/50">
                    <div className="flex flex-col items-center gap-4 text-slate-400">
                        <Loader2 className="w-10 h-10 animate-spin" />
                        <p className="font-semibold">正在载入任务工作台...</p>
                    </div>
                </div>
            </>
        );
    }

    if (!task) return null;

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'uploaded': return { icon: <Clock className="w-4 h-4" />, color: 'text-amber-500', bg: 'bg-amber-50', label: '待处理' };
            case 'extracting': return { icon: <Loader2 className="w-4 h-4 animate-spin" />, color: 'text-blue-500', bg: 'bg-blue-50', label: '提取中' };
            case 'extracted': return { icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-green-500', bg: 'bg-green-50', label: '已提取' };
            case 'extract_failed': return { icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-500', bg: 'bg-red-50', label: '提取失败' };
            default: return { icon: <AlertCircle className="w-4 h-4" />, color: 'text-slate-400', bg: 'bg-slate-50', label: status };
        }
    };

    const statusConfig = getStatusConfig(task.status);

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <Header title="任务详情" />

            {/* 工作台顶部 Meta 控制区 */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10 shrink-0">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/')}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-slate-900">{task.name}</h1>
                            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${statusConfig.color} ${statusConfig.bg}`}>
                                {statusConfig.icon}
                                {statusConfig.label}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            包含 {files.length} 个受处理文件
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={handleStartExtraction}
                        disabled={isExtracting}
                        className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold shadow-md transition-all disabled:opacity-50"
                    >
                        {isExtracting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <PlayCircle className="w-4 h-4" />
                        )}
                        {checkedFileIds.size > 0 ? `提取所选 (${checkedFileIds.size})` : '开始批量提取'}
                    </button>

                    {(isExtracting || files.some(f => f.status === 'extracting')) && (
                        <button
                            onClick={async (e) => {
                                e.preventDefault();
                                await handleTerminateExtraction();
                            }}
                            disabled={isTerminating}
                            className="flex items-center gap-2 px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold border border-red-200 transition-all disabled:opacity-50 cursor-pointer"
                        >
                            {isTerminating ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <XCircle className="w-4 h-4" />
                            )}
                            终止任务
                        </button>
                    )}
                </div>
            </div>

            {/* 核心三栏/两栏工作区布局 */}
            <div className="flex-1 flex overflow-hidden p-4 gap-4">

                {/* 左栏：文件列表树 */}
                <aside className="w-80 bg-white border border-slate-200 shadow-sm rounded-2xl flex flex-col shrink-0 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-800 flex items-center gap-2">
                                <File className="w-4 h-4 text-primary" />
                                任务文件列表
                            </h2>
                            {checkedFileIds.size > 0 && (
                                <button
                                    onClick={handleDeleteSelected}
                                    disabled={isDeleting}
                                    className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-bold shrink-0 disabled:opacity-50"
                                    title="销毁选中的文件"
                                >
                                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    <span className="hidden sm:inline">删除({checkedFileIds.size})</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="p-3 overflow-y-auto flex-1 tree-scrollbar">
                        <FileTreeView
                            nodes={buildFileTree(files)}
                            selectedId={selectedFileId}
                            onSelect={setSelectedFileId}
                            checkedIds={checkedFileIds}
                            onCheckChange={handleCheckChange}
                        />
                    </div>
                </aside>

                {/* 主内容区（中右） - 暂使用平分占位 */}
                <main className="flex-1 flex gap-4 overflow-hidden">
                    {/* 中栏：文件多格式预览 */}
                    <div className="flex-1 bg-white border border-slate-200 shadow-sm rounded-2xl flex flex-col overflow-hidden">
                        {/* 预览区文件导航 Header */}
                        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-xs font-bold text-slate-600 truncate">
                                    {selectedFile ? selectedFile.name : '等待选择文件...'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* 搜索框 */}
                                <div className="relative group mr-4">
                                    <div className="flex items-center bg-slate-100 rounded-lg px-2 py-1 border border-transparent focus-within:border-primary/30 focus-within:bg-white transition-all">
                                        <Search className="w-3.5 h-3.5 text-slate-400" />
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && navigateMatch('next')}
                                            placeholder="搜索文中内容..."
                                            className="bg-transparent border-none text-[11px] font-medium text-slate-600 focus:outline-none w-32 px-1.5 placeholder:text-slate-400"
                                        />
                                        {searchTerm && (
                                            <div className="flex items-center gap-1 ml-1 border-l border-slate-200 pl-1">
                                                <span className="text-[10px] text-slate-400 font-mono tabular-nums">
                                                    {matchCount > 0 ? matchIndex + 1 : 0}/{matchCount}
                                                </span>
                                                <button onClick={() => navigateMatch('prev')} className="p-0.5 hover:bg-slate-200 rounded text-slate-500"><ChevronUp className="w-3 h-3" /></button>
                                                <button onClick={() => navigateMatch('next')} className="p-0.5 hover:bg-slate-200 rounded text-slate-500"><ChevronDown className="w-3 h-3" /></button>
                                                <button onClick={() => setSearchTerm('')} className="p-0.5 hover:bg-slate-200 rounded text-slate-500"><X className="w-3 h-3" /></button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={() => navigateFile('prev')}
                                    disabled={files.length <= 1}
                                    className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md transition-all disabled:opacity-30 flex items-center gap-1"
                                >
                                    <ChevronLeft className="w-3 h-3" />
                                    上一个
                                </button>
                                <div className="w-[1px] h-3 bg-slate-200" />
                                <button
                                    onClick={() => navigateFile('next')}
                                    disabled={files.length <= 1}
                                    className="px-2.5 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-md transition-all disabled:opacity-30 flex items-center gap-1"
                                >
                                    下一个
                                    <ChevronRight className="w-3 h-3" />
                                </button>
                                {textContent && (selectedFile?.mime_type === 'application/pdf' || selectedFile?.name.toLowerCase().endsWith('.pdf') || selectedFile?.mime_type?.startsWith('image/')) && (
                                    <div className="flex bg-slate-200 p-0.5 rounded-lg ml-2">
                                        <button
                                            onClick={() => setPreviewMode('visual')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${previewMode === 'visual' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            视觉
                                        </button>
                                        <button
                                            onClick={() => setPreviewMode('text')}
                                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${previewMode === 'text' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                        >
                                            文本
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 搜索栏（仅 TXT 文件展示） */}
                        {isTxtFile && selectedFileUrl && (
                            <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2 shrink-0">
                                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => { setSearchTerm(e.target.value); setMatchIndex(0); }}
                                    onKeyDown={e => e.key === 'Enter' && navigateMatch('next')}
                                    placeholder="在文本中搜索..."
                                    className="flex-1 text-sm bg-transparent outline-none text-slate-700 placeholder:text-slate-400"
                                />
                                {searchTerm && matchCount > 0 && (
                                    <span className="text-xs text-slate-400 font-mono shrink-0">
                                        {matchIndex + 1}/{matchCount}
                                    </span>
                                )}
                                {searchTerm && matchCount === 0 && (
                                    <span className="text-xs text-red-400 shrink-0">无匹配</span>
                                )}
                                {searchTerm && matchCount > 0 && (
                                    <>
                                        <button onClick={() => navigateMatch('prev')} className="p-0.5 hover:bg-slate-200 rounded text-slate-400 transition-colors">
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => navigateMatch('next')} className="p-0.5 hover:bg-slate-200 rounded text-slate-400 transition-colors">
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                )}
                                {searchTerm && (
                                    <button onClick={() => { setSearchTerm(''); setActiveHighlight(null); setMatchIndex(0); }} className="p-0.5 hover:bg-slate-200 rounded text-slate-400 transition-colors">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        )}
                        {isPreviewLoading ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                                <p className="font-semibold">正在解析文件流...</p>
                            </div>
                        ) : selectedFileUrl && selectedFile ? (
                            <>
                                {selectedFile.mime_type?.startsWith('image/') ? (
                                    <div ref={imageScrollRef} className="flex-1 w-full relative overflow-auto bg-slate-100/50 p-4">
                                        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border border-slate-200/60 rounded-full px-4 py-2 shadow-xl shadow-slate-200/50 flex items-center gap-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="flex items-center gap-1.5 border-r border-slate-100 pr-4 mr-2">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">视图控制</span>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setZoom(z => Math.max(10, z - 10))}
                                                    className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-all active:scale-95 text-slate-500 hover:text-primary"
                                                    title="缩小"
                                                >
                                                    <ZoomOut className="w-5 h-5" />
                                                </button>

                                                <div className="flex items-center gap-2 group">
                                                    <input
                                                        type="range"
                                                        min="10"
                                                        max="200"
                                                        value={zoom}
                                                        onChange={(e) => setZoom(parseInt(e.target.value))}
                                                        className="w-32 accent-primary cursor-pointer"
                                                    />
                                                    <span className="text-xs font-mono font-bold text-primary min-w-[40px] tabular-nums">
                                                        {zoom}%
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => setZoom(z => Math.min(300, z + 10))}
                                                    className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-all active:scale-95 text-slate-500 hover:text-primary"
                                                    title="放大"
                                                >
                                                    <ZoomIn className="w-5 h-5" />
                                                </button>

                                                <button
                                                    onClick={() => setZoom(100)}
                                                    className="ml-2 px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-primary hover:text-white text-slate-500 rounded transition-all active:scale-95"
                                                >
                                                    重置
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            className="relative shadow-2xl rounded-sm border border-slate-200/80 bg-white mx-auto inline-block overflow-visible box-border transition-all duration-300 ease-out"
                                            style={{ width: `${zoom}%` }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={selectedFileUrl}
                                                alt={selectedFile.name}
                                                className="block max-w-full h-auto w-full object-contain"
                                                onLoad={(e) => setImageDimensions({
                                                    width: e.currentTarget.naturalWidth,
                                                    height: e.currentTarget.naturalHeight
                                                })}
                                            />
                                            {activeBbox && imageDimensions.width > 0 && (
                                                <div
                                                    className="absolute border-[3px] border-red-500 bg-red-500/20 z-10 pointer-events-none transition-all duration-300 rounded shadow-sm shadow-red-500/50 mix-blend-multiply"
                                                    style={{
                                                        left: `${(activeBbox.bbox[0] / (activeBbox.width || imageDimensions.width)) * 100}%`,
                                                        top: `${(activeBbox.bbox[1] / (activeBbox.height || imageDimensions.height)) * 100}%`,
                                                        width: `${((activeBbox.bbox[2] - activeBbox.bbox[0]) / (activeBbox.width || imageDimensions.width)) * 100}%`,
                                                        height: `${((activeBbox.bbox[3] - activeBbox.bbox[1]) / (activeBbox.height || imageDimensions.height)) * 100}%`
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ) : (selectedFile.mime_type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf')) ? (
                                    <div ref={imageScrollRef} className="flex-1 w-full relative overflow-auto bg-slate-100/50 flex flex-col items-center gap-4 p-4 scroll-smooth">
                                        <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border border-slate-200/60 rounded-full px-4 py-2 shadow-xl shadow-slate-200/50 flex items-center gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
                                            <div className="flex items-center gap-3 border-r border-slate-100 pr-6 mr-2">
                                                <button
                                                    onClick={() => setPdfPage(p => Math.max(0, p - 1))}
                                                    className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-all active:scale-95 text-slate-500 hover:text-primary"
                                                >
                                                    <ChevronLeft className="w-5 h-5" />
                                                </button>
                                                <span className="text-sm font-black text-slate-700 min-w-[70px] text-center tabular-nums tracking-tighter">
                                                    PAGE {pdfPage + 1}
                                                </span>
                                                <button
                                                    onClick={() => setPdfPage(p => p + 1)}
                                                    className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-all active:scale-95 text-slate-500 hover:text-primary"
                                                >
                                                    <ChevronRight className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setZoom(z => Math.max(10, z - 10))}
                                                    className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-all active:scale-95 text-slate-500 hover:text-primary"
                                                    title="缩小"
                                                >
                                                    <ZoomOut className="w-5 h-5" />
                                                </button>

                                                <div className="flex items-center gap-2 group">
                                                    <input
                                                        type="range"
                                                        min="10"
                                                        max="200"
                                                        value={zoom}
                                                        onChange={(e) => setZoom(parseInt(e.target.value))}
                                                        className="w-32 accent-primary cursor-pointer"
                                                    />
                                                    <span className="text-xs font-mono font-bold text-primary min-w-[40px] tabular-nums">
                                                        {zoom}%
                                                    </span>
                                                </div>

                                                <button
                                                    onClick={() => setZoom(z => Math.min(300, z + 10))}
                                                    className="p-1.5 hover:bg-slate-100/80 rounded-lg transition-all active:scale-95 text-slate-500 hover:text-primary"
                                                    title="放大"
                                                >
                                                    <ZoomIn className="w-5 h-5" />
                                                </button>

                                                <button
                                                    onClick={() => setZoom(100)}
                                                    className="ml-2 px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-primary hover:text-white text-slate-500 rounded transition-all active:scale-95"
                                                >
                                                    重置
                                                </button>
                                            </div>
                                        </div>

                                        <div
                                            className="relative shadow-2xl rounded-sm border border-slate-200/80 bg-white mx-auto inline-block overflow-visible box-border transition-all duration-300 ease-out"
                                            style={{ width: `${zoom}%` }}
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                key={`${selectedFileId}-p${pdfPage}`}
                                                src={`http://localhost:8000/api/v1/preview/pdf-page?file_path=${encodeURIComponent(selectedFile.path)}&page_num=${pdfPage}`}
                                                alt={`PDF Page ${pdfPage + 1}`}
                                                className="block w-full h-auto object-contain pointer-events-none"
                                                onLoad={(e) => setImageDimensions({
                                                    width: e.currentTarget.naturalWidth,
                                                    height: e.currentTarget.naturalHeight
                                                })}
                                            />
                                            {activeBbox && activeBbox.page === pdfPage && imageDimensions.width > 0 && (
                                                <div
                                                    className="absolute border-[3px] border-red-500 bg-red-500/20 z-10 pointer-events-none transition-all duration-300 rounded shadow-sm shadow-red-500/50 mix-blend-multiply"
                                                    style={{
                                                        left: `${(activeBbox.bbox[0] / (activeBbox.width || imageDimensions.width)) * 100}%`,
                                                        top: `${(activeBbox.bbox[1] / (activeBbox.height || imageDimensions.height)) * 100}%`,
                                                        width: `${((activeBbox.bbox[2] - activeBbox.bbox[0]) / (activeBbox.width || imageDimensions.width)) * 100}%`,
                                                        height: `${((activeBbox.bbox[3] - activeBbox.bbox[1]) / (activeBbox.height || imageDimensions.height)) * 100}%`
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-medium tracking-wide">使用 AI 智能分页渲染引擎 · 支持溯源高亮定位</p>
                                    </div>
                                ) : (previewMode === 'text' || isTxtFile) || (textContent && (selectedFile.name.toLowerCase().endsWith('.docx') || selectedFile.name.toLowerCase().endsWith('.doc'))) ? (
                                    <div ref={textContainerRef} className="flex-1 p-8 overflow-y-auto bg-white tree-scrollbar">
                                        <div className="max-w-3xl mx-auto">
                                            <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">文本溯源视图</span>
                                                <div className="flex items-center gap-2">
                                                    <Search className="w-3 h-3 text-slate-400" />
                                                    <span className="text-[10px] text-slate-500 font-medium">搜索可在文中高亮标注</span>
                                                </div>
                                            </div>
                                            <pre className="whitespace-pre-wrap font-sans text-slate-700 text-sm leading-[1.8] tracking-wide">
                                                {textContent ? highlightText(textContent, searchTerm) : '正在读取文本内容...'}
                                            </pre>
                                        </div>
                                    </div>
                                ) : (selectedFile.name.toLowerCase().endsWith('.docx') || selectedFile.name.toLowerCase().endsWith('.doc') || selectedFile.name.toLowerCase().endsWith('.xlsx')) ? (
                                    <iframe
                                        src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(selectedFileUrl)}`}
                                        className="flex-1 w-full border-0 bg-white"
                                        title={selectedFile.name}
                                    />
                                ) : (
                                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                                        <File className="w-12 h-12 mb-4 opacity-30" />
                                        <p className="font-bold text-lg text-slate-600">无法在线预览当前文件格式</p>
                                        <p className="text-sm mt-2 max-w-sm text-center">暂不支持该格式的可视化展示</p>
                                        <a href={selectedFileUrl} target="_blank" rel="noreferrer" className="text-primary font-bold hover:underline mt-4 text-sm bg-primary/10 px-4 py-2 rounded-lg">
                                            直接下载文件
                                        </a>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                                <Eye className="w-12 h-12 mb-4 opacity-30" />
                                <p className="font-bold text-lg text-slate-600">选择左侧文件以开始预览</p>
                            </div>
                        )}
                    </div>

                    {/* 右栏：结构化字段干预 */}
                    <div className="w-[400px] bg-white border border-slate-200 shadow-sm rounded-2xl flex flex-col shrink-0 overflow-hidden">
                        {/* 右栏头部 */}
                        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-2 shrink-0">
                            <div className="flex items-center justify-between">
                                <h2 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                    <BookOpen className="w-4 h-4 text-primary" />
                                    选择提示词组
                                </h2>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleCopyJson}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                                        title="复制为 JSON"
                                    >
                                        {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                    </button>
                                    <button
                                        onClick={handleExportCsv}
                                        disabled={promptFields.length === 0}
                                        className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-30"
                                        title="导出 CSV"
                                    >
                                        <FileText className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            {/* 词组选择器 */}
                            {promptSets.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={selectedPromptSetId || ''}
                                            onChange={e => setSelectedPromptSetId(e.target.value)}
                                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 font-semibold"
                                        >
                                            {promptSets.map(ps => (
                                                <option key={ps.id} value={ps.id}>{ps.name}{ps.is_default ? ' ★' : ''}</option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => setIsAdvanced(!isAdvanced)}
                                            className={`p-1.5 rounded-lg transition-colors ${isAdvanced ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-400'}`}
                                            title="配置分段参数"
                                        >
                                            <Settings2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* 快速分段配置 */}
                                    {isAdvanced && selectedPromptSetId && (
                                        <div className="p-3 bg-white border border-slate-100 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-1 duration-200 shadow-sm">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">分段大小</label>
                                                    <input
                                                        type="number"
                                                        value={promptSets.find(s => s.id === selectedPromptSetId)?.chunk_size || 2000}
                                                        onChange={e => handleUpdateSetConfig('chunk_size', parseInt(e.target.value))}
                                                        className="w-full text-xs font-bold border-none bg-slate-50 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-primary/30 outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase">重叠字符</label>
                                                    <input
                                                        type="number"
                                                        value={promptSets.find(s => s.id === selectedPromptSetId)?.chunk_overlap || 200}
                                                        onChange={e => handleUpdateSetConfig('chunk_overlap', parseInt(e.target.value))}
                                                        className="w-full text-xs font-bold border-none bg-slate-50 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-primary/30 outline-none"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase flex justify-between">
                                                    <span>分段分隔符 (Separators)</span>
                                                    <span className="italic">JSON 格式</span>
                                                </label>
                                                <textarea
                                                    value={JSON.stringify(promptSets.find(s => s.id === selectedPromptSetId)?.separators || ["\\n\\n", "\\n", "。", ".", " ", ""])}
                                                    onChange={e => {
                                                        try {
                                                            const val = JSON.parse(e.target.value);
                                                            if (Array.isArray(val)) handleUpdateSetConfig('separators', val);
                                                        } catch (err) { }
                                                    }}
                                                    rows={2}
                                                    className="w-full text-[10px] font-mono border-none bg-slate-50 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-primary/30 outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 字段列表区 */}
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 tree-scrollbar">
                            {!selectedFile ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                                    <Edit3 className="w-8 h-8 mb-3 opacity-30" />
                                    <p className="text-sm font-medium">选择左侧文件以开始干预</p>
                                </div>
                            ) : promptFields.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                                    <Settings2 className="w-8 h-8 mb-3 opacity-30" />
                                    <p className="text-sm font-medium">该词组尚未配置字段</p>
                                    <p className="text-xs mt-1">Please add fields to the prompt set first</p>
                                </div>
                            ) : promptFields.map((field, idx) => (
                                <div key={field.id} className="bg-slate-50 border border-slate-100 rounded-xl p-3 hover:border-slate-200 transition-colors group">
                                    <div className="flex items-start justify-between mb-1.5">
                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className="text-xs font-bold text-slate-400 bg-slate-200/70 rounded-md px-1.5 py-0.5 shrink-0">#{idx + 1}</span>
                                            <span
                                                className={`text-sm font-bold cursor-pointer transition-colors truncate ${activeFieldId === field.id
                                                    ? 'text-red-600'
                                                    : 'text-slate-700 hover:text-primary'
                                                    }`}
                                                onClick={() => {
                                                    setActiveFieldId(field.id);
                                                    const src = extractedSources[field.id];
                                                    const bboxData = extractedBboxes[field.id];
                                                    if (bboxData) handleLocateBbox(bboxData);
                                                    if (src?.trim()) handleLocateInText(src);
                                                }}
                                                title={extractedSources[field.id] || extractedBboxes[field.id] ? '点击在文中定位' : field.name}
                                            >
                                                {field.name}
                                            </span>
                                            <span className="text-[10px] text-slate-400 bg-slate-200/50 px-1.5 py-0.5 rounded-md shrink-0">{field.data_type}</span>
                                        </div>
                                        {/* ℹ source tooltip */}
                                        <div className="relative shrink-0 ml-1 group/info">
                                            <Info className="w-3.5 h-3.5 text-slate-300 hover:text-slate-500 cursor-help transition-colors" />
                                            <div className="absolute right-0 top-5 z-50 hidden group-hover/info:block w-64 bg-slate-800 text-white text-[11px] rounded-lg p-2.5 shadow-xl leading-relaxed">
                                                <p className="font-semibold text-slate-300 mb-1">原文出处</p>
                                                <p className="text-slate-400">{extractedSources[field.id] || '无提取出处'}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <textarea
                                        value={extractedValues[field.id] || ''}
                                        onChange={e => setExtractedValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                                        onClick={() => {
                                            setActiveFieldId(field.id);
                                            const src = extractedSources[field.id];
                                            const bbox = extractedBboxes[field.id];
                                            if (src?.trim()) handleLocateInText(src);
                                            if (bbox) handleLocateBbox(bbox);
                                        }}
                                        placeholder={`提取结果将在此展示...`}
                                        rows={2}
                                        className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-700 placeholder:text-slate-300 transition-all cursor-text"
                                    />

                                </div>
                            ))}
                        </div>
                    </div>
                </main>

            </div>
        </div>
    );
}
