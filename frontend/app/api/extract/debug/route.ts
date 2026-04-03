import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
    try {
        const payload = await req.json();
        const { systemPrompt, userText } = payload;

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get active model
        const { data: models } = await supabase
            .from('model_configs')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_active', true);

        if (!models || models.length === 0) {
            return NextResponse.json({ error: 'No active model found. Please configure a model in settings.' }, { status: 400 });
        }

        const activeModel = models[0];

        // 为了兼容 OpenAI 规范以及第三方接口（诸如 Zhipu /v4 接口）
        let url = activeModel.url.trim().replace(/\/+$/, '');
        if (!url.endsWith('/chat/completions')) {
            url = url + '/chat/completions';
        }

        const formattedSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must output ONLY valid JSON format. Do NOT wrap in markdown \`\`\`json blocks. Return a root JSON object containing the extracted properties.`;

        const openAiPayload: any = {
            model: activeModel.name,
            messages: [
                { role: 'system', content: formattedSystemPrompt },
                { role: 'user', content: userText }
            ],
            temperature: activeModel.temperature || 0.1,
            top_p: activeModel.top_p || 1,
            response_format: { type: 'json_object' },
            thinking: { type: 'disabled' }
        };

        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${activeModel.api_key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(openAiPayload)
        });

        const latency = ((Date.now() - startTime) / 1000).toFixed(2) + 's';

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LLM API Request Failed: ${response.status} - ${errBody}`);
        }

        const result = await response.json();
        let content = result.choices?.[0]?.message?.content || '{}';

        // parse JSON
        let parsed = {};
        try {
            parsed = JSON.parse(content);
        } catch (e) {
            const match = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
            if (match) {
                try {
                    parsed = JSON.parse(match[1]);
                } catch (e2) {
                    parsed = { raw_text: content };
                }
            } else {
                parsed = { raw_text: content };
            }
        }

        const usage = result.usage || { prompt_tokens: 0, completion_tokens: 0 };
        return NextResponse.json({
            raw_response: result,
            extracted: parsed,
            usage,
            latency
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
