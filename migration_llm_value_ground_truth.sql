-- ===========================================
-- 添加 llm_value 列，用于记录 LLM 提取的Ground Truth对比基准值
-- 运行此脚本以更新 extraction_results 表结构
-- ===========================================

-- 1. 向 extraction_results 表添加新列 `llm_value`
ALTER TABLE public.extraction_results 
ADD COLUMN IF NOT EXISTS llm_value TEXT;

-- 2. （可选）为那些已经提取出来但没有 llm_value 的旧数据刷入默认的 llm_value（将现有的 value 复制一份作为 llm_value，只有当它是 NULL 时）
UPDATE public.extraction_results 
SET llm_value = value 
WHERE llm_value IS NULL;
