'use client';

import { Header } from '@/components/header';
import { Settings, Link as LinkIcon, Globe, Eye, Sliders, Zap, PlusCircle, BrainCircuit, Cpu, Bot, Settings2, Edit, Trash2, CheckCircle2, AlertCircle, Loader2, Save, X, EyeOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { modelService, ModelConfig } from '@/lib/services/models';
import { toast } from 'sonner';

export default function ModelSettings() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<ModelConfig>>({
    name: '',
    model_id: '',
    provider: 'openai',
    url: '',
    api_key: '',
    temperature: 0.2,
    top_p: 0.8,
    is_active: false
  });

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    setLoading(true);
    try {
      const data = await modelService.getModels();
      setModels(data);
      if (data.length > 0 && !selectedModel) {
        handleSelectModel(data.find(m => m.is_active) || data[0]);
      }
    } catch (error: any) {
      toast.error('加载模型失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectModel = (model: ModelConfig) => {
    setSelectedModel(model);
    setFormData(model);
    setIsEditing(false);
  };

  const handleAddNew = () => {
    setSelectedModel(null);
    setFormData({
      name: '新模型',
      model_id: 'gpt-4o',
      provider: 'openai',
      url: 'https://api.openai.com/v1',
      api_key: '',
      temperature: 0.2,
      top_p: 0.8,
      is_active: models.length === 0
    });
    setIsEditing(true);
  };

  const handleProviderChange = (provider: string) => {
    let url = formData.url;
    let modelId = formData.model_id;
    let apiKey = formData.api_key;

    if (provider === 'ollama') {
      url = 'http://localhost:11434/v1';
      modelId = 'qwen2.5:7b';
      apiKey = 'ollama'; // Ollama doesn't need key, but DB might require it
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1';
      modelId = 'gpt-4o';
    }

    setFormData({ ...formData, provider, url, model_id: modelId, api_key: apiKey });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.model_id || !formData.url) {
      toast.error('请填写完整必要项');
      return;
    }

    setSaving(true);
    try {
      if (selectedModel) {
        const updated = await modelService.updateModel(selectedModel.id, formData);
        toast.success('配置已保存');
        await loadModels();
        setSelectedModel(updated);
      } else {
        const created = await modelService.createModel(formData as any);
        toast.success('模型已添加');
        await loadModels();
        setSelectedModel(created);
      }
      setIsEditing(false);
    } catch (error: any) {
      toast.error('保存失败: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除此模型配置吗？')) return;
    try {
      await modelService.deleteModel(id);
      toast.success('已删除');
      if (selectedModel?.id === id) {
        setSelectedModel(null);
      }
      loadModels();
    } catch (error: any) {
      toast.error('删除失败: ' + error.message);
    }
  };

  const handleToggleActive = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await modelService.setActiveModel(id);
      toast.success('模型已激活');
      loadModels();
    } catch (error: any) {
      toast.error('激活失败: ' + error.message);
    }
  };

  const handleTestConnection = async () => {
    if (!formData.url || !formData.model_id) {
      toast.error('请填写 URL 和模型标识符');
      return;
    }

    setTesting(true);
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/extract/test-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: formData.url,
                api_key: formData.api_key || 'not-needed',
                model_name: formData.model_id,
                provider: formData.provider,
                temperature: formData.temperature,
                top_p: formData.top_p
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            toast.success(`连接成功！平均延迟: ${data.latency_ms}ms`, {
                description: `模型: ${data.model}`,
                icon: <Zap className="w-5 h-5 text-yellow-500" />
            });
        } else {
            toast.error(`测试失败: ${data.message}`);
        }
    } catch (error: any) {
        toast.error('测试请求发生错误: ' + error.message);
    } finally {
        setTesting(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'openai': return <BrainCircuit className="w-5 h-5 text-primary" />;
      case 'ollama': return <Cpu className="w-5 h-5 text-amber-500" />;
      case 'deepseek': return <Zap className="w-5 h-5 text-blue-500" />;
      default: return <Bot className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <>
      <Header title="模型配置" />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: Model List */}
        <aside className="w-80 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-6 border-b border-slate-200 bg-white">
            <button 
              onClick={handleAddNew}
              className="w-full py-2.5 px-4 bg-primary text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
            >
              <PlusCircle className="w-5 h-5" />
              添加新模型
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            <p className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">当前模型库</p>
            
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : models.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                暂无模型，请添加
              </div>
            ) : (
                models.map(model => (
                    <div 
                      key={model.id}
                      onClick={() => handleSelectModel(model)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all cursor-pointer group ${
                        selectedModel?.id === model.id 
                          ? 'bg-white border-primary/20 shadow-sm' 
                          : 'border-transparent hover:bg-white hover:border-slate-200 shadow-none'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          selectedModel?.id === model.id ? 'bg-primary/10' : 'bg-slate-100'
                      }`}>
                        {getProviderIcon(model.provider || 'openai')}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className={`text-sm font-semibold truncate ${
                            selectedModel?.id === model.id ? 'text-slate-900' : 'text-slate-600'
                        }`}>{model.name}</span>
                        {model.is_active ? (
                            <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span> 运行中
                            </span>
                        ) : (
                            <span 
                                onClick={(e) => handleToggleActive(model.id, e)}
                                className="text-[10px] text-slate-400 hover:text-primary transition-colors font-medium cursor-pointer"
                            >
                                点击激活
                            </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                        <button 
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                        >
                            <Edit className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={(e) => handleDelete(model.id, e)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                ))
            )}
          </div>
          <div className="p-4 bg-white border-t border-slate-200 text-center">
            <p className="text-[11px] text-slate-400">版本 v2.4.1 © 2024 AI Extraction</p>
          </div>
        </aside>

        {/* Main Content: Model Detail Form */}
        <main className="flex-1 overflow-y-auto bg-white p-12">
          {!selectedModel && !isEditing ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <Bot className="w-16 h-16 opacity-10" />
                  <p className="text-sm font-medium">请从左侧选择一个模型或添加新配置</p>
                  <button 
                    onClick={handleAddNew}
                    className="text-primary text-sm font-bold hover:underline"
                  >
                    立即添加新模型 →
                  </button>
              </div>
          ) : (
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-10 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-primary mb-1">
                            <Settings className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-widest">Model Settings</span>
                        </div>
                        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                            {isEditing ? (selectedModel ? '编辑模型' : '添加新模型') : '模型详细配置'}
                        </h1>
                        <p className="mt-2 text-slate-500">
                            配置用于数据提取任务的 AI 模型参数。{formData.provider === 'ollama' ? '正在连接到本地 Ollama 实例。' : '确保 API 凭据有效以维持系统提取稳定性。'}
                        </p>
                    </div>
                    {!isEditing && (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold text-sm transition-all"
                        >
                            <Edit className="w-4 h-4" />
                            编辑此配置
                        </button>
                    )}
                </div>

                {/* Form Section */}
                <div className="space-y-10">
                    {/* Provider Select */}
                    <section className="space-y-4">
                        <label className="text-sm font-bold text-slate-700 block">AI 服务商</label>
                        <div className="grid grid-cols-4 gap-4">
                            {[
                                { id: 'openai', name: 'OpenAI (云端)', icon: <BrainCircuit className="w-4 h-4" /> },
                                { id: 'ollama', name: 'Ollama (本地)', icon: <Cpu className="w-4 h-4" /> },
                            ].map(p => (
                                <button
                                    key={p.id}
                                    disabled={!isEditing}
                                    onClick={() => handleProviderChange(p.id)}
                                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                                        formData.provider === p.id 
                                            ? 'border-primary bg-primary/5 text-primary' 
                                            : 'border-slate-100 hover:border-slate-200 text-slate-500'
                                    } ${!isEditing && 'opacity-80 grayscale-[0.5]'}`}
                                >
                                    {p.icon}
                                    <span className="text-[11px] font-bold">{p.name}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Group 1: Connection */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                            <LinkIcon className="w-5 h-5 text-slate-400" />
                            <h3 className="text-lg font-bold text-slate-800">连接信息</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">显示名称</label>
                                <input
                                    type="text"
                                    disabled={!isEditing}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all disabled:bg-slate-100"
                                    placeholder="例如：本地 Qwen2.5 或 生产环境 GPT-4"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-slate-500 uppercase">模型标识符 (Model ID)</label>
                                <input
                                    type="text"
                                    disabled={!isEditing}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all disabled:bg-slate-100"
                                    placeholder={formData.provider === 'ollama' ? '例如：qwen2.5:7b' : '例如：gpt-4o'}
                                    value={formData.model_id}
                                    onChange={e => setFormData({ ...formData, model_id: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">API 端点 URL</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    disabled={!isEditing}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all disabled:bg-slate-100"
                                    placeholder="https://"
                                    value={formData.url}
                                    onChange={e => setFormData({ ...formData, url: e.target.value })}
                                />
                                <Globe className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                            </div>
                            {formData.provider === 'ollama' && (
                                <p className="text-[11px] text-amber-600 font-medium">提示：本地部署的 Ollama 通常为 http://localhost:11434/v1</p>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">API 密钥 (API Key)</label>
                            <div className="relative">
                                <input
                                    type={showApiKey ? "text" : "password"}
                                    disabled={!isEditing}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all disabled:bg-slate-100"
                                    placeholder={formData.provider === 'ollama' ? '可填写任意字符' : 'sk-...'}
                                    value={formData.api_key}
                                    onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                                />
                                <button 
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-primary transition-colors"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                >
                                    {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
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
                                    <span className="px-2 py-0.5 rounded bg-primary/5 text-primary text-xs font-bold">{formData.temperature}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    disabled={!isEditing}
                                    value={formData.temperature}
                                    onChange={e => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                    <span>更精确 (0)</span>
                                    <span>更创意 (1)</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-semibold text-slate-700">Top_P</label>
                                    <span className="px-2 py-0.5 rounded bg-primary/5 text-primary text-xs font-bold">{formData.top_p}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    disabled={!isEditing}
                                    value={formData.top_p}
                                    onChange={e => setFormData({ ...formData, top_p: parseFloat(e.target.value) })}
                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                                />
                                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                                    <span>聚焦 (0)</span>
                                    <span>多样 (1)</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Footer Actions */}
                    <div className="pt-10 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={handleTestConnection}
                                disabled={testing}
                                className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {testing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                连通性测试
                            </button>
                        </div>
                        
                        {isEditing && (
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => {
                                        setIsEditing(false);
                                        if (selectedModel) handleSelectModel(selectedModel);
                                        else setSelectedModel(null);
                                    }}
                                    className="px-6 py-2.5 rounded-xl text-slate-500 font-semibold text-sm hover:text-slate-800 transition-all"
                                >
                                    取消
                                </button>
                                <button 
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="px-10 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    保存配置
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
