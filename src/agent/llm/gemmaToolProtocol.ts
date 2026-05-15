import type { OpenAIToolDefinition } from '../tools/BaseTool';

function gemmaValue(value: unknown): string {
  if (typeof value === 'string') return `<|"|>${value}<|"|>`;
  if (Array.isArray(value)) return `[${value.map(gemmaValue).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).map(([key, nested]) => `${key}:${gemmaValue(nested)}`).join(',')}}`;
  }
  return String(value);
}

export function formatToolDeclaration(tool: OpenAIToolDefinition): string {
  const body = {
    description: tool.function.description,
    parameters: tool.function.parameters,
  };
  return `<|tool>declaration:${tool.function.name}${gemmaValue(body)}<tool|>`;
}

export function formatToolCall(name: string, args: string): string {
  const parsed = JSON.parse(args) as Record<string, unknown>;
  return `<|tool_call>call:${name}${gemmaValue(parsed)}<tool_call|>`;
}

export function formatToolResponse(name: string, result: unknown): string {
  return `<|tool_response>response:${name}${gemmaValue(result)}<tool_response|>`;
}

function parseGemmaValue(str: string, pos: number): { value: unknown; next: number } {
  while (pos < str.length && str[pos] === ' ') pos += 1;

  const stringDelimiter = '<|"|>';
  if (str.startsWith(stringDelimiter, pos)) {
    const start = pos + stringDelimiter.length;
    const end = str.indexOf(stringDelimiter, start);
    if (end === -1) {
      return { value: '', next: str.length };
    }
    return { value: str.slice(start, end), next: end + stringDelimiter.length };
  }

  if (str[pos] === '{') {
    const result: Record<string, unknown> = {};
    pos += 1;
    while (pos < str.length && str[pos] !== '}') {
      while (pos < str.length && (str[pos] === ',' || str[pos] === ' ')) pos += 1;
      if (str[pos] === '}') break;
      const colonIndex = str.indexOf(':', pos);
      if (colonIndex === -1) break;
      const key = str.slice(pos, colonIndex).trim();
      pos = colonIndex + 1;
      const nested = parseGemmaValue(str, pos);
      result[key] = nested.value;
      pos = nested.next;
    }
    return { value: result, next: pos + 1 };
  }

  if (str[pos] === '[') {
    const result: unknown[] = [];
    pos += 1;
    while (pos < str.length && str[pos] !== ']') {
      while (pos < str.length && (str[pos] === ',' || str[pos] === ' ')) pos += 1;
      if (str[pos] === ']') break;
      const nested = parseGemmaValue(str, pos);
      result.push(nested.value);
      pos = nested.next;
    }
    return { value: result, next: pos + 1 };
  }

  let end = pos;
  while (end < str.length && str[end] !== ',' && str[end] !== '}' && str[end] !== ']') end += 1;
  const raw = str.slice(pos, end).trim();
  if (raw === 'true') return { value: true, next: end };
  if (raw === 'false') return { value: false, next: end };
  if (raw !== '' && !Number.isNaN(Number(raw))) return { value: Number(raw), next: end };
  return { value: raw, next: end };
}

function parseArgs(argsStr: string): Record<string, unknown> {
  const parsed = parseGemmaValue(`{${argsStr}}`, 0).value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  return parsed as Record<string, unknown>;
}

export interface ParsedGemmaToolCall {
  name: string;
  args: Record<string, unknown>;
  fullMatch: string;
  index: number;
  endIndex: number;
}

export function parseToolCalls(text: string): ParsedGemmaToolCall[] {
  const prefix = '<|tool_call>call:';
  const suffix = '<tool_call|>';
  const stringDelimiter = '<|"|>';
  const calls: ParsedGemmaToolCall[] = [];
  let searchFrom = 0;

  while (true) {
    const prefixIndex = text.indexOf(prefix, searchFrom);
    if (prefixIndex === -1) break;

    const braceStart = text.indexOf('{', prefixIndex + prefix.length);
    if (braceStart === -1) break;
    const name = text.slice(prefixIndex + prefix.length, braceStart).trim();

    let depth = 1;
    let index = braceStart + 1;
    while (index < text.length && depth > 0) {
      if (text.startsWith(stringDelimiter, index)) {
        const stringEnd = text.indexOf(stringDelimiter, index + stringDelimiter.length);
        index = stringEnd === -1 ? text.length : stringEnd + stringDelimiter.length;
        continue;
      }
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') depth -= 1;
      index += 1;
    }
    const braceEnd = index;
    const suffixIndex = text.indexOf(suffix, braceEnd);
    if (suffixIndex === -1) break;

    const argsStr = text.slice(braceStart + 1, braceEnd - 1);
    const endIndex = suffixIndex + suffix.length;
    calls.push({
      name,
      args: parseArgs(argsStr),
      fullMatch: text.slice(prefixIndex, endIndex),
      index: prefixIndex,
      endIndex,
    });
    searchFrom = endIndex;
  }

  return calls;
}

export function stripToolProtocol(text: string): string {
  let result = text.replace(
    /<\|tool_call>call:(\w+)\{[\s\S]*?\}<tool_call\|><\|tool_response>[\s\S]*?<tool_response\|>/g,
    '[Tool call completed]',
  );
  result = result.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '');
  result = result.replace(/<\|channel>thought[\s\S]*/g, '');
  result = result.replace(/<\|tool_call>[\s\S]*/g, '');
  result = result.replace(/<\|tool_response>[\s\S]*/g, '');
  result = result.replace(/<\|"\|>/g, '');
  return result.trimStart();
}
