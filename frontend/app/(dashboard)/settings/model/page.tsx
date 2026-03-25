'use client';

import { Header } from '@/components/header';
import { Settings, Link as LinkIcon, Globe, Eye, Sliders, Zap, PlusCircle, BrainCircuit, Cpu, Bot, Settings2, Edit, Trash2 } from 'lucide-react';

export default function ModelSettings() {
  return (
    <>
      <Header title="模型配置" />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Model List */}
        <aside className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-6 border-b border-slate-200 bg-white">
            <button className="w-full py-2.5 px-4 bg-primary text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-sm">
              <PlusCircle className="w-5 h-5" />
              添加新模型
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            <p className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">当前模型库</p>
            
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-primary/20 shadow-sm cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <BrainCircuit className="w-5 h-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-900">GPT-4o</span>
                <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> 运行中
                </span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                <button className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-primary/5">
                <Cpu className="w-5 h-5 text-slate-500 group-hover:text-primary" />
              </div>
              <div className="flex flex-col text-slate-600 group-hover:text-slate-900 transition-colors">
                <span className="text-sm font-medium">Claude 3.5 Sonnet</span>
                <span className="text-[10px] text-slate-400">上次使用: 2小时前</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                <button className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-primary/5">
                <Bot className="w-5 h-5 text-slate-500 group-hover:text-primary" />
              </div>
              <div className="flex flex-col text-slate-600 group-hover:text-slate-900 transition-colors">
                <span className="text-sm font-medium">Llama 3-70B</span>
                <span className="text-[10px] text-slate-400">本地部署</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                <button className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all cursor-pointer group">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center group-hover:bg-primary/5">
                <Settings2 className="w-5 h-5 text-slate-500 group-hover:text-primary" />
              </div>
              <div className="flex flex-col text-slate-600 group-hover:text-slate-900 transition-colors">
                <span className="text-sm font-medium">Gemini Pro</span>
                <span className="text-[10px] text-slate-400">已停用</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                <button className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"><Edit className="w-4 h-4" /></button>
                <button className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
          <div className="p-4 bg-white border-t border-slate-200 text-center">
            <p className="text-[11px] text-slate-400">版本 v2.4.1 © 2024 AI Extraction</p>
          </div>
        </aside>

        {/* Main Content: Model Detail Form */}
        <main className="flex-1 overflow-y-auto bg-white p-12">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="mb-10">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Settings className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-widest">Model Settings</span>
              </div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">模型详细配置</h1>
              <p className="mt-2 text-slate-500">配置用于数据提取任务的 AI 模型参数。确保 API 凭据有效以维持系统提取稳定性。</p>
            </div>

            {/* Form Section */}
            <div className="space-y-10">
              {/* Group 1: Connection */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                  <LinkIcon className="w-5 h-5 text-slate-400" />
                  <h3 className="text-lg font-bold text-slate-800">连接信息</h3>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700">模型名称</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-slate-300"
                      placeholder="例如：GPT-4o 或生产环境提取模型"
                      defaultValue="GPT-4o"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700">API 端点 (URL)</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-slate-300"
                        placeholder="https://"
                        defaultValue="https://api.openai.com/v1/chat/completions"
                      />
                      <Globe className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-700">API 密钥</label>
                    <div className="relative">
                      <input
                        type="password"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all placeholder:text-slate-300"
                        placeholder="sk-..."
                        defaultValue="sk-proj-************************************"
                      />
                      <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors">
                        <Eye className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400">密钥将加密存储，不会在日志中明文显示。</p>
                  </div>
                </div>
              </section>

              {/* Group 2: Parameters */}
              <section className="space-y-6 pt-2">
                <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                  <Sliders className="w-5 h-5 text-slate-400" />
                  <h3 className="text-lg font-bold text-slate-800">推理参数</h3>
                </div>
                <div className="grid grid-cols-2 gap-10">
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">温度 (Temperature)</label>
                      <span className="px-2 py-0.5 rounded bg-primary/5 text-primary text-xs font-bold">0.2</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      defaultValue="0.2"
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                      <span>精确 (0)</span>
                      <span>默认</span>
                      <span>创意 (1)</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-semibold text-slate-700">Top_P</label>
                      <span className="px-2 py-0.5 rounded bg-primary/5 text-primary text-xs font-bold">0.8</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      defaultValue="0.8"
                      className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                      <span>保守 (0)</span>
                      <span>默认</span>
                      <span>多样 (1)</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Footer Actions */}
              <div className="pt-10 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all flex items-center gap-2">
                    <Zap className="w-5 h-5" />
                    连通性测试
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-medium text-slate-500">连接成功 (响应: 142ms)</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button className="px-6 py-2.5 rounded-xl text-slate-500 font-semibold text-sm hover:text-slate-800 transition-all">取消</button>
                  <button className="px-10 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all transform hover:-translate-y-0.5 active:translate-y-0">
                    保存配置
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
