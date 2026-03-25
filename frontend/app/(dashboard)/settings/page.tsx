'use client';

import { Header } from '@/components/header';
import { Plus, Trash2, CheckCircle2, XCircle, Cpu, Key, Globe, Thermometer, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { modelService, ModelConfig } from '@/lib/services/models';

type ModelRecordWithStatus = ModelConfig & {
    testStatus: 'idle' | 'testing' | 'success' | 'failed';
};

export default function SettingsPage() {
    const [models, setModels] = useState<ModelRecordWithStatus[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newModel, setNewModel] = useState({
        name: '',
        url: '',
        api_key: '',
        temperature: 0.2,
        top_p: 0.8,
    });

    const loadModels = async () => {
        setIsLoading(true);
        try {
            const data = await modelService.getModels();
            // 附加前端状态 testStatus
            const modelsWithStatus = data.map(m => ({ ...m, testStatus: 'idle' as const }));
            setModels(modelsWithStatus);
        } catch (error: any) {
            toast.error('加载模型配置失败: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadModels();
    }, []);

    const handleAddModel = async () => {
        if (!newModel.name.trim() || !newModel.url.trim() || !newModel.api_key.trim()) {
            toast.error('请填写模型名称、URL 和 API Key');
            return;
        }

        try {
            const created = await modelService.createModel({
                ...newModel,
                is_active: models.length === 0, // 如果是第一个模型，默认启用
            });

            setModels([{ ...created, testStatus: 'idle' }, ...models]);
            setNewModel({ name: '', url: '', api_key: '', temperature: 0.2, top_p: 0.8 });
            setIsAdding(false);
            toast.success('模型已添加');
        } catch (error: any) {
            toast.error('添加失败: ' + error.message);
        }
    };

    const handleDeleteModel = async (id: string) => {
        if (!window.confirm('确定要删除此模型配置吗？\n删除后如有正在运行的任务可能会受到影响。')) return;

        try {
            await modelService.deleteModel(id);
            setModels(prev => prev.filter((m) => m.id !== id));
            toast.success('模型已删除');
        } catch (error: any) {
            toast.error('删除失败: ' + error.message);
        }
    };

    const handleSetActive = async (id: string) => {
        try {
            await modelService.setActiveModel(id);
            setModels(prev => prev.map((m) => ({ ...m, is_active: m.id === id })));
            toast.success('已切换生效模型');
        } catch (error: any) {
            toast.error('切换失败: ' + error.message);
        }
    };

    const handleTest = async (model: ModelRecordWithStatus) => {
        setModels(prev => prev.map((m) => (m.id === model.id ? { ...m, testStatus: 'testing' } : m)));

        try {
            // 在这里实现真实的连通性测试：调用 /v1/models 或者发送一段极短的对话模型请求
            // 为了安全，不在前端直接发带 Key 的请求以防跨域，但我们现在是 Next.js，可以快速使用 fetch 直连 OpenAI 兼容接口，或者写个 Server Action
            // 这里为了通用性，直接用 fetch 请求其 v1/models 接口

            // 简单的跨域探测（可能被 CORS 拦截），或者尝试发个请求到其 API 根节点。如果是 OpenAI 格式，/v1/models 通常最轻量。
            const res = await fetch(`${model.url}${model.url.endsWith('/') ? '' : '/'}models`, {
                headers: {
                    Authorization: `Bearer ${model.api_key}`
                }
            });

            if (res.ok) {
                setModels(prev => prev.map((m) => m.id === model.id ? { ...m, testStatus: 'success' } : m));
                toast.success(`「${model.name}」连通性测试成功！`);
            } else {
                setModels(prev => prev.map((m) => m.id === model.id ? { ...m, testStatus: 'failed' } : m));
                toast.error(`「${model.name}」测试失败: 响应状态码 ${res.status}`);
            }
        } catch (error: any) {
            setModels(prev => prev.map((m) => m.id === model.id ? { ...m, testStatus: 'failed' } : m));
            toast.error(`请求异常: ${error.message} \n(注意：部分模型不支持跨域探测，请留意控制台)`);
        }

        // 3秒后重置状态
        setTimeout(() => {
            setModels(prev => prev.map((m) => (m.id === model.id ? { ...m, testStatus: 'idle' } : m)));
        }, 3000);
    };

    return (
        <>
            <Header title="系统设置" />
            <main className="flex-1 overflow-y-auto p-8 space-y-8">
                <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-slate-100 flex flex-wrap items-center justify-between gap-6">
                        <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                <Cpu className="w-6 h-6 text-primary" />
                                模型配置
                            </h2>
                            <p className="text-slate-500 text-sm">配置 OpenAI 兼容的 LLM 模型，全局仅生效 1 个模型</p>
                        </div>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:opacity-90 transition-opacity"
                        >
                            <Plus className="w-4 h-4" />
                            添加模型
                        </button>
                    </div>

                    <div className="divide-y divide-slate-100 min-h-[300px]">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                                <p>正在加载模型配置...</p>
                            </div>
                        ) : models.length > 0 ? (
                            models.map((model) => (
                                <div key={model.id} className={`p-6 flex flex-wrap gap-4 items-start justify-between transition-colors ${model.is_active ? 'bg-primary/5' : 'hover:bg-slate-50'}`}>
                                    <div className="space-y-3 flex-1 min-w-[300px]">
                                        <div className="flex items-center gap-3">
                                            <span className="text-base font-bold text-slate-900">{model.name}</span>
                                            {model.is_active && (
                                                <span className="px-2 py-0.5 bg-primary text-white text-xs font-bold rounded-full shadow-sm shadow-primary/30">当前生效</span>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-600">
                                            <div className="flex items-center gap-2">
                                                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span className="truncate" title={model.url}>{model.url}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Key className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span className="font-mono truncate">
                                                    {model.api_key.substring(0, 8)}...{model.api_key.substring(model.api_key.length - 4)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Thermometer className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span>temperature: {model.temperature} / top_p: {model.top_p}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {/* 连通性测试按钮 */}
                                        <button
                                            onClick={() => handleTest(model)}
                                            disabled={model.testStatus === 'testing'}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${model.testStatus === 'success'
                                                ? 'border-green-200 bg-green-50 text-green-600'
                                                : model.testStatus === 'failed'
                                                    ? 'border-red-200 bg-red-50 text-red-600'
                                                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-primary hover:text-primary'
                                                } disabled:opacity-60`}
                                        >
                                            {model.testStatus === 'testing' ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : model.testStatus === 'success' ? (
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                            ) : model.testStatus === 'failed' ? (
                                                <XCircle className="w-3.5 h-3.5" />
                                            ) : null}
                                            {model.testStatus === 'testing' ? '测试中' : model.testStatus === 'success' ? '连通' : model.testStatus === 'failed' ? '失败' : '测试连通'}
                                        </button>

                                        {/* 切换生效 */}
                                        {!model.is_active && (
                                            <button
                                                onClick={() => handleSetActive(model.id)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-slate-50 text-slate-600 hover:border-primary hover:text-primary transition-all shadow-sm"
                                            >
                                                设为生效
                                            </button>
                                        )}

                                        {/* 删除 */}
                                        <button
                                            onClick={() => handleDeleteModel(model.id)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            title="删除模型"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center">
                                <Cpu className="w-16 h-16 mb-4 opacity-20" />
                                <p className="font-medium text-lg text-slate-500">暂无模型配置</p>
                                <p className="text-sm mt-1">点击右上角「添加模型」开始配置，这是信息提取的核心引擎</p>
                            </div>
                        )}
                    </div>
                </section>

                {/* 添加模型表单 */}
                {isAdding && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">添加新模型引擎</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">模型名称 *</label>
                                <input
                                    type="text"
                                    value={newModel.name}
                                    onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                    placeholder="e.g. GPT-4o, DeepSeek-V3"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">API BASE URL *</label>
                                <input
                                    type="text"
                                    value={newModel.url}
                                    onChange={(e) => setNewModel({ ...newModel, url: e.target.value.trim() })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                                    placeholder="https://api.openai.com/v1"
                                />
                                <p className="text-xs text-slate-400">必须兼容 OpenAI 的 /v1/chat/completions 接口格式</p>
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700">API Key *</label>
                                <input
                                    type="password"
                                    value={newModel.api_key}
                                    onChange={(e) => setNewModel({ ...newModel, api_key: e.target.value.trim() })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono tracking-wider text-lg"
                                    placeholder="sk-..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">Temperature (温度值)</label>
                                <input
                                    type="number"
                                    min="0" max="2" step="0.1"
                                    value={newModel.temperature}
                                    onChange={(e) => setNewModel({ ...newModel, temperature: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                />
                                <p className="text-xs text-slate-400">建议 0.1-0.3，用于保障提取信息的确定性</p>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">Top P</label>
                                <input
                                    type="number"
                                    min="0" max="1" step="0.1"
                                    value={newModel.top_p}
                                    onChange={(e) => setNewModel({ ...newModel, top_p: parseFloat(e.target.value) })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                />
                                <p className="text-xs text-slate-400">通常保持 0.8 / 1.0 即可</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => { setIsAdding(false); setNewModel({ name: '', url: '', api_key: '', temperature: 0.2, top_p: 0.8 }); }}
                                className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAddModel}
                                className="px-5 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 shadow-sm shadow-primary/20 transition-colors"
                            >
                                确认添加
                            </button>
                        </div>
                    </section>
                )}
            </main>
        </>
    );
}
