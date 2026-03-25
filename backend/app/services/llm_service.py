"""
LLM 服务 - 使用 OpenAI 兼容协议发起提取请求
每个字段单独发一次请求，返回 { value, source }
"""
import json
import logging
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

# 系统提示词
SYSTEM_PROMPT = """你是一个专业的信息提取专家。
你的任务是从给定的文字内容中，精准提取用户指定字段的值，并给出原文中的精确出处。

输出格式（严格遵守，仅输出 JSON，不要有任何其他内容）：
{
  "value": "提取到的字段值，如果在原文中找不到该字段，则返回空字符串",
  "source": "原文中对应的精确原句/片段，必须与原文完全一致，如果找不到则返回空字符串"
}"""


async def extract_field_value(
    *,
    model_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    top_p: float,
    text_content: str,
    field_name: str,
    field_prompt: str,
    field_data_type: str,
) -> dict[str, Any]:
    """
    Keep for backward compatibility or individual retries.
    """
    results = await extract_grouped_fields(
        model_url=model_url,
        api_key=api_key,
        model_name=model_name,
        temperature=temperature,
        top_p=top_p,
        text_content=text_content,
        fields=[{
            "id": "single",
            "name": field_name,
            "prompt": field_prompt,
            "data_type": field_data_type
        }]
    )
    return results.get("single", {"value": "", "source": ""})


async def extract_grouped_fields(
    *,
    model_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    top_p: float,
    text_content: str,
    fields: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """
    一次性提取多个字段。
    fields: [{"id": "...", "name": "...", "prompt": "...", "data_type": "..."}]
    返回: { "field_id": { "value": "...", "source": "..." } }
    """
    if not fields:
        return {}

    client = AsyncOpenAI(api_key=api_key, base_url=model_url)

    # 构造字段描述
    fields_desc = ""
    for f in fields:
        fields_desc += f"- {f['name']} (类型: {f['data_type']}): {f['prompt']}\n"

    # 构造期望的 JSON 结构示例
    example_json = {
        f["id"]: {"value": "...", "source": "..."} for f in fields
    }

    user_message = f"""原文内容：
---
{text_content}
---

请提取以下字段：
{fields_desc}

输出要求：
1. 严格输出 JSON 格式，不要包含任何 Markdown 代码块或多余文字。
2. 每个字段必须包含 "value" (提取值) 和 "source" (原文精确出处)。
3. 如果字段在原文中不存在，value 和 source 均返回空字符串。
4. 格式必须如下：
{json.dumps(example_json, ensure_ascii=False, indent=2)}
"""

    for attempt in range(3):
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                temperature=temperature,
                top_p=top_p,
                response_format={"type": "json_object"},
                extra_body={"thinking": {"type": "disabled"}},
            )

            raw = response.choices[0].message.content or "{}"
            result = json.loads(raw)

            # 格式化返回值，确保包含所有请求的字段
            final_results = {}
            for f in fields:
                field_id = f["id"]
                data = result.get(field_id, {})
                if not isinstance(data, dict):
                    data = {}
                final_results[field_id] = {
                    "value": str(data.get("value", "")),
                    "source": str(data.get("source", "")),
                }
            return final_results

        except json.JSONDecodeError as e:
            logger.warning(f"JSON decode error on attempt {attempt + 1}: {e}")
            if attempt == 2:
                break
        except Exception as e:
            logger.error(f"LLM API error on attempt {attempt + 1}: {e}")
            if attempt == 2:
                raise

    return {f["id"]: {"value": "", "source": ""} for f in fields}
