import { createClient } from '@/lib/supabase/client';

export type FileStatus = 'uploading' | 'uploaded' | 'upload_failed' | 'extracting' | 'extracted' | 'extract_failed';

export interface FileRecord {
    id: string;
    task_id: string;
    user_id: string;
    name: string;
    path: string;
    size: number;
    mime_type: string | null;
    status: FileStatus;
    ocr_result: any | null;
    created_at: string;
    updated_at: string;
}

export const fileService = {
    // 获取任务下的所有文件
    async getFilesByTaskId(taskId: string) {
        const supabase = createClient();
        const { data, error } = await supabase
            .from('files')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data as FileRecord[];
    },

    // 上传文件到 Storage 并创建数据库记录
    async uploadFile(taskId: string, file: File) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        // 彻底解决 Invalid key 方案：
        // 云端路径使用: userId/taskId/uuid.ext (全英文数字，无任何兼容性问题)
        // 数据库存: file.name (原始文件名，用于前端展示)
        const fileId = crypto.randomUUID();
        const extension = file.name.split('.').pop() || 'bin';
        const storagePath = `${user.id}/${taskId}/${fileId}.${extension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('files')
            .upload(storagePath, file);

        if (uploadError) throw uploadError;

        // 2. 创建数据库记录
        const { data, error: dbError } = await supabase
            .from('files')
            .insert([
                {
                    task_id: taskId,
                    user_id: user.id,
                    name: file.webkitRelativePath || file.name, // 优先保存带层级的相对路径
                    path: storagePath,
                    size: file.size,
                    mime_type: file.type,
                    status: 'uploaded'
                }
            ])
            .select()
            .single();

        if (dbError) {
            await supabase.storage.from('files').remove([storagePath]);
            throw dbError;
        }

        return data as FileRecord;
    },

    // 删除文件（同时删除 Storage 和数据库记录）
    async deleteFile(id: string, path: string) {
        const supabase = createClient();

        // 删除 Storage 文件
        const { error: storageError } = await supabase.storage
            .from('files')
            .remove([path]);

        if (storageError) console.error('Error deleting file from storage:', storageError);

        // 删除数据库记录
        const { error: dbError } = await supabase
            .from('files')
            .delete()
            .eq('id', id);

        if (dbError) throw dbError;
    },

    // 获取文件下载预览链接 (临时链接)
    async getFileUrl(path: string) {
        const supabase = createClient();
        const { data, error } = await supabase.storage
            .from('files')
            .createSignedUrl(path, 3600); // 1小时有效

        if (error) throw error;
        return data.signedUrl;
    }
};
