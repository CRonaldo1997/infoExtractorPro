'use client';

import { Header } from '@/components/header';
import { Plus, Trash2, CheckCircle2, XCircle, Cpu, Key, Globe, Thermometer, Loader2, Zap, BrainCircuit, Bot, Settings2 } from 'lucide-react';
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
    
    const [newModel, setNewModel] = useState<Partial<ModelConfig>>({
        name: '',
        model_id: '',
        provider: 'openai',
        url: 'https://api.openai.com/v1',
        api_key: '',
        temperature: 0.2,
        top_p: 0.8,
    });

    const loadModels = async () => {
        setIsLoading(true);
        try {
            const data = await modelService.getModels();
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

    const handleProviderChange = (provider: string) => {
        let url = newModel.url;
        let modelId = newModel.model_id;
        let apiKey = newModel.api_key;

        if (provider === 'ollama') {
            url = 'http://localhost:11434/v1';
            modelId = 'qwen2.5:7b';
            apiKey = 'ollama';
        } else if (provider === 'openai') {
            url = 'https://api.openai.com/v1';
            modelId = 'gpt-4o';
        }

        setNewModel({ ...newModel, provider, url, model_id: modelId, api_key: apiKey });
    };

    const handleAddModel = async () => {
        if (!newModel.name?.trim() || !newModel.model_id?.trim() || !newModel.url?.trim()) {
            toast.error('请填写模型名称、模型标识符和 URL');
            return;
        }

        try {
            const created = await modelService.createModel({
                ...newModel,
                is_active: models.length === 0,
            } as any);

            setModels([{ ...created, testStatus: 'idle' }, ...models]);
            setNewModel({ name: '', model_id: '', provider: 'openai', url: 'https://api.openai.com/v1', api_key: '', temperature: 0.2, top_p: 0.8 });
            setIsAdding(false);
            toast.success('模型已添加');
        } catch (error: any) {
            toast.error('添加失败: ' + error.message + '\n提示：请确保已运行数据库更新 SQL。');
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
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/extract/test-connection`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: model.url,
                    api_key: model.api_key,
                    model_name: model.model_id || model.name,
                    temperature: model.temperature,
                    top_p: model.top_p
                })
            });

            const data = await res.json();
            if (data.status === 'success') {
                setModels(prev => prev.map((m) => m.id === model.id ? { ...m, testStatus: 'success' } : m));
                toast.success(`「${model.name}」连通性测试成功！延迟: ${data.latency_ms}ms`);
            } else {
                setModels(prev => prev.map((m) => m.id === model.id ? { ...m, testStatus: 'failed' } : m));
                toast.error(`「${model.name}」测试失败: ${data.message}`);
            }
        } catch (error: any) {
            setModels(prev => prev.map((m) => m.id === model.id ? { ...m, testStatus: 'failed' } : m));
            toast.error(`请求异常: ${error.message}`);
        }

        setTimeout(() => {
            setModels(prev => prev.map((m) => (m.id === model.id ? { ...m, testStatus: 'idle' } : m)));
        }, 5000);
    };

    const getProviderIcon = (provider?: string) => {
        switch (provider) {
            case 'ollama': return <Cpu className="w-5 h-5 text-amber-500" />;
            case 'openai': return <BrainCircuit className="w-5 h-5 text-primary" />;
            case 'deepseek': return <Zap className="w-5 h-5 text-blue-500" />;
            default: return <Bot className="w-5 h-5 text-slate-400" />;
        }
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
                            <p className="text-slate-500 text-sm">配置支持 OpenAI/Ollama 协议的 LLM 模型，系统仅有一个激活模型生效</p>
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
                                            <div className="p-1.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                                                {getProviderIcon(model.provider)}
                                            </div>
                                            <span className="text-base font-bold text-slate-900">{model.name}</span>
                                            <span className="text-xs font-mono px-2 py-0.5 bg-slate-100 rounded text-slate-500">{model.model_id || 'Legacy'}</span>
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
                                                    {(model.api_key || '').substring(0, 8)}...{(model.api_key || '').substring((model.api_key || '').length - 4)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Thermometer className="w-4 h-4 text-slate-400 shrink-0" />
                                                <span>temperature: {model.temperature} / top_p: {model.top_p}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
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

                                        {!model.is_active && (
                                            <button
                                                onClick={() => handleSetActive(model.id)}
                                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-slate-50 text-slate-600 hover:border-primary hover:text-primary transition-all shadow-sm"
                                            >
                                                设为生效
                                            </button>
                                        )}

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
                                <p className="text-sm mt-1">点击右上角「添加模型」开始配置</p>
                            </div>
                        )}
                    </div>
                </section>

                {isAdding && (
                    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <h3 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-4">添加新模型引擎</h3>
                        
                        {/* 服务商选择 */}
                        <div className="space-y-3">
                            <label className="text-sm font-bold text-slate-700">AI 服务商</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {[
                                    { id: 'openai', name: 'OpenAI (云端)', icon: <BrainCircuit className="w-4 h-4" /> },
                                    { id: 'ollama', name: 'Ollama (本地)', icon: <Cpu className="w-4 h-4" /> },
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => handleProviderChange(p.id)}
                                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${
                                            newModel.provider === p.id 
                                                ? 'border-primary bg-primary/5 text-primary' 
                                                : 'border-slate-100 hover:border-slate-200 text-slate-500'
                                        }`}
                                    >
                                        {p.icon}
                                        <span className="text-xs font-bold">{p.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">模型名称 (显示用) *</label>
                                <input
                                    type="text"
                                    value={newModel.name}
                                    onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                    placeholder="e.g. 我的本地 Qwen"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-700">模型标识符 (Model ID) *</label>
                                <input
                                    type="text"
                                    value={newModel.model_id}
                                    onChange={(e) => setNewModel({ ...newModel, model_id: e.target.value.trim() })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                                    placeholder={newModel.provider === 'ollama' ? 'qwen2.5:7b' : 'gpt-4o'}
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700">API BASE URL *</label>
                                <input
                                    type="text"
                                    value={newModel.url}
                                    onChange={(e) => setNewModel({ ...newModel, url: e.target.value.trim() })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                                    placeholder="https://api.openai.com/v1"
                                />
                                {newModel.provider === 'ollama' && (
                                    <p className="text-xs text-amber-600 font-medium">注意：Ollama 的 OpenAI 兼容地址通常是 http://localhost:11434/v1</p>
                                )}
                            </div>
                            <div className="space-y-1.5 md:col-span-2">
                                <label className="text-sm font-semibold text-slate-700">API Key {newModel.provider !== 'ollama' && '*'}</label>
                                <input
                                    type="password"
                                    value={newModel.api_key}
                                    onChange={(e) => setNewModel({ ...newModel, api_key: e.target.value.trim() })}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono"
                                    placeholder={newModel.provider === 'ollama' ? '可随便填，如 ollama' : 'sk-...'}
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
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                            <button
                                onClick={() => { setIsAdding(false); setNewModel({ name: '', model_id: '', provider: 'openai', url: 'https://api.openai.com/v1', api_key: '', temperature: 0.2, top_p: 0.8 }); }}
                                className="px-6 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleAddModel}
                                className="px-8 py-2.5 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all transform hover:-translate-y-0.5 active:translate-y-0"
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
