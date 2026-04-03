"""
LLM 服务 - 支持 OpenAI 兼容协议和 Ollama
每个字段提取返回 { value, source }

生产加固要点：
- Ollama 是本地单 GPU，强制串行（并发=1）防止 OOM 和队列堆积
- OpenAI/兼容接口用 httpx 级别 + asyncio 双层超时
- 所有重试带指数退避，防止打爆 API
"""
import asyncio
import json
import logging
from typing import Any, Optional, Union

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel, create_model

logger = logging.getLogger(__name__)

# ---------- 全局配置 ----------

# 每次 LLM 调用的超时时间（秒）
_LLM_TIMEOUT_SECONDS = 120

# Ollama 本地单 GPU 串行信号量：
# 16G 显存跑 qwen2.5:7b/9b 量化版，设置为 2 可以提高推理吞吐量而不至于 OOM
_OLLAMA_SEMAPHORE = asyncio.Semaphore(2)

SYSTEM_PROMPT = """你是一个高精度的信息提取专家。你的任务是从原始文本中提取指定字段的值。

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
}"""


# ---------- JSON 解析工具 ----------

def _clean_json_str(raw: str) -> str:
    """清理 Markdown 代码块标记，提取纯 JSON 字符串"""
    raw = raw.strip()
    if raw.startswith("```"):
        first_line_end = raw.find("\n")
        if first_line_end != -1:
            raw = raw[first_line_end:].strip()
        if raw.endswith("```"):
            raw = raw[:-3].strip()
    return raw


def _parse_flexible_json(raw: str) -> dict:
    """灵活解析 JSON，处理 Markdown 包装、列表封装并尝试使用 json-repair 修复"""
    cleaned = _clean_json_str(raw)
    try:
        data = json.loads(cleaned)
    except Exception:
        try:
            from json_repair import repair_json
            logger.info("Standard JSON parsing failed. Attempting to repair...")
            repaired = repair_json(cleaned)
            data = json.loads(repaired)
        except ImportError:
            logger.warning("json-repair not installed, fallback to empty dict")
            return {}
        except Exception as e:
            logger.warning(f"Failed to repair JSON: {e}")
            return {}

    if isinstance(data, list) and len(data) > 0:
        return data[0]
    if isinstance(data, dict):
        return data
    return {}


# ---------- Pydantic 模型 ----------

class InfoField(BaseModel):
    value: Optional[Union[str, int, float]] = None
    source: Optional[str] = None


# ---------- 公共入口 ----------

async def extract_field_value(
    *,
    provider: str = "openai",
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
    """兼容旧接口的单字段提取入口"""
    results = await extract_grouped_fields(
        provider=provider,
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
    provider: str = "openai",
    model_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    top_p: float,
    text_content: str,
    fields: list[dict[str, Any]],
    system_prompt: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """
    一次性提取多个字段。
    fields: [{"id": "...", "name": "...", "prompt": "...", "data_type": "..."}]
    返回: { "field_id": { "value": "...", "source": "..." } }
    """
    if not fields:
        return {}

    fields_desc = ""
    for f in fields:
        fields_desc += f"- {f['name']} (类型: {f['data_type']}): {f['prompt']}\n"

    if provider == "ollama":
        return await _extract_ollama(
            model_url=model_url,
            model_name=model_name,
            temperature=temperature,
            top_p=top_p,
            text_content=text_content,
            fields=fields,
            fields_desc=fields_desc,
            system_prompt=system_prompt,
        )
    else:
        return await _extract_openai(
            model_url=model_url,
            api_key=api_key,
            model_name=model_name,
            temperature=temperature,
            top_p=top_p,
            text_content=text_content,
            fields=fields,
            fields_desc=fields_desc,
            system_prompt=system_prompt,
        )


# ---------- OpenAI 兼容接口 ----------

# 进程级 Client 缓存，用于连接池复用
_openai_clients: dict[str, AsyncOpenAI] = {}

def _get_openai_client(api_key: str, base_url: str) -> AsyncOpenAI:
    cache_key = f"{api_key}|{base_url}"
    if cache_key not in _openai_clients:
        _openai_clients[cache_key] = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=httpx.Timeout(_LLM_TIMEOUT_SECONDS, connect=10.0),
            max_retries=0,  # 我们自己在函数内部控制重试
        )
    return _openai_clients[cache_key]

async def _extract_openai(
    model_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    top_p: float,
    text_content: str,
    fields: list[dict[str, Any]],
    fields_desc: str,
    system_prompt: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """OpenAI 兼容接口提取，多进程级连接池加速（ httpx 单例复用）"""
    client = _get_openai_client(api_key, model_url)

    example_json = {f["name"]: {"value": "...", "source": "..."} for f in fields}
    user_message = _build_user_message(text_content, fields_desc, example_json)

    empty_result = {f["id"]: {"value": "", "source": ""} for f in fields}

    for attempt in range(3):
        try:
            effective_system = system_prompt if system_prompt and system_prompt.strip() else SYSTEM_PROMPT
            
            logger.info("=" * 60)
            logger.info(">>> LLM FULL CONTEXT (OpenAI API) <<<")
            logger.info(f"--- SYSTEM PROMPT ---\n{effective_system}")
            logger.info(f"--- USER MESSAGE ---\n{user_message}")
            logger.info("=" * 60)

            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=model_name,
                    messages=[
                        {"role": "system", "content": effective_system},
                        {"role": "user", "content": user_message},
                    ],
                    temperature=temperature,
                    top_p=top_p,
                    response_format={"type": "json_object"},
                    extra_body={"thinking": {"type": "disabled"}},
                ),
                timeout=_LLM_TIMEOUT_SECONDS,
            )

            raw = response.choices[0].message.content or "{}"
            
            logger.info("=" * 40)
            logger.info(f"PROMPT SENT:\n{fields_desc}")
            logger.info(f"RAW LLM RESPONSE:\n{raw}")
            logger.info("=" * 40)
            
            result_dict = _parse_flexible_json(raw)

            if not result_dict:
                logger.warning(f"Empty result_dict from OpenAI (attempt {attempt + 1})")
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue

            return _format_results(fields, result_dict)

        except asyncio.TimeoutError:
            logger.error(f"OpenAI LLM timed out after {_LLM_TIMEOUT_SECONDS}s (attempt {attempt + 1})")
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
        except Exception as e:
            logger.error(f"OpenAI LLM error on attempt {attempt + 1}: {type(e).__name__}: {e}")
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    return empty_result


# ---------- Ollama 接口 ----------

async def _extract_ollama(
    model_url: str,
    model_name: str,
    temperature: float,
    top_p: float,
    text_content: str,
    fields: list[dict[str, Any]],
    fields_desc: str,
    system_prompt: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """
    Ollama 本地接口提取。
    关键：使用全局 _OLLAMA_SEMAPHORE(=1) 确保串行推理，
    防止多个 chunk/文件同时调用导致 GPU OOM 或严重排队。
    """
    try:
        import ollama
    except ImportError:
        logger.error("ollama library not installed")
        return {f["id"]: {"value": "", "source": ""} for f in fields}

    field_definitions = {f["name"]: (InfoField, ...) for f in fields}
    DynamicResponseModel = create_model("DynamicResponseModel", **field_definitions)

    example_json = {f["name"]: {"value": "...", "source": "..."} for f in fields}
    user_message = _build_user_message(text_content, fields_desc, example_json)

    effective_system = system_prompt if system_prompt and system_prompt.strip() else SYSTEM_PROMPT
    example_json = {f["name"]: {"value": "...", "source": "..."} for f in fields}
    user_message = _build_user_message(text_content, fields_desc, example_json)

    host = model_url.replace("/v1", "") if model_url else None
    client = ollama.AsyncClient(host=host)

    empty_result = {f["id"]: {"value": "", "source": ""} for f in fields}

    for attempt in range(3):
        try:
            # 串行信号量：同一时刻由于显存限制，控制 Ollama 并发
            async with _OLLAMA_SEMAPHORE:
                logger.info("=" * 60)
                logger.info(">>> LLM FULL CONTEXT (Ollama Local) <<<")
                logger.info(f"--- SYSTEM PROMPT ---\n{effective_system}")
                logger.info(f"--- USER MESSAGE ---\n{user_message}")
                logger.info("=" * 60)

                logger.debug(f"Ollama inference started (attempt {attempt + 1})")
                response = await asyncio.wait_for(
                    client.chat(
                        model=model_name,
                        messages=[
                            {"role": "system", "content": effective_system},
                            {"role": "user", "content": user_message},
                        ],
                        format="json",
                        think=False,
                        options={
                            "temperature": temperature,
                            "top_p": top_p
                        },
                    ),
                    timeout=_LLM_TIMEOUT_SECONDS,
                )

            raw_content = response.message.content
            
            logger.info("=" * 40)
            logger.info(f"PROMPT SENT:\n{fields_desc}")
            logger.info(f"RAW LLM RESPONSE:\n{raw_content}")
            logger.info("=" * 40)

            result_dict = _parse_flexible_json(raw_content)
            if not result_dict:
                logger.warning(f"Empty result_dict from Ollama (attempt {attempt + 1})")
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt)
                    continue
                break

            validated = DynamicResponseModel.model_validate(result_dict)
            final_dict = validated.model_dump()

            final_results = {}
            for f in fields:
                fid = f["id"]
                fname = f["name"]
                data = final_dict.get(fname) or {}
                final_results[fid] = {
                    "value": str(data.get("value") or ""),
                    "source": str(data.get("source") or ""),
                }
            return final_results

        except asyncio.TimeoutError:
            logger.error(f"Ollama LLM timed out after {_LLM_TIMEOUT_SECONDS}s (attempt {attempt + 1})")
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
        except Exception as e:
            logger.error(f"Ollama LLM error on attempt {attempt + 1}: {type(e).__name__}: {e}")
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)

    return empty_result


# ---------- 辅助函数 ----------

def _build_user_message(text_content: str, fields_desc: str, example_json: dict) -> str:
    return f"""原始文本内容如下：
---
{text_content}
---

请提取以下描述的字段：
{fields_desc}

输出严格要求：
1. **输出 JSON 对象**，不带 Markdown 代码块（如 ```json）。
2. 每个 key 对应一个对象，包含 "value" (字段值) 和 "source" (原文包含该值的**那行原句**)。
3. **关键出处规范**：source 必须是能够支撑 value 的直接上下文。不得在不同字段间滥用不相关的同一句文本作为出处。
4. 格式样例如下：
{json.dumps(example_json, ensure_ascii=False, indent=2)}
"""


def _format_results(fields: list[dict], result_dict: dict) -> dict[str, dict[str, Any]]:
    """将 LLM 返回的 dict 格式化为统一的 {field_id: {value, source}} 结构"""
    final_results = {}
    for f in fields:
        field_id = f["id"]
        field_name = f["name"]
        data = result_dict.get(field_name, {})
        if not isinstance(data, dict):
            data = {}
        final_results[field_id] = {
            "value": str(data.get("value", "")),
            "source": str(data.get("source", "")),
        }
    return final_results
