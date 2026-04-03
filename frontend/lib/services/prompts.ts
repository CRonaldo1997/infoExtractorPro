import { createClient } from '@/lib/supabase/client';

export const DEFAULT_SYSTEM_PROMPT = `你是一个高精度的信息提取专家。你的任务是从原始文本中提取指定字段的值。

### 核心规范：
1. **value (提取值)**: 必须从文中精准提取，禁止虚构和过度推断。如果文中不存在，填入空字符串。
2. **source (原文出处)**: **必须是原文中包含 "value" 的那个精确段落或完整句子**。
   - 禁止在多个字段间重复使用同一个不相关的“背景句”作为出处。
   - 出处必须是能有效证明 "value" 真实存在的上下文。
   - 如果 value 为空，source 也必须为空。

### 输出格式：
必须严格输出纯 JSON 对象，不得包含 Markdown 代码块。格式如下：
{
  "字段名称": { "value": "提取内容", "source": "对应的原文句子" }
}`;

export interface PromptSet {
    id: string;
    user_id: string;
    name: string;
    is_default: boolean;
    system_prompt: string | null; // 【新增】：系统提示词
    chunk_size: number;
    chunk_overlap: number;
    extraction_passes: number;
    separators: string[];
    version: number;
    parent_id: string | null;
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
    async getPromptSets(onlyLatest = false) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        let query = supabase
            .from('prompt_sets')
            .select('*')
            .eq('user_id', user.id)
            .order('name', { ascending: true })
            .order('version', { ascending: false });

        const { data, error } = await query;

        if (error) throw error;
        
        const sets = data as PromptSet[];
        
        if (onlyLatest) {
            // 只保留每个 parent_id (或同名组) 下版本号最高的那个
            const latestMap = new Map<string, PromptSet>();
            sets.forEach(s => {
                const groupId = s.parent_id || s.id;
                if (!latestMap.has(groupId)) {
                    latestMap.set(groupId, s);
                } else {
                    const existing = latestMap.get(groupId)!;
                    if ((s.version || 1) > (existing.version || 1)) {
                        latestMap.set(groupId, s);
                    }
                }
            });
            return Array.from(latestMap.values());
        }

        return sets;
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
    async createPromptSet(name: string, isDefault = false, config?: { system_prompt?: string, chunk_size?: number, chunk_overlap?: number, extraction_passes?: number, separators?: string[] }) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('prompt_sets')
            .insert([{
                name,
                is_default: isDefault,
                user_id: user.id,
                system_prompt: config?.system_prompt ?? null,
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
    async updatePromptSet(id: string, updates: Partial<Pick<PromptSet, 'name' | 'system_prompt' | 'chunk_size' | 'chunk_overlap' | 'extraction_passes' | 'separators' | 'is_default'>>) {
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

    // 批量保存字段 (不再删除，而是创建新版本)
    async saveFields(
        promptSetId: string, 
        fields: Omit<PromptField, 'id' | 'prompt_set_id' | 'user_id' | 'created_at'>[],
        configOverrides?: Partial<Pick<PromptSet, 'name' | 'system_prompt' | 'chunk_size' | 'chunk_overlap' | 'extraction_passes' | 'separators' | 'is_default'>>
    ) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 1. 获取当前版本详情
        const { data: currentSet, error: fetchError } = await supabase
            .from('prompt_sets')
            .select('*')
            .eq('id', promptSetId)
            .single();

        if (fetchError || !currentSet) throw new Error('Failed to fetch current prompt set');

        // 2. 创建一个新版本的 Record
        const newVersion = (currentSet.version || 1) + 1;
        const parentId = currentSet.parent_id || currentSet.id;

        const { data: newSet, error: createError } = await supabase
            .from('prompt_sets')
            .insert([{
                name: configOverrides?.name ?? currentSet.name,
                user_id: user.id,
                is_default: configOverrides?.is_default ?? false, // 默认不作为全局默认，除非明确指定
                system_prompt: configOverrides?.system_prompt ?? currentSet.system_prompt,
                chunk_size: configOverrides?.chunk_size ?? currentSet.chunk_size,
                chunk_overlap: configOverrides?.chunk_overlap ?? currentSet.chunk_overlap,
                extraction_passes: configOverrides?.extraction_passes ?? currentSet.extraction_passes,
                separators: configOverrides?.separators ?? currentSet.separators,
                version: newVersion,
                parent_id: parentId
            }])
            .select()
            .single();

        if (createError) throw createError;

        if (fields.length === 0) return { newSet: newSet as PromptSet, fields: [] };

        // 3. 批量插入新字段到新版本下
        const insertData = fields.map((f, index) => ({
            prompt_set_id: newSet.id,
            user_id: user.id,
            name: f.name,
            prompt: f.prompt,
            data_type: f.data_type,
            batch_id: f.batch_id || null,
            sort_order: index
        }));

        const { data: newFields, error: insError } = await supabase
            .from('fields')
            .insert(insertData)
            .select();

        if (insError) throw insError;
        
        return { 
            newSet: newSet as PromptSet, 
            fields: newFields as PromptField[] 
        };
    }
};
