'use client';

import { Header } from '@/components/header';
import { Clock, CheckCircle2, AlertCircle, Filter, Trash2, Plus, Eye, UploadCloud, X, FileText, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { taskService, Task, TaskStatus } from '@/lib/services/tasks';
import { fileService } from '@/lib/services/files';

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // 新增：删除操作的弹窗状态
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 加载数据
  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const data = await taskService.getTasks();
      setTasks(data);
    } catch (error: any) {
      toast.error('获取任务列表失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // 状态显示辅助函数
  const getStatusDisplay = (status: TaskStatus) => {
    switch (status) {
      case 'uploading': return { label: '同步中', color: 'bg-blue-100 text-blue-700' };
      case 'uploaded': return { label: '待处理', color: 'bg-amber-100 text-amber-700' };
      case 'upload_failed': return { label: '同步失败', color: 'bg-red-100 text-red-700' };
      case 'extracting': return { label: '提取中', color: 'bg-blue-100 text-blue-700' };
      case 'extracted': return { label: '提取成功', color: 'bg-primary/10 text-primary' };
      case 'extract_failed': return { label: '提取失败', color: 'bg-red-100 text-red-700' };
      case 'reviewed': return { label: '审核完成', color: 'bg-indigo-100 text-indigo-700' };
      default: return { label: status, color: 'bg-slate-100 text-slate-700' };
    }
  };

  // 统计数据
  const stats = {
    ongoing: tasks.filter(t => ['uploading', 'extracting'].includes(t.status)).length,
    completed: tasks.filter(t => ['extracted', 'reviewed'].includes(t.status)).length,
    failed: tasks.filter(t => ['upload_failed', 'extract_failed'].includes(t.status)).length,
  };

  // 文件夹上传处理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 提取文件夹名称
      let folderName = `任务-${new Date().getTime().toString().slice(-6)}`;
      const firstPath = files[0].webkitRelativePath;
      if (firstPath) {
        folderName = firstPath.split('/')[0];
      }

      // 生成 UUID 并组合，全大写
      const taskUuid = crypto.randomUUID().toUpperCase();
      const taskName = `${folderName}_${taskUuid}`;

      // 1. 创建任务
      const newTask = await taskService.createTask(taskName);

      // 2. 依次上传所有文件
      const totalFiles = files.length;
      for (let i = 0; i < totalFiles; i++) {
        await fileService.uploadFile(newTask.id, files[i]);
        setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
      }

      // 3. 更新任务状态为已上传
      await taskService.updateTaskStatus(newTask.id, 'uploaded');

      toast.success(`任务「${taskName}」同步成功，共 ${totalFiles} 个文件`);
      setIsModalOpen(false);
      loadTasks(); // 刷新列表
    } catch (error: any) {
      toast.error('任务同步失败: ' + error.message);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // -- 单删逻辑 --
  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await taskService.deleteTask(taskToDelete);
      setTasks(prev => prev.filter(t => t.id !== taskToDelete));
      setSelectedTasks(prev => prev.filter(id => id !== taskToDelete));
      toast.success('任务已安全移除');
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    } finally {
      setTaskToDelete(null); // 关闭弹窗
    }
  };

  // -- 批量删除逻辑 --
  const confirmBulkDelete = async () => {
    if (selectedTasks.length === 0) return;
    try {
      await taskService.deleteTasks(selectedTasks);
      setTasks(prev => prev.filter(t => !selectedTasks.includes(t.id)));
      setSelectedTasks([]);
      toast.success('批量清理完成');
    } catch (error: any) {
      toast.error('批量删除失败: ' + error.message);
    } finally {
      setIsBulkDeleting(false); // 关闭弹窗
    }
  };

  const toggleTaskSelection = (id: string) => {
    setSelectedTasks(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  return (
    <>
      <Header title="任务列表 Dashboard" />
      <main className="flex-1 overflow-y-auto p-8 space-y-8 relative">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">正在处理文件夹</p>
                <h3 className="text-3xl font-bold text-slate-900">{stats.ongoing}</h3>
              </div>
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">已完成批次</p>
                <h3 className="text-3xl font-bold text-slate-900">{stats.completed}</h3>
              </div>
              <div className="p-3 bg-green-50 text-green-600 rounded-xl">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 text-sm font-medium mb-1">异常文件夹</p>
                <h3 className="text-3xl font-bold text-slate-900">{stats.failed}</h3>
              </div>
              <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                <AlertCircle className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Table Controls */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <button
            onClick={() => loadTasks()}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            刷新列表
          </button>
          <div className="flex gap-3">
            <button
              onClick={() => setIsBulkDeleting(true)}
              disabled={selectedTasks.length === 0}
              className="px-4 py-2 bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-sm font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              批量清理 {selectedTasks.length > 0 && `(${selectedTasks.length})`}
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              递归上传文件夹
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin mb-4" />
              <p>正在同步云端数据...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-medium text-slate-500 text-lg">暂无处理文件夹</p>
              <p className="text-sm mt-1">点击右上角「递归上传文件夹」开始作业</p>
            </div>
          ) : (
            <>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 w-12 text-center text-slate-400">
                      #
                    </th>
                    <th className="p-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">任务名称</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">上传时间</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 uppercase tracking-wider text-center">状态</th>
                    <th className="p-4 text-sm font-semibold text-slate-600 uppercase tracking-wider text-right">管理</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.map((task) => {
                    const status = getStatusDisplay(task.status);
                    const isSelected = selectedTasks.includes(task.id);
                    return (
                      <tr key={task.id} className={`hover:bg-slate-50 transition-colors group ${isSelected ? 'bg-primary/5' : ''}`}>
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTaskSelection(task.id)}
                            className="rounded border-slate-300 text-primary focus:ring-primary/20 w-4 h-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-4 font-bold text-sm text-slate-900">{task.name}</td>
                        <td className="p-4 text-sm text-slate-600">
                          {new Date(task.created_at).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link href={`/tasks/${task.id}`} className="inline-flex text-slate-400 hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-primary/10" title="进入审核流程">
                              <Eye className="w-5 h-5" />
                            </Link>
                            <button
                              onClick={() => setTaskToDelete(task.id)}
                              className="inline-flex text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-red-50"
                              title="删除此文件夹任务"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="p-4 border-t border-slate-100">
                <p className="text-sm text-slate-500">共 {tasks.length} 个处理单元</p>
              </div>
            </>
          )}
        </div>
      </main>

      {/* -- 单项删除确认弹窗 -- */}
      {taskToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">确认删除任务？</h2>
              <p className="text-sm text-slate-500">此操作不可逆，将同时删除云端存储中的所有关联文件和数据。</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-center gap-3">
              <button
                onClick={() => setTaskToDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteTask}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 shadow-sm transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- 批量删除确认弹窗 -- */}
      {isBulkDeleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">确认批量删除？</h2>
              <p className="text-sm text-slate-500">即将永久删除选中的 <strong className="text-red-500">{selectedTasks.length}</strong> 个任务及其所有内部文件，此操作不可逆。</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-center gap-3">
              <button
                onClick={() => setIsBulkDeleting(false)}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmBulkDelete}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-red-500 rounded-xl hover:bg-red-600 shadow-sm transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">新建同步任务</h2>
              <button
                onClick={() => !isUploading && setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                disabled={isUploading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* File Upload Zone */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">选择本地数据文件夹（将递归匹配内部所有文档）</label>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFileUpload}
                  {...({ webkitdirectory: "", directory: "" } as any)}
                />
                <div
                  className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors ${isUploading ? 'border-slate-200 bg-slate-50' : 'border-primary/30 hover:border-primary hover:bg-primary/5 cursor-pointer'}`}
                  onClick={() => !isUploading && fileInputRef.current?.click()}
                >
                  <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-transform ${isUploading ? 'bg-slate-200 text-slate-400' : 'bg-primary/10 text-primary hover:scale-110'}`}>
                    {isUploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <UploadCloud className="w-7 h-7" />}
                  </div>
                  <h3 className="text-base font-bold text-slate-800 mb-1">
                    {isUploading ? '正在极速同步文件夹内资产...' : '点击选择文件夹'}
                  </h3>
                  <p className="text-sm text-slate-500">支持读取文件夹层级，自动过滤非识别文档格式</p>
                </div>
              </div>

              {/* Upload Progress */}
              {isUploading && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 font-medium">任务批次同步进度</span>
                    <span className="text-primary font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-center text-[10px] text-slate-400">系统正在保持原有目录结构进行云端映射</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isUploading}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
