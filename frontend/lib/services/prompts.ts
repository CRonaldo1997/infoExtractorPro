import { createClient } from '@/lib/supabase/client';

export interface PromptSet {
    id: string;
    user_id: string;
    name: string;
    is_default: boolean;
    chunk_size: number;
    chunk_overlap: number;
    extraction_passes: number;
    separators: string[];
    created_at: string;
    updated_at: string;
}

export interface PromptField {
    id: string;
    prompt_set_id: string;
    user_id: string;
    name: string;
    prompt: string;
    data_type: 'string' | 'number' | 'date' | 'boolean';
    sort_order: number;
    batch_id: string | null;
    created_at: string;
}

export const promptService = {
    // 获取所有的提示词组
    async getPromptSets() {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('prompt_sets')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data as PromptSet[];
    },

    // 获取特定提示词组包含的字段
    async getFieldsByPromptSetId(promptSetId: string) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('fields')
            .select('*')
            .eq('prompt_set_id', promptSetId)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return data as PromptField[];
    },

    // 创建新的提示词组
    async createPromptSet(name: string, isDefault = false, config?: { chunk_size?: number, chunk_overlap?: number, extraction_passes?: number, separators?: string[] }) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('prompt_sets')
            .insert([{
                name,
                is_default: isDefault,
                user_id: user.id,
                chunk_size: config?.chunk_size ?? 2000,
                chunk_overlap: config?.chunk_overlap ?? 200,
                extraction_passes: config?.extraction_passes ?? 1,
                separators: config?.separators ?? ["\n\n", "\n", "。", ".", " ", ""]
            }])
            .select()
            .single();

        if (error) throw error;
        return data as PromptSet;
    },

    // 更新提示词组名称和配置
    async updatePromptSet(id: string, updates: Partial<Pick<PromptSet, 'name' | 'chunk_size' | 'chunk_overlap' | 'extraction_passes' | 'separators' | 'is_default'>>) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('prompt_sets')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as PromptSet;
    },

    // 删除提示词组
    async deletePromptSet(id: string) {
        const supabase = createClient();
        const { error } = await supabase
            .from('prompt_sets')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // 批量保存字段 (先删除被移除的，再插入/更新现在的)
    async saveFields(promptSetId: string, fields: Omit<PromptField, 'id' | 'prompt_set_id' | 'user_id' | 'created_at'>[]) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 为了简化逻辑，我们在同一个事务或操作里全量覆盖：
        // 1. 删除旧的该词组下的所有字段
        const { error: delError } = await supabase
            .from('fields')
            .delete()
            .eq('prompt_set_id', promptSetId);

        if (delError) throw delError;

        if (fields.length === 0) return [];

        // 2. 批量插入新的
        const insertData = fields.map((f, index) => ({
            prompt_set_id: promptSetId,
            user_id: user.id,
            name: f.name,
            prompt: f.prompt,
            data_type: f.data_type,
            batch_id: f.batch_id || null,
            sort_order: index // 重新分配排序
        }));

        const { data, error: insError } = await supabase
            .from('fields')
            .insert(insertData)
            .select();

        if (insError) throw insError;
        return data as PromptField[];
    }
};
