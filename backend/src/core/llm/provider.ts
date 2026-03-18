import { generateText, streamText, generateImage } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { getDefaultLlmConfig, getDefaultImageConfig, getLlmConfigById } from '../config/llm-config';
import { getLogger } from '../util/logger';

const logger = getLogger('llm');

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('尚未配置任何模型，请先在「设置 → 模型配置」中添加模型并填写 API Key');
    this.name = 'LlmNotConfiguredError';
  }
}

function getModel(modelId?: string | null) {
  const cfg = modelId ? (getLlmConfigById(modelId) ?? getDefaultLlmConfig()) : getDefaultLlmConfig();

  if (!cfg || !cfg.apiKey) {
    throw new LlmNotConfiguredError();
  }

  const { provider, model, apiKey, baseUrl } = cfg;

  if (provider === 'anthropic') {
    const client = createAnthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    return client(model);
  }

  // openai / deepseek / custom — all use OpenAI-compatible chat completions API
  const client = createOpenAI({
    apiKey,
    baseURL: baseUrl || undefined,
    compatibility: 'compatible',
  } as any);
  return client.chat(model);
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, any>;
  result: any;
}

export interface LlmGenerateResult {
  text: string;
  toolCalls: ToolCallRecord[];
}

export async function llmGenerate(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  modelId?: string | null;
  tools?: Record<string, any>;
  maxSteps?: number;
}): Promise<LlmGenerateResult> {
  const cfg = opts.modelId ? (getLlmConfigById(opts.modelId) ?? getDefaultLlmConfig()) : getDefaultLlmConfig();
  const modelName = cfg?.model || 'unknown';

  logger.info(`─── LLM Request [${modelName}] ───`);
  logger.info(`System: ${opts.system.slice(0, 200)}${opts.system.length > 200 ? '...' : ''}`);
  logger.info(`Prompt: ${opts.prompt.slice(0, 500)}${opts.prompt.length > 500 ? '...' : ''}`);

  const genOpts: any = {
    model: getModel(opts.modelId),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxTokens || 2048,
  };
  if (opts.tools && Object.keys(opts.tools).length > 0) {
    genOpts.tools = opts.tools;
    genOpts.maxSteps = opts.maxSteps ?? 3;
    logger.info(`Tools: ${Object.keys(opts.tools).join(', ')} (maxSteps=${genOpts.maxSteps})`);
  }
  const result = await generateText(genOpts);

  logger.info(`─── LLM Response [${modelName}] (in=${result.usage?.inputTokens ?? '?'} out=${result.usage?.outputTokens ?? '?'} steps=${result.steps?.length ?? '?'} finishReason=${result.finishReason}) ───`);

  // 收集所有工具调用记录
  const allToolCalls: ToolCallRecord[] = [];
  const allToolResults: { toolName: string; result: any }[] = [];

  if (result.steps) {
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i] as any;
      logger.info(`  step[${i}] finishReason=${step.finishReason} text=${(step.text || '').slice(0, 100)}`);
      if (step.toolCalls?.length) {
        for (const tc of step.toolCalls) {
          const input = tc.args ?? tc.input ?? {};
          logger.info(`    tool_call: ${tc.toolName}(${JSON.stringify(input).slice(0, 200)})`);
        }
      }
      if (step.toolResults?.length) {
        for (let j = 0; j < step.toolResults.length; j++) {
          const tr = step.toolResults[j];
          const tc = step.toolCalls?.[j];
          const res = tr.result ?? tr.output;
          const input = tc ? (tc.args ?? tc.input ?? {}) : {};
          logger.info(`    tool_result: ${tr.toolName} → ${JSON.stringify(res).slice(0, 300)}`);
          allToolResults.push({ toolName: tr.toolName, result: res });
          allToolCalls.push({ toolName: tr.toolName, input, result: res });
        }
      }
    }
  }

  let finalText = result.text;

  // 回退：如果 LLM 只跑了 1 步且有工具结果但 text 很短（说明 LLM 没处理工具结果），
  // 把工具结果喂回去做第二次调用（不带 tools，纯生成）
  if (result.steps?.length === 1 && allToolResults.length > 0 && finalText.length < 100) {
    logger.warn('LLM stopped after 1 step with tool results unused — doing manual follow-up call');
    const toolContext = allToolResults.map(tr => {
      const content = typeof tr.result === 'string' ? tr.result : JSON.stringify(tr.result);
      return `[${tr.toolName} 返回结果]\n${content.slice(0, 3000)}`;
    }).join('\n\n');

    const { text: followUp, usage: followUpUsage } = await generateText({
      model: getModel(opts.modelId),
      system: opts.system,
      prompt: `${opts.prompt}\n\n以下是工具调用返回的真实数据，请基于这些数据完成任务：\n\n${toolContext}`,
      maxOutputTokens: opts.maxTokens || 2048,
    });
    logger.info(`─── Follow-up Response [${modelName}] (in=${followUpUsage?.inputTokens ?? '?'} out=${followUpUsage?.outputTokens ?? '?'}) ───`);
    logger.info(`Output: ${followUp.slice(0, 500)}${followUp.length > 500 ? '...' : ''}`);
    finalText = followUp;
  } else {
    logger.info(`Output: ${finalText.slice(0, 500)}${finalText.length > 500 ? '...' : ''}`);
  }

  return { text: finalText, toolCalls: allToolCalls };
}

export function llmStream(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  modelId?: string | null;
  tools?: Record<string, any>;
  maxSteps?: number;
  temperature?: number;
}) {
  const cfg = opts.modelId ? (getLlmConfigById(opts.modelId) ?? getDefaultLlmConfig()) : getDefaultLlmConfig();
  const modelName = cfg?.model || 'unknown';

  logger.info(`─── LLM Stream [${modelName}] ───`);
  logger.info(`System: ${opts.system.slice(0, 200)}${opts.system.length > 200 ? '...' : ''}`);
  logger.info(`Prompt: ${opts.prompt.slice(0, 500)}${opts.prompt.length > 500 ? '...' : ''}`);

  const streamOpts: any = {
    model: getModel(opts.modelId),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxTokens || 256,
  };
  if (opts.temperature !== undefined) {
    streamOpts.temperature = opts.temperature;
  }
  if (opts.tools && Object.keys(opts.tools).length > 0) {
    streamOpts.tools = opts.tools;
    streamOpts.maxSteps = opts.maxSteps ?? 2;
  }
  return streamText(streamOpts);
}

export async function llmGenerateImage(opts: {
  prompt: string;
  size?: string;
  modelId?: string;
}): Promise<Buffer> {
  const cfg = opts.modelId
    ? (getLlmConfigById(opts.modelId) ?? getDefaultImageConfig())
    : getDefaultImageConfig();

  if (!cfg || !cfg.apiKey) {
    throw new Error('未配置图片生成模型，请在「设置 → 模型配置」中添加图片模型');
  }

  logger.info(`─── Image Generation [${cfg.model}] ───`);
  logger.info(`Prompt: ${opts.prompt.slice(0, 200)}`);

  const client = createOpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseUrl || undefined,
    compatibility: 'compatible',
  } as any);

  const result = await generateImage({
    model: client.image(cfg.model),
    prompt: opts.prompt,
    size: (opts.size as any) || '1792x1024',
  });

  logger.info(`Image generated: ${result.image.uint8Array.length} bytes`);
  return Buffer.from(result.image.uint8Array);
}
