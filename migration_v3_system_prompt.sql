-- ===========================================
-- Add system_prompt to prompt_sets table
-- ===========================================

ALTER TABLE public.prompt_sets 
ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Update existing records with the default prompt to ensure they have the "base" one
-- We use a version of the prompt that is compatible with the multi-field extraction logic
UPDATE public.prompt_sets 
SET system_prompt = '你是一个高精度的信息提取专家。你的任务是从原始文本中提取指定字段的值。

### 核心规范：
1. **value (提取值)**: 必须从文中精准提取，禁止虚构和过度推断。如果文中不存在，填入空字符串。
2. **source (原文出处)**: **必须是原文中包含 "value" 的那个精确段落或完整句子**。
   - 禁止在多个字段间重复使用同一个不相关的“背景句”作为出处。
   - 出处必须是能有效证明 "value" 真实存在的上下文。
   - 如果 value 为空，source 也必须为空。

### 输出格式：
必须严格输出纯 JSON 对象，不得包含 Markdown 代码块。格式如下：
{
  "字段ID": { "value": "提取内容", "source": "对应的原文句子" }
}'
WHERE system_prompt IS NULL;
