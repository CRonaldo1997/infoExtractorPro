import { createClient } from '@/lib/supabase/client';

export type TaskStatus = 'uploading' | 'uploaded' | 'upload_failed' | 'extracting' | 'extracted' | 'extract_failed' | 'reviewed';

export interface Task {
    id: string;
    name: string;
    status: TaskStatus;
    user_id: string;
    prompt_set_id: string | null;
    model_config_id: string | null;
    created_at: string;
    updated_at: string;
}

export const taskService = {
    // 获取所有任务
    async getTasks() {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Task[];
    },

    // 获取单个任务详情
    async getTaskById(id: string) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data as Task;
    },

    // 创建新任务
    async createTask(name: string) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
            .from('tasks')
            .insert([
                {
                    name,
                    user_id: user.id,
                    status: 'uploading'
                }
            ])
            .select()
            .single();

        if (error) throw error;
        return data as Task;
    },

    // 更新任务状态
    async updateTaskStatus(id: string, status: TaskStatus) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('tasks')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Task;
    },

    // 删除任务
    async deleteTask(id: string) {
        const supabase = createClient();
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // 批量删除任务
    async deleteTasks(ids: string[]) {
        const supabase = createClient();
        const { error } = await supabase
            .from('tasks')
            .delete()
            .in('id', ids);

        if (error) throw error;
    }
};
