'use client';

import { Header } from '@/components/header';
import { Terminal, FileEdit, FileText, PlayCircle, Code, Eye, Plus, ChevronDown, Trash2, Save, Loader2, Info, Settings2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { promptService, PromptSet, PromptField, DEFAULT_SYSTEM_PROMPT } from '@/lib/services/prompts';

export default function Prompts() {
  const [promptSets, setPromptSets] = useState<PromptSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [fields, setFields] = useState<Omit<PromptField, 'id' | 'prompt_set_id' | 'user_id' | 'created_at'>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAdvanced, setIsAdvanced] = useState(false);

  // Debug states
  const [testText, setTestText] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState('');
  const [activeTab, setActiveTab] = useState<'extracted' | 'raw'>('extracted');

  // 加载包含哪些词组
  const loadPromptSets = async (forceSelectId?: string) => {
    try {
      let data = await promptService.getPromptSets(false);

      // 如果没有任何提示词组，初始化一个 demo提示词组
      if (data.length === 0) {
        setIsLoading(true);
        const defaultSet = await promptService.createPromptSet('demo提示词组', true);
        await promptService.saveFields(defaultSet.id, [
          { name: '甲方名称', prompt: '提取合同中提及的甲方或发包方公司全称', data_type: 'string', sort_order: 0, batch_id: null },
          { name: '合同金额', prompt: '定位合同的总金额数值，通常在报价页或费用条款中', data_type: 'number', sort_order: 1, batch_id: null },
          { name: '生效日期', prompt: '识别合同签署日期或明确说明的生效起始日期', data_type: 'date', sort_order: 2, batch_id: null },
        ]);
        data = [defaultSet];
        toast.success('已自动为您创建默认 demo提示词组');
      }

      setPromptSets(data);
      if (forceSelectId) {
        setSelectedSetId(forceSelectId);
      } else if (!selectedSetId && data.length > 0) {
        setSelectedSetId(data[0].id);
      }
    } catch (error: any) {
      toast.error('加载提示词组失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPromptSets();
  }, []);

  // 当选择的词组改变时，加载对应的字段列表
  useEffect(() => {
    if (!selectedSetId) return;
    const fetchFields = async () => {
      setIsLoading(true);
      try {
        const data = await promptService.getFieldsByPromptSetId(selectedSetId);
        setFields(data);
      } catch (error: any) {
        toast.error('获取字段失败: ' + error.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchFields();
  }, [selectedSetId]);

  const currentSet = promptSets.find(s => s.id === selectedSetId);

  const handleUpdateSetConfig = (key: string, value: any) => {
    if (!selectedSetId) return;
    // 不再直接更新数据库，而是更新本地状态，等点击“保存”时统一创建新版本
    setPromptSets(prev => prev.map(s => s.id === selectedSetId ? { ...s, [key]: value } : s));
    // 去掉 toast.success('配置已更新')，因为只是本地反馈
  };

  // 分组逻辑
  const fieldBatches = fields.reduce((acc, field) => {
    const bid = field.batch_id || 'default';
    if (!acc[bid]) acc[bid] = [];
    acc[bid].push(field);
    return acc;
  }, {} as Record<string, typeof fields>);

  const batchIds = Object.keys(fieldBatches).sort((a, b) => {
    if (a === 'default') return -1;
    if (b === 'default') return 1;
    return a.localeCompare(b);
  });

  const handleAddField = (batchId: string = 'default') => {
    setFields([
      ...fields,
      { name: '', prompt: '', data_type: 'string', sort_order: fields.length, batch_id: batchId === 'default' ? null : batchId }
    ]);
  };

  const handleCreateBatch = () => {
    const newBatchId = `batch_${Date.now()}`;
    handleAddField(newBatchId);
  };

  const handleRemoveField = (fieldIndex: number) => {
    setFields(fields.filter((_, idx) => idx !== fieldIndex));
  };

  const handleUpdateField = (fieldIndex: number, key: string, value: any) => {
    const newFields = [...fields];
    newFields[fieldIndex] = { ...newFields[fieldIndex], [key]: value };
    setFields(newFields);
  };

  const handleSaveFields = async () => {
    if (!selectedSetId || !currentSet) return;

    // 校验：不能有空字段名或空提示词
    const hasEmpty = fields.some(f => !f.name.trim() || !f.prompt.trim());
    if (hasEmpty) {
      toast.error('字段名称和提示词内容不能为空，请检查');
      return;
    }

    setIsSaving(true);
    try {
      // 传递当前的配置 (从本地状态 currentSet 中获取，可能已经被 handleUpdateSetConfig 修改过)
      const { newSet, fields: newFields } = await promptService.saveFields(selectedSetId, fields, {
        chunk_size: currentSet.chunk_size,
        chunk_overlap: currentSet.chunk_overlap,
        extraction_passes: currentSet.extraction_passes,
        separators: currentSet.separators,
        name: currentSet.name,
        system_prompt: currentSet.system_prompt,
        is_default: currentSet.is_default,
      });
      
      // 更新列表：这里采取简单做法，重新加载全部，并选中新生成的这个
      await loadPromptSets(newSet.id);
      
      toast.success(`已保存为新版本 (v${newSet.version || 1})`);
    } catch (error: any) {
      toast.error('保存失败: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSet = () => {
    if (!selectedSetId) return;

    // 如果系统仅剩一个提示词组，不允许删除
    if (promptSets.length === 1) {
      toast.error('系统必须保留至少一个提示词组基础模板。');
      return;
    }

    // 唤起自定义删除弹窗
    setIsDeleting(true);
  };

  const confirmDeleteSet = async () => {
    setIsDeleting(false);

    try {
      setIsLoading(true);
      await promptService.deletePromptSet(selectedSetId);
      toast.success('已清空并删除提示词组');

      const remainData = promptSets.filter(s => s.id !== selectedSetId);
      setPromptSets(remainData);
      setSelectedSetId(remainData[0]?.id || '');
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // 最终合并生成的提示词 (供测试预览和发给后台提取接口)
  const systemPrompt = currentSet?.system_prompt || DEFAULT_SYSTEM_PROMPT;

  const handleRunTest = async () => {
    if (!testText.trim()) {
      toast.error('请先输入要提取的原始文本');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      const res = await fetch('/api/extract/debug', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemPrompt,
          userText: testText
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');

      setTestResult(data);
      toast.success('提取测试完成单位');
    } catch (err: any) {
      setTestError(err.message);
      toast.error('测试失败: ' + err.message);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <Header title="提示词组管理与调试" />
      <main className="flex-1 overflow-y-auto p-8 space-y-8 relative">
        {/* Prompt Set Management Section */}
        <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-8 border-b border-slate-100 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold text-slate-900">提示词组管理</h2>
              <p className="text-slate-500">配置分段策略和手动 LLM 提取分组</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                <div className="space-y-0.5 px-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">当前词组</label>
                  <select
                    value={selectedSetId}
                    onChange={(e) => setSelectedSetId(e.target.value)}
                    disabled={isLoading}
                    className="bg-transparent border-none p-0 focus:ring-0 outline-none text-slate-900 font-bold disabled:opacity-50 text-sm min-w-[120px]"
                  >
                    {promptSets.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (v{s.version || 1})</option>
                    ))}
                  </select>
                </div>
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <div className="space-y-0.5 px-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">分段字符数 (Chunk)</label>
                  <input
                    type="number"
                    value={currentSet?.chunk_size || 2000}
                    onChange={(e) => handleUpdateSetConfig('chunk_size', parseInt(e.target.value))}
                    className="bg-transparent border-none p-0 focus:ring-0 outline-none text-slate-900 font-bold text-sm w-16"
                  />
                </div>
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <div className="space-y-0.5 px-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">重叠 (Overlap)</label>
                  <input
                    type="number"
                    value={currentSet?.chunk_overlap || 200}
                    onChange={(e) => handleUpdateSetConfig('chunk_overlap', parseInt(e.target.value))}
                    className="bg-transparent border-none p-0 focus:ring-0 outline-none text-slate-900 font-bold text-sm w-12"
                  />
                </div>
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <div className="space-y-0.5 px-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">多轮 (Passes)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={currentSet?.extraction_passes || 1}
                    onChange={(e) => handleUpdateSetConfig('extraction_passes', parseInt(e.target.value))}
                    className="bg-transparent border-none p-0 focus:ring-0 outline-none text-slate-900 font-bold text-sm w-10 text-center"
                  />
                </div>
                <div className="w-px h-8 bg-slate-200 mx-1" />
                <button
                  onClick={() => setIsAdvanced(!isAdvanced)}
                  title="配置分段分隔符"
                  className={`p-1.5 rounded-lg transition-colors ${isAdvanced ? 'bg-primary/10 text-primary' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDeleteSet}
                  className="p-3 text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 rounded-xl transition-colors border border-slate-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Link
                  href="/prompts/new"
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 text-white rounded-xl transition-colors font-bold text-sm shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  新建词组
                </Link>
              </div>
            </div>
          </div>

          {isAdvanced && currentSet && (
            <div className="px-8 py-6 bg-slate-50 border-b border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300 space-y-8">
              <div className="max-w-3xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">系统提示词 (SYSTEM PROMPT)</h3>
                  <button 
                    onClick={() => handleUpdateSetConfig('system_prompt', DEFAULT_SYSTEM_PROMPT)}
                    className="text-[10px] font-bold text-primary hover:underline transition-all"
                  >
                    恢复默认模板
                  </button>
                </div>
                <textarea
                  value={currentSet.system_prompt || DEFAULT_SYSTEM_PROMPT}
                  onChange={(e) => handleUpdateSetConfig('system_prompt', e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all leading-relaxed"
                  rows={8}
                  placeholder="请输入提取时的全局系统提示词..."
                />
                <p className="text-[10px] text-slate-400">
                  定义 LLM 的角色、输出格式要求等全局规则。支持 Markdown 格式。
                </p>
              </div>

              <div className="max-w-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">文本分段分隔符 (Recursive Separators)</label>
                  <span className="text-[10px] text-slate-400 italic">JSON 数组格式</span>
                </div>
                <textarea
                  value={JSON.stringify(currentSet.separators || ["\\n\\n", "\\n", "。", ".", " ", ""])}
                  onChange={(e) => {
                    try {
                      const val = JSON.parse(e.target.value);
                      if (Array.isArray(val)) handleUpdateSetConfig('separators', val);
                    } catch (err) { }
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                  rows={2}
                />
                <p className="text-[10px] text-slate-400">
                  按优先级排序。例如：`["\n\n", "\n"]` 会先尝试在段落处切分，如果块仍然太大，则在单行处切分。
                </p>
              </div>
            </div>
          )}

          <div className="p-8">
            {isLoading && !fields.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                <p>正在加载字段列表...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {batchIds.map((batchId, bIdx) => (
                  <div key={batchId} className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-slate-900">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                          {bIdx + 1}
                        </div>
                        <h3 className="font-bold">
                          批次 {bIdx + 1}
                          <span className="ml-2 text-xs font-normal text-slate-400">(同一次 LLM 调用)</span>
                        </h3>
                      </div>
                    </div>

                    <div className="bg-slate-50/50 rounded-2xl p-4 border border-slate-100 space-y-3">
                      <div className="flex gap-4 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <div className="w-1/4">字段名称</div>
                        <div className="flex-1">提取提示 (PROMPT)</div>
                        <div className="w-32">类型</div>
                        <div className="w-12 text-center">操作</div>
                      </div>

                      {fieldBatches[batchId].map((field) => {
                        const originalIdx = fields.findIndex(f => f === field);
                        return (
                          <div key={originalIdx} className="flex gap-3 items-center animate-in fade-in slide-in-from-left-2 duration-200">
                            <input
                              type="text"
                              value={field.name}
                              onChange={(e) => handleUpdateField(originalIdx, 'name', e.target.value)}
                              placeholder="字段名"
                              className="w-1/4 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-shadow"
                            />
                            <input
                              type="text"
                              value={field.prompt}
                              onChange={(e) => handleUpdateField(originalIdx, 'prompt', e.target.value)}
                              placeholder="提取指令..."
                              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-shadow"
                            />
                            <select
                              value={field.data_type}
                              onChange={(e) => handleUpdateField(originalIdx, 'data_type', e.target.value)}
                              className="w-32 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            >
                              <option value="string">String</option>
                              <option value="number">Number</option>
                              <option value="date">Date</option>
                              <option value="boolean">Boolean</option>
                            </select>
                            <button
                              onClick={() => handleRemoveField(originalIdx)}
                              className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}

                      <button
                        onClick={() => handleAddField(batchId === 'default' ? 'default' : batchId)}
                        className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all text-xs font-bold flex items-center justify-center gap-2"
                      >
                        <Plus className="w-3 h-3" />
                        在此组内添加字段
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                  <button
                    onClick={handleCreateBatch}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    新建 LLM 提取组
                  </button>

                  <button
                    onClick={handleSaveFields}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/30 disabled:opacity-50 text-sm"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    保存配置
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Debugging Console Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Input Side */}
          <div className="space-y-8">
            <div className="flex items-center gap-3">
              <Terminal className="w-8 h-8 text-primary p-1.5 bg-primary/10 rounded-lg" />
              <h2 className="text-2xl font-bold text-slate-900">交互式调试控制台</h2>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <FileEdit className="w-5 h-5" />
                    预置提取提示 (合并生成)
                  </label>
                </div>
                <div className="w-full h-48 p-5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-slate-500 text-sm font-mono overflow-y-auto whitespace-pre-wrap leading-relaxed shadow-inner">
                  {systemPrompt}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  原始文本输入
                </label>
                <textarea
                  value={testText}
                  onChange={e => setTestText(e.target.value)}
                  className="w-full h-80 p-5 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-slate-600 resize-none font-mono text-sm leading-loose"
                  placeholder="粘贴OCR识别后的原始文本以进行大模型测试..."
                />
              </div>

              <button
                onClick={handleRunTest}
                disabled={isTesting}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-colors shadow-xl disabled:opacity-50"
              >
                {isTesting ? <Loader2 className="w-6 h-6 animate-spin" /> : <PlayCircle className="w-6 h-6" />}
                {isTesting ? 'AI 大模型提取中...' : '运行提取测试'}
              </button>
            </div>
          </div>

          {/* Result Side */}
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Eye className="w-8 h-8 text-primary p-1.5 bg-primary/10 rounded-lg" />
                <h2 className="text-2xl font-bold text-slate-900">调试结果预览</h2>
              </div>
              {testResult && (
                <div className="flex items-center gap-2 text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  提取成功 ({testResult.latency})
                </div>
              )}
            </div>

            <div className="space-y-6">
              {testError ? (
                <div className="p-5 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm font-medium">
                  <div className="font-bold mb-1">测试异常</div>
                  <div className="whitespace-pre-wrap">{testError}</div>
                </div>
              ) : testResult ? (
                <>
                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex border-b border-slate-100 bg-slate-50/50">
                      <button
                        onClick={() => setActiveTab('extracted')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'extracted' ? 'border-primary text-primary bg-white' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}
                      >
                        解析结果视窗
                      </button>
                      <button
                        onClick={() => setActiveTab('raw')}
                        className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === 'raw' ? 'border-primary text-primary bg-white' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}
                      >
                        原始 JSON (Raw Response)
                      </button>
                    </div>

                    <div className="p-6">
                      {activeTab === 'extracted' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          {Object.entries(testResult.extracted || {}).length === 0 ? (
                            <p className="text-slate-500 text-sm">未能在此文本中提取到相关字段数据。</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {Object.entries(testResult.extracted || {}).map(([key, value]) => (
                                <div key={key} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                                  <p className="text-xs font-bold text-slate-400 tracking-wider break-all">{key}</p>
                                  <p className="text-lg font-bold text-slate-800 break-words">
                                    {value === null ? <span className="text-slate-400 italic font-normal text-sm">未找到 / Null</span> : String(value)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                            <Code className="w-5 h-5 text-primary" />
                            <div>
                              <p className="text-xs text-primary font-bold mb-0.5">消耗追踪 (TOKENS)</p>
                              <p className="text-xs text-slate-600">Prompt: <span className="font-mono">{testResult.usage.prompt_tokens}</span> / Completion: <span className="font-mono">{testResult.usage.completion_tokens}</span></p>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeTab === 'raw' && (
                        <div className="bg-slate-900 rounded-xl p-6 overflow-hidden relative group animate-in fade-in duration-300">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(testResult.raw_response, null, 2));
                              toast.success('已复制到剪贴板');
                            }}
                            className="absolute top-4 right-4 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            复制完整 JSON
                          </button>
                          <pre className="text-xs font-mono text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[500px]">
                            {JSON.stringify(testResult.raw_response, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full min-h-[400px] border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-4 bg-slate-50/50">
                  <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Terminal className="w-8 h-8 opacity-50 text-slate-400" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-500 text-lg mb-1">等待测试运行</p>
                    <p className="text-sm max-w-sm">在左侧输入原始文本并点击&quot;运行&quot;按钮，模型大语言引擎提取结果将实时呈现于此</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 删除确认弹窗 */}
        {isDeleting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsDeleting(false)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-6 text-center space-y-4">
                <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">确定永久删除？</h3>
                <p className="text-slate-500 text-sm">
                  删除提示词组将会永久抹除该组内设定的所有<strong className="text-slate-700">字段与设定</strong>，无法恢复。如果这是唯一的提示词组，删除操作将被阻止。
                </p>
              </div>
              <div className="grid grid-cols-2 bg-slate-50 border-t border-slate-100 divide-x divide-slate-100">
                <button
                  onClick={() => setIsDeleting(false)}
                  className="p-4 text-sm font-bold text-slate-600 hover:bg-slate-100/50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteSet}
                  className="p-4 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                >
                  确定删除
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  );
}
