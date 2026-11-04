import { chat } from '@forge/llm';
import { LLM_MODEL } from '../lib/constants.js';

function contentToString(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return '';
}

export async function completeJson(messages) {
  const response = await chat({
    model: LLM_MODEL,
    max_completion_tokens: 900,
    messages,
  });
  return contentToString(response?.choices?.[0]?.message?.content);
}
