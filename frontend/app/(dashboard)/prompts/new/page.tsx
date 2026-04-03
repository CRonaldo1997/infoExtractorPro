'use client';

import { Header } from '@/components/header';
import { FileUp, Trash2, Plus, ArrowLeft, Loader2, Save, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { promptService, PromptField, DEFAULT_SYSTEM_PROMPT } from '@/lib/services/prompts';
import Link from 'next/link';

import * as XLSX from 'xlsx';

export default function NewPromptSet() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [chunkSize, setChunkSize] = useState(2000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [separators, setSeparators] = useState<string[]>(["\\n\\n", "\\n", "。", ".", " ", ""]);
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [fields, setFields] = useState<Omit<PromptField, 'id' | 'prompt_set_id' | 'user_id' | 'created_at'>[]>([
    { name: '', prompt: '', data_type: 'string', sort_order: 0, batch_id: null },
    { name: '', prompt: '', data_type: 'number', sort_order: 1, batch_id: null },
    { name: '', prompt: '', data_type: 'date', sort_order: 2, batch_id: null }
  ]);

  const [isSaving, setIsSaving] = useState(false);

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
      {
        name: '',
        prompt: '',
        data_type: 'string',
        sort_order: fields.length,
        batch_id: batchId === 'default' ? null : batchId
      }
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        if (data.length <= 1) {
          toast.error('表格内容为空，请检查文件');
          return;
        }

        // 假设表头为第一行，跳过
        const rows = data.slice(1);
        const newFields: Omit<PromptField, 'id' | 'prompt_set_id' | 'user_id' | 'created_at'>[] = [];

        // 用于映射 Excel 中的批次序号到内部 batch_id
        const batchMap: Record<string, string | null> = {};

        rows.forEach((row, idx) => {
          if (!row[1]) return; // 字段名称不能为空

          const excelBatchIdx = String(row[0] || '1');
          if (!batchMap[excelBatchIdx]) {
            batchMap[excelBatchIdx] = excelBatchIdx === '1' ? null : `batch_excel_${excelBatchIdx}_${Date.now()}`;
          }

          const dataTypeRaw = String(row[3] || 'String').toLowerCase();
          let dataType: 'string' | 'number' | 'date' | 'boolean' = 'string';
          if (dataTypeRaw.includes('number')) dataType = 'number';
          else if (dataTypeRaw.includes('date')) dataType = 'date';
          else if (dataTypeRaw.includes('bool')) dataType = 'boolean';

          newFields.push({
            name: row[1],
            prompt: row[2] || '',
            data_type: dataType,
            sort_order: idx,
            batch_id: batchMap[excelBatchIdx]
          });
        });

        if (newFields.length > 0) {
          setFields(newFields);
          toast.success(`成功从 Excel 导入 ${newFields.length} 个字段`);
        } else {
          toast.error('未识别到有效字段，请确保格式正确（批次序号, 字段名称, 提取指令, 类型）');
        }
      } catch (err) {
        toast.error('文件解析失败，请确保是标准的 .xlsx 或 .xls 文件');
      }
    };
    reader.readAsBinaryString(file);
    // 重置 input 以便同一个文件可以再次触发
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const templateData = [
      ['批次序号', '字段名称', '提取指令 (PROMPT)', '类型'],
      ['1', '甲方名称', '提取合同中的甲方名称', 'String'],
      ['1', '乙方名称', '提取合同中的乙方名称', 'String'],
      ['2', '签署地点', '提取合同签署地点', 'String'],
      ['2', '合同金额', '合同金额是多少', 'Number']
    ];
    const ws = XLSX.utils.aoa_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'InfoEx_Template.xlsx');
  };

  const handleCreatePromptSet = async () => {
    if (!name.trim()) {
      toast.error('请填写提示词组名称');
      return;
    }

    const validFields = fields.filter(f => f.name.trim() || f.prompt.trim());
    const hasIncomplete = validFields.some(f => !f.name.trim() || !f.prompt.trim());

    if (hasIncomplete) {
      toast.error('已填写的字段片段中，名称和提示词内容必须完整，请检查并补全（或删除整行）');
      return;
    }

    setIsSaving(true);
    try {
      // 1. 创建 Prompt Set (带分段配置)
      const newSet = await promptService.createPromptSet(name.trim(), false, {
        system_prompt: systemPrompt,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        separators: separators
      });
      // 2. 批量保存关联字段
      if (validFields.length > 0) {
        const fieldsToSave = validFields.map((f, i) => ({ ...f, sort_order: i }));
        await promptService.saveFields(newSet.id, fieldsToSave);
      }

      toast.success('自定义提取模板创建成功！');
      router.push('/prompts');
    } catch (error: any) {
      toast.error('创建失败: ' + error.message);
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header title="新建提示词组" />
      <main className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto space-y-8 w-full pb-32">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">新建提取模板</h1>
            <p className="text-slate-500">定义您的提取规则和字段逻辑，以支持高精度的文档信息自动化提取。</p>
          </div>
          <Link href="/prompts" className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-slate-800 transition-colors bg-slate-100 px-4 py-2 rounded-xl">
            <ArrowLeft className="w-4 h-4" />
            返回列表
          </Link>
        </div>

        {/* 顶部布局：基本信息 & 导入 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-2 h-6 bg-primary rounded-full"></div>
              <h2 className="text-xl font-bold text-slate-900">基本信息</h2>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-1">
                  提示词组名称
                  <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="例如：法律合同关键条款提取器"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-base focus:ring-4 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-slate-300 font-semibold text-slate-800"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">分段字符数</label>
                  <input
                    type="number"
                    value={chunkSize}
                    onChange={e => setChunkSize(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">重叠字符数</label>
                  <input
                    type="number"
                    value={chunkOverlap}
                    onChange={e => setChunkOverlap(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 高级分段设置 */}
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAdvanced(!isAdvanced)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isAdvanced
                    ? 'bg-primary/10 text-primary'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                    }`}
                >
                  <Settings2 className="w-4 h-4" />
                  {isAdvanced ? '收起高级分段设置' : '配置系统提示词与分段符 (Advanced)'}
                </button>
                {isAdvanced && (
                  <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 border-t border-slate-50 pt-4 text-left">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">系统提示词 (SYSTEM PROMPT)</label>
                        <button 
                          type="button"
                          onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          重置为默认
                        </button>
                      </div>
                      <textarea
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        rows={6}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:border-primary leading-relaxed"
                        placeholder="请输入该词组的全局系统提示词..."
                      />
                    </div>

                     <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">分割符 (JSON 数组格式)</label>
                    <textarea
                      value={JSON.stringify(separators)}
                      onChange={(e) => {
                        try {
                          const val = JSON.parse(e.target.value);
                          if (Array.isArray(val)) setSeparators(val);
                        } catch (err) {
                          // 仅在格式正确时更新
                        }
                      }}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:border-blue-500"
                      placeholder='["\n\n", "\n", " ", ""]'
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      提示: 按照优先级排列。例如 `["\n\n", "\n"]` 会优先寻找段落，其次是换行。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                <h2 className="text-xl font-bold text-slate-900">导入 Excel</h2>
              </div>
              <button
                onClick={downloadTemplate}
                className="text-xs font-bold text-green-600 hover:text-green-700 bg-green-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <FileUp className="w-3.5 h-3.5" />
                下载标准模板
              </button>
            </div>

            <div className="flex-1 relative group">
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="h-full border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 group-hover:bg-slate-50 group-hover:border-green-500/50 transition-all">
                <div className="p-4 bg-green-100 text-green-600 rounded-2xl group-hover:scale-110 transition-transform">
                  <FileUp className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-slate-700">点击或拖拽文件上传</p>
                  <p className="text-xs text-slate-400 mt-1">支持 .xlsx, .xls 格式</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* 字段分组手动配置 */}
        <section className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
          <div className="p-8 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-6 bg-indigo-500 rounded-full"></div>
              <h2 className="text-xl font-bold text-slate-900">字段详细设定</h2>
            </div>
            <button
              onClick={handleCreateBatch}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white font-bold rounded-2xl hover:bg-indigo-600 transition-all shadow-lg shadow-indigo-200"
            >
              <Plus className="w-5 h-5" />
              新建提取批次
            </button>
          </div>

          <div className="p-8 space-y-10">
            {batchIds.map((batchId, bIdx) => (
              <div key={batchId} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between border-l-4 border-indigo-400 pl-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-indigo-400 opacity-30">#{bIdx + 1}</span>
                    <h3 className="text-lg font-bold text-slate-800">
                      批次 {bIdx + 1}
                      <span className="ml-3 text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">
                        一次 LLM 请求内完成
                      </span>
                    </h3>
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 space-y-4">
                  <div className="grid grid-cols-[1fr_2fr_120px_60px] gap-4 px-4 mb-2">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">字段名称</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">提取指令 (PROMPT)</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">数据类型</div>
                    <div className="text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">操作</div>
                  </div>

                  {fieldBatches[batchId].map((field) => {
                    const originalIdx = fields.findIndex(f => f === field);
                    return (
                      <div key={originalIdx} className="grid grid-cols-[1fr_2fr_120px_60px] gap-4 items-center group">
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => handleUpdateField(originalIdx, 'name', e.target.value)}
                          placeholder="例如：发票号"
                          className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                        />
                        <input
                          type="text"
                          value={field.prompt}
                          onChange={(e) => handleUpdateField(originalIdx, 'prompt', e.target.value)}
                          placeholder="如何从文本中识别此字段..."
                          className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-600 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-400 outline-none transition-all"
                        />
                        <select
                          value={field.data_type}
                          onChange={(e) => handleUpdateField(originalIdx, 'data_type', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-2xl px-3 py-3.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 cursor-pointer"
                        >
                          <option value="string">String</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="boolean">Boolean</option>
                        </select>
                        <div className="flex justify-center">
                          <button
                            onClick={() => handleRemoveField(originalIdx)}
                            className="p-3 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => handleAddField(batchId === 'default' ? 'default' : batchId)}
                    className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-500 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all font-bold text-sm flex items-center justify-center gap-2 group"
                  >
                    <Plus className="w-4 h-4 group-hover:scale-125 transition-transform" />
                    在此批次中添加字段
                  </button>
                </div>
              </div>
            ))}

            {fields.length === 0 && (
              <div className="py-20 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-slate-300">
                  <Plus className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-slate-500 font-bold">暂无字段配置</p>
                  <p className="text-sm text-slate-400 mt-1">请尝试导入 Excel 或点击下方按钮手动添加</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 底部悬浮操作栏 */}
      <div className="fixed bottom-0 left-[260px] right-0 bg-white/90 backdrop-blur-xl border-t border-slate-200 p-6 px-12 flex items-center justify-between z-10 shadow-[0_-20px_50px_-15px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-4 text-slate-400 text-sm font-medium">
          已配置 {fields.length} 个字段，分布在 {batchIds.length} 个提取批次中
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/prompts')}
            disabled={isSaving}
            className="px-8 py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
          >
            取消
          </button>
          <button
            onClick={handleCreatePromptSet}
            disabled={isSaving}
            className="px-12 py-4 bg-primary text-white font-black rounded-2xl hover:bg-primary/90 transition-all shadow-xl shadow-primary/40 flex items-center gap-3 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <Save className="w-6 h-6" />}
            {isSaving ? '正在生成模板...' : '完成并创建模板'}
          </button>
        </div>
      </div>
    </>
  );
}
