-- =====================================================
-- InfoEx 信息提取系统 - 数据库初始化脚本
-- 请在 Supabase SQL Editor 中运行此脚本
-- =====================================================

-- 1. Task 表（任务/上传批次）
CREATE TABLE IF NOT EXISTS public.tasks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,                              -- 任务名称（UUID自动生成）
    status      TEXT NOT NULL DEFAULT 'uploading'          -- uploading | uploaded | failed | extracting | extracted | extract_failed | reviewed
                CHECK (status IN ('uploading','uploaded','upload_failed','extracting','extracted','extract_failed','reviewed')),
    prompt_set_id UUID,                                    -- 关联提示词组（可为空）
    model_config_id UUID,                                  -- 关联模型配置（可为空）
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 文件表
CREATE TABLE IF NOT EXISTS public.files (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,                            -- 原始文件名
    path         TEXT NOT NULL,                            -- Supabase Storage 路径
    size         BIGINT NOT NULL DEFAULT 0,                -- 文件大小（字节）
    mime_type    TEXT,                                     -- MIME类型
    status       TEXT NOT NULL DEFAULT 'uploading'
                 CHECK (status IN ('uploading','uploaded','upload_failed','extracting','extracted','extract_failed')),
    ocr_result   JSONB,                                    -- OCR识别结果（文字块+bbox）
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 提示词组表
CREATE TABLE IF NOT EXISTS public.prompt_sets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,                            -- 提示词组名称
    is_default   BOOLEAN NOT NULL DEFAULT FALSE,           -- 是否为默认提示词组
    chunk_size   INT NOT NULL DEFAULT 2000,                -- 分段字符数
    chunk_overlap INT NOT NULL DEFAULT 200,                -- 重叠字符数
    separators   JSONB NOT NULL DEFAULT '["\\n\\n", "\\n", "。", ".", " ", ""]'::jsonb, -- 分隔符
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. 字段表（属于某个提示词组的字段配置）
CREATE TABLE IF NOT EXISTS public.fields (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_set_id UUID NOT NULL REFERENCES public.prompt_sets(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,                            -- 字段名称
    prompt       TEXT NOT NULL,                            -- 提示词
    data_type    TEXT NOT NULL DEFAULT 'string'
                 CHECK (data_type IN ('string','number','date','boolean')),
    batch_id     TEXT,                                     -- 批次 ID（用于分组调用）
    sort_order   INT NOT NULL DEFAULT 0,                   -- 排序
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. 模型配置表
CREATE TABLE IF NOT EXISTS public.model_configs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,                            -- 模型名称（展示用）
    url          TEXT NOT NULL,                            -- API URL
    api_key      TEXT NOT NULL,                            -- API Key（加密存储）
    temperature  FLOAT NOT NULL DEFAULT 0.2,
    top_p        FLOAT NOT NULL DEFAULT 0.8,
    is_active    BOOLEAN NOT NULL DEFAULT FALSE,           -- 全局只能有1个生效
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. 提取结果表
CREATE TABLE IF NOT EXISTS public.extraction_results (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id      UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    field_id     UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    value        TEXT,                                     -- LLM提取的字段值
    source       TEXT,                                     -- 原文出处
    bbox         JSONB,                                    -- 对应的bbox坐标（若有）
    confidence   FLOAT,                                    -- OCR置信度
    is_reviewed  BOOLEAN NOT NULL DEFAULT FALSE,           -- 是否已审核
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (file_id, field_id)                            -- 每个文件的每个字段只有一条结果
);

-- =====================================================
-- 索引（提升查询效率）
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_files_task_id ON public.files(task_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_status ON public.files(status);
CREATE INDEX IF NOT EXISTS idx_prompt_sets_user_id ON public.prompt_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_fields_prompt_set_id ON public.fields(prompt_set_id);
CREATE INDEX IF NOT EXISTS idx_model_configs_user_id ON public.model_configs(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_results_file_id ON public.extraction_results(file_id);

-- =====================================================
-- Row Level Security（RLS）— 确保用户数据隔离
-- =====================================================
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_results ENABLE ROW LEVEL SECURITY;

-- tasks 策略
CREATE POLICY "users_own_tasks" ON public.tasks
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- files 策略
CREATE POLICY "users_own_files" ON public.files
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- prompt_sets 策略
CREATE POLICY "users_own_prompt_sets" ON public.prompt_sets
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- fields 策略
CREATE POLICY "users_own_fields" ON public.fields
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- model_configs 策略
CREATE POLICY "users_own_model_configs" ON public.model_configs
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- extraction_results 策略
CREATE POLICY "users_own_extraction_results" ON public.extraction_results
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- Supabase Storage Bucket（用于存储上传的文件）
-- =====================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage 访问策略（用户只能访问自己的文件）
CREATE POLICY "users_upload_own_files" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'files' AND auth.uid()::TEXT = (storage.foldername(name))[1]
    );

CREATE POLICY "users_read_own_files" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'files' AND auth.uid()::TEXT = (storage.foldername(name))[1]
    );

CREATE POLICY "users_delete_own_files" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'files' AND auth.uid()::TEXT = (storage.foldername(name))[1]
    );

-- 完成！
SELECT 'Database initialized successfully!' AS result;
