import { createClient } from '@/lib/supabase/client';

export interface ModelConfig {
    id: string;
    user_id: string;
    name: string;        // 显示名称
    model_id: string;    // 实际模型标识 (如 gpt-4o, qwen2.5:7b)
    provider: string;    // openai | ollama | deepseek | gemini
    url: string;         // API Endpoint
    api_key: string;     // API Key
    temperature: number;
    top_p: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export const modelService = {
    // 获取当前用户的所有模型配置
    async getModels() {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('model_configs')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as ModelConfig[];
    },

    // 创建新模型配置
    async createModel(model: Omit<ModelConfig, 'id' | 'created_at' | 'updated_at' | 'user_id'>) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 如果新建的模型设为生效，先将其他模型设为不生效
        if (model.is_active) {
            await supabase
                .from('model_configs')
                .update({ is_active: false })
                .eq('user_id', user.id);
        }

        const { data, error } = await supabase
            .from('model_configs')
            .insert([{ ...model, user_id: user.id }])
            .select()
            .single();

        if (error) throw error;
        return data as ModelConfig;
    },

    // 更新模型配置
    async updateModel(id: string, updates: Partial<Omit<ModelConfig, 'id' | 'created_at' | 'updated_at' | 'user_id'>>) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 如果更新的模型设为生效，先将其他模型设为不生效
        if (updates.is_active) {
            await supabase
                .from('model_configs')
                .update({ is_active: false })
                .eq('user_id', user.id);
        }

        const { data, error } = await supabase
            .from('model_configs')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ModelConfig;
    },

    // 切换生效的模型
    async setActiveModel(id: string) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 1. 全部设为不生效
        const { error: error1 } = await supabase
            .from('model_configs')
            .update({ is_active: false })
            .eq('user_id', user.id);

        if (error1) throw error1;

        // 2. 将指定 ID 设为生效
        const { data, error } = await supabase
            .from('model_configs')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as ModelConfig;
    },

    // 删除模型配置
    async deleteModel(id: string) {
        const supabase = createClient();
        const { error } = await supabase
            .from('model_configs')
            .delete()
            .eq('id', id);

        if (error) throw error;
    }
};
