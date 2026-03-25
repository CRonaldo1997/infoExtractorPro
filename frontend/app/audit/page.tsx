'use client';

import { Header } from '@/components/header';
import { PlayCircle, Trash2, Download, Folder, ChevronDown, FileText, FileImage, FileCode2, UploadCloud, ChevronLeft, ChevronRight, Info, Focus, PanelLeft, PanelRight, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function Audit() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [hoveredField, setHoveredField] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [fields, setFields] = useState([
    { id: 'f1', name: '公司名称', value: '环球贸易科技集团', source: '第 1 页原文', isLong: false },
    { id: 'f2', name: '报告日期', value: '2023年12月31日', source: '第 1 页原文', isLong: false },
    { id: 'f3', name: '年度总收入', value: '12450000.00', source: '第 2 页原文', isLong: false },
    { id: 'f4', name: '主要风险因素', value: '由于全球供应链中断以及原材料成本上升，预计2024年第一季度运营利润可能面临下行压力...', source: '第 4 页原文', isLong: true },
  ]);

  const handleFieldChange = (id: string, newValue: string) => {
    setFields(fields.map(f => f.id === id ? { ...f, value: newValue } : f));
  };

  const handleSave = () => {
    setIsSaving(true);
    // Simulate API call
    setTimeout(() => {
      setIsSaving(false);
      toast.success('提取结果已保存并确认无误');
    }, 800);
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background-light">
      <Header title="任务审核" backLink="/" searchPlaceholder="在当前文件中检索关键字..." />
      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar: File Tree */}
        <aside className={`border-r border-slate-200 bg-white flex flex-col shrink-0 py-2 transition-all duration-300 ease-in-out ${leftOpen ? 'w-64' : 'w-0 opacity-0 overflow-hidden border-none'}`}>
          <div className="p-4 flex flex-col gap-1 overflow-y-auto min-w-[256px]">
            <div className="flex flex-col gap-2 mb-6 px-2">
              <div className="relative mb-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 px-1">提示词组选择</label>
                <div className="relative flex items-center">
                  <select className="w-full appearance-none bg-slate-100 border-none rounded-lg py-2 pl-3 pr-10 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-primary/20 cursor-pointer">
                    <option>合同信息抽取</option>
                    <option>财务报表分析</option>
                    <option>合规性检查</option>
                  </select>
                  <ChevronDown className="absolute right-3 pointer-events-none text-slate-400 w-4 h-4" />
                </div>
              </div>
              <button className="flex items-center justify-center gap-2 bg-primary text-white py-2.5 px-4 rounded-lg font-bold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/10">
                <PlayCircle className="w-5 h-5" />
                开始提取
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-600 py-2.5 px-4 rounded-lg font-bold text-sm hover:bg-red-50 hover:text-red-600 transition-all border border-slate-200">
                <Trash2 className="w-5 h-5" />
                删除文件
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-100 text-slate-600 py-2.5 px-4 rounded-lg font-bold text-sm hover:bg-slate-200 transition-all border border-slate-200">
                <Download className="w-5 h-5" />
                导出结果
              </button>
            </div>

            <div className="flex items-center gap-2 mb-4 px-2">
              <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary/20 w-4 h-4 cursor-pointer" />
              <Folder className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">TASK-8291-01</h3>
            </div>

            <div className="group">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary/10 text-primary font-semibold">
                <div className="flex items-center gap-3">
                  <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary/20 w-4 h-4 cursor-pointer" />
                  <span className="text-sm">报告材料</span>
                </div>
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>

            <div className="ml-4 border-l border-slate-100 flex flex-col gap-1 mt-1">
              {[
                { name: '财务报表.xlsx', icon: FileCode2 },
                { name: '发票扫描件_001.jpg', icon: FileImage },
                { name: '合同协议_正式版.docx', icon: FileText },
                { name: '2023年度审计报告.pdf', icon: FileText },
                { name: '内部合规指南_v2.docx', icon: FileText },
                { name: 'Q4市场调研分析.pptx', icon: FileText },
                { name: '供应商资质说明.pdf', icon: FileText },
                { name: '知识产权声明.docx', icon: FileText },
              ].map((file, i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-2 text-slate-600 hover:bg-slate-50 rounded-r-lg text-sm cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-primary focus:ring-primary/20 w-4 h-4 cursor-pointer" />
                  <span>{file.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto p-4 border-t border-slate-100 min-w-[256px]">
            <button className="w-full flex items-center justify-center gap-2 bg-primary text-white py-2 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all">
              <UploadCloud className="w-5 h-5" />
              上传新文件
            </button>
          </div>
        </aside>

        {/* Center Column: File Preview */}
        <section className="flex-1 flex flex-col bg-slate-50 min-w-0 py-2 relative">
          {/* Breadcrumbs & Document Toolbar */}
          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setLeftOpen(!leftOpen)} 
                className={`p-2 rounded-lg transition-colors ${leftOpen ? 'bg-slate-100 text-slate-600' : 'hover:bg-slate-100 text-slate-400'}`}
                title="切换左侧边栏"
              >
                <PanelLeft className="w-5 h-5" />
              </button>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              <div className="flex items-center gap-3">
                <button className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-primary">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <span className="text-slate-900 font-semibold text-sm">2023年度审计报告.pdf</span>
                <button className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-400 hover:text-primary">
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400">文件 2 / 8</span>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              <button 
                onClick={() => setRightOpen(!rightOpen)} 
                className={`p-2 rounded-lg transition-colors ${rightOpen ? 'bg-slate-100 text-slate-600' : 'hover:bg-slate-100 text-slate-400'}`}
                title="切换右侧边栏"
              >
                <PanelRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* PDF Preview Area */}
          <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center gap-8">
            <div className="w-[600px] h-[848px] bg-white shadow-xl border border-slate-200 rounded-sm relative p-12 flex flex-col gap-6 transition-all duration-300">
              <div className="flex justify-between border-b-2 border-primary/20 pb-4">
                <div className="h-10 w-24 bg-slate-100 rounded-sm"></div>
                <div className="text-right">
                  <div className="h-4 w-32 bg-slate-100 rounded-sm mb-2"></div>
                  <div className="h-3 w-20 bg-slate-50 rounded-sm ml-auto"></div>
                </div>
              </div>
              <div className="space-y-4 py-4 relative">
                <div className="h-8 w-1/2 bg-slate-200 rounded-sm mb-8"></div>
                
                {/* Mock Highlighted Area 1 */}
                <div className={`relative p-1 -mx-1 rounded transition-colors ${hoveredField === 'f1' ? 'bg-primary/20 ring-2 ring-primary' : ''}`}>
                  <div className="h-4 w-full bg-slate-100 rounded-sm"></div>
                </div>
                
                <div className="h-4 w-full bg-slate-100 rounded-sm"></div>
                
                {/* Mock Highlighted Area 2 */}
                <div className={`relative p-1 -mx-1 rounded transition-colors ${hoveredField === 'f2' ? 'bg-primary/20 ring-2 ring-primary' : ''}`}>
                  <div className="h-4 w-3/4 bg-slate-100 rounded-sm"></div>
                </div>
                
                <div className="h-4 w-full bg-slate-100 rounded-sm"></div>
                
                {/* Mock Highlighted Area 3 */}
                <div className={`h-32 w-full bg-slate-50 rounded-lg flex items-center justify-center border-2 border-dashed transition-colors ${hoveredField === 'f3' ? 'border-primary bg-primary/5' : 'border-slate-200'}`}>
                  <FileText className={`w-10 h-10 ${hoveredField === 'f3' ? 'text-primary/40' : 'text-slate-300'}`} />
                </div>
                
                <div className="h-4 w-full bg-slate-100 rounded-sm"></div>
                
                {/* Mock Highlighted Area 4 */}
                <div className={`relative p-1 -mx-1 rounded transition-colors ${hoveredField === 'f4' ? 'bg-primary/20 ring-2 ring-primary' : ''}`}>
                  <div className="h-4 w-5/6 bg-slate-100 rounded-sm"></div>
                </div>
              </div>
              <div className="mt-auto pt-8 border-t border-slate-100 flex justify-between">
                <div className="h-3 w-16 bg-slate-50 rounded-sm"></div>
                <div className="h-3 w-8 bg-slate-50 rounded-sm"></div>
              </div>
              
              {hoveredField && (
                <div className="absolute top-24 right-4 bg-primary text-white text-[10px] px-2 py-1 rounded shadow-md font-bold animate-in fade-in zoom-in duration-200">
                  高亮溯源定位
                </div>
              )}
            </div>
          </div>

          {/* Pagination Footer */}
          <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-center gap-6 shrink-0">
            <button className="flex items-center gap-1 text-slate-400 hover:text-primary transition-colors disabled:opacity-30" disabled>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm font-medium">上一页</span>
            </button>
            <div className="flex items-center gap-2">
              <input type="text" defaultValue="1" className="w-10 h-8 border border-slate-200 bg-slate-50 text-center text-sm rounded-lg focus:ring-primary focus:border-primary outline-none" />
              <span className="text-slate-400 text-sm">/ 12</span>
            </div>
            <button className="flex items-center gap-1 text-slate-600 hover:text-primary transition-colors">
              <span className="text-sm font-medium">下一页</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Right Sidebar: Extraction Results */}
        <aside className={`border-l border-slate-200 bg-white flex flex-col shrink-0 py-2 transition-all duration-300 ease-in-out ${rightOpen ? 'w-80' : 'w-0 opacity-0 overflow-hidden border-none'}`}>
          <div className="px-4 py-3 border-b border-slate-100 min-w-[320px] flex items-center justify-between">
            <h3 className="font-bold text-slate-800">提取结果</h3>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold">已完成</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 min-w-[320px]">
            {fields.map((field) => (
              <div 
                key={field.id}
                className={`p-3 rounded-xl border transition-all group ${hoveredField === field.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-200 bg-slate-50/50 hover:border-primary/30'}`}
                onMouseEnter={() => setHoveredField(field.id)}
                onMouseLeave={() => setHoveredField(null)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 ${hoveredField === field.id ? 'text-primary' : 'text-slate-500'}`}>
                    {field.name}
                    <Info className="w-3.5 h-3.5 cursor-help opacity-50 hover:opacity-100 transition-opacity" />
                  </span>
                  <button className={`p-1 transition-opacity ${hoveredField === field.id ? 'opacity-100 text-primary' : 'opacity-0 group-hover:opacity-100 text-slate-400 hover:text-primary'}`}>
                    <Focus className="w-4 h-4" />
                  </button>
                </div>
                
                {field.isLong ? (
                  <textarea
                    value={field.value}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    className="w-full text-sm font-medium text-slate-700 bg-transparent border border-transparent hover:border-slate-300 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 rounded-md p-1.5 -ml-1.5 outline-none transition-all resize-none"
                    rows={3}
                  />
                ) : (
                  <input
                    type="text"
                    value={field.value}
                    onChange={(e) => handleFieldChange(field.id, e.target.value)}
                    className="w-full text-sm font-bold text-slate-900 bg-transparent border border-transparent hover:border-slate-300 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 rounded-md p-1.5 -ml-1.5 outline-none transition-all"
                  />
                )}
                
                <div className={`mt-2 pt-2 border-t flex items-center gap-1.5 ${hoveredField === field.id ? 'border-primary/10' : 'border-slate-200'}`}>
                  <FileText className={`w-3.5 h-3.5 ${hoveredField === field.id ? 'text-primary/60' : 'text-slate-400'}`} />
                  <span className={`text-[10px] font-medium ${hoveredField === field.id ? 'text-primary/60' : 'text-slate-400'}`}>来自{field.source}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-slate-100 min-w-[320px] bg-slate-50/50">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl font-bold text-sm shadow-md hover:bg-slate-800 transition-all disabled:opacity-70"
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  保存修改并确认
                </>
              )}
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
