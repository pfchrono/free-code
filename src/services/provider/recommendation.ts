import type { OllamaModelInfo, RankedOllamaModel, RecommendationGoal } from './types.js';

const CODING_HINTS = [
  'coder',
  'codellama',
  'codegemma',
  'codestral',
  'devstral',
  'starcoder',
  'deepseek-coder',
  'qwen2.5-coder',
  'qwen-coder',
];

const GENERAL_HINTS = [
  'llama',
  'qwen',
  'mistral',
  'gemma',
  'phi',
  'deepseek',
];

const INSTRUCT_HINTS = ['instruct', 'chat', 'assistant'];
const NON_CHAT_HINTS = ['embed', 'embedding', 'rerank', 'bge', 'whisper'];

function modelHaystack(model: OllamaModelInfo): string {
  return [
    model.name,
    model.family ?? '',
    model.parameterSize ?? '',
    model.quantizationLevel ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

export function isViableOllamaChatModel(model: OllamaModelInfo): boolean {
  return !includesAny(modelHaystack(model), NON_CHAT_HINTS);
}

function inferParameterBillions(model: OllamaModelInfo): number | null {
  const text = `${model.parameterSize ?? ''} ${model.name}`.toLowerCase();
  const match = text.match(/(\d+(?:\.\d+)?)\s*b\b/);
  if (match?.[1]) {
    return Number(match[1]);
  }
  if (model.size && model.size > 0) {
    return Number((model.size / 1_000_000_000).toFixed(1));
  }
  return null;
}

function quantizationBucket(model: OllamaModelInfo): string {
  return (model.quantizationLevel ?? model.name).toLowerCase();
}

function scoreSizeTier(
  paramsB: number | null,
  goal: RecommendationGoal,
  reasons: string[],
): number {
  if (paramsB === null) {
    reasons.push('unknown size');
    return 0;
  }

  if (goal === 'latency') {
    if (paramsB <= 4) {
      reasons.push('tiny model for low latency');
      return 32;
    }
    if (paramsB <= 8) {
      reasons.push('small model for fast responses');
      return 26;
    }
    if (paramsB <= 14) {
      reasons.push('mid-sized model with acceptable latency');
      return 16;
    }
    if (paramsB <= 24) {
      reasons.push('larger model may be slower');
      return 8;
    }
    reasons.push('large model likely slower locally');
    return paramsB <= 40 ? 0 : -8;
  }

  if (goal === 'coding') {
    if (paramsB >= 7 && paramsB <= 14) {
      reasons.push('strong coding size tier');
      return 24;
    }
    if (paramsB > 14 && paramsB <= 34) {
      reasons.push('large coding-capable size tier');
      return 28;
    }
    if (paramsB > 34) {
      reasons.push('very large model with higher quality potential');
      return 18;
    }
    reasons.push('compact model may trade off coding depth');
    return 12;
  }

  if (paramsB >= 7 && paramsB <= 14) {
    reasons.push('great balanced size tier');
    return 26;
  }
  if (paramsB >= 3 && paramsB < 7) {
    reasons.push('compact balanced size tier');
    return 18;
  }
  if (paramsB > 14 && paramsB <= 24) {
    reasons.push('high quality balanced size tier');
    return 20;
  }
  if (paramsB > 24) {
    reasons.push('large model for quality-first usage');
    return 10;
  }
  reasons.push('very small model for general usage');
  return 8;
}

function scoreQuantization(
  model: OllamaModelInfo,
  goal: RecommendationGoal,
  reasons: string[],
): number {
  const quant = quantizationBucket(model);
  if (quant.includes('q4')) {
    reasons.push('efficient Q4 quantization');
    return goal === 'latency' ? 8 : 4;
  }
  if (quant.includes('q5')) {
    reasons.push('balanced Q5 quantization');
    return goal === 'latency' ? 6 : 5;
  }
  if (quant.includes('q8')) {
    reasons.push('higher quality Q8 quantization');
    return goal === 'latency' ? 2 : 5;
  }
  return 0;
}

function compareRankedModels(
  a: RankedOllamaModel,
  b: RankedOllamaModel,
  goal: RecommendationGoal,
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const aSize = inferParameterBillions(a) ?? Number.POSITIVE_INFINITY;
  const bSize = inferParameterBillions(b) ?? Number.POSITIVE_INFINITY;

  if (goal === 'latency') {
    return aSize - bSize;
  }

  if (goal === 'coding') {
    return bSize - aSize;
  }

  const target = 14;
  return Math.abs(aSize - target) - Math.abs(bSize - target);
}

export function normalizeGoal(goal: string | null | undefined): RecommendationGoal {
  const normalized = goal?.trim().toLowerCase();
  if (normalized === 'latency' || normalized === 'balanced' || normalized === 'coding') {
    return normalized;
  }
  return 'balanced';
}

export function getGoalDefaultModel(goal: RecommendationGoal): string {
  switch (goal) {
    case 'latency':
      return 'gpt-4o-mini';
    case 'coding':
      return 'gpt-4o';
    case 'balanced':
    default:
      return 'gpt-4o';
  }
}

export function rankOllamaModels(
  models: OllamaModelInfo[],
  goal: RecommendationGoal,
): RankedOllamaModel[] {
  return models
    .filter(isViableOllamaChatModel)
    .map((model) => {
      const haystack = modelHaystack(model);
      const reasons: string[] = [];
      let score = 0;

      if (includesAny(haystack, CODING_HINTS)) {
        score += goal === 'coding' ? 24 : goal === 'balanced' ? 10 : 4;
        reasons.push('coding-oriented model family');
      }

      if (includesAny(haystack, GENERAL_HINTS)) {
        score += goal === 'latency' ? 4 : goal === 'coding' ? 6 : 8;
        reasons.push('strong general-purpose model family');
      }

      if (includesAny(haystack, INSTRUCT_HINTS)) {
        score += goal === 'latency' ? 2 : 6;
        reasons.push('chat/instruct tuned');
      }

      if (haystack.includes('vision') || haystack.includes('vl')) {
        score -= 2;
        reasons.push('vision model adds extra overhead');
      }

      score += scoreSizeTier(inferParameterBillions(model), goal, reasons);
      score += scoreQuantization(model, goal, reasons);

      const summary = reasons.slice(0, 3).join(', ');
      return {
        ...model,
        score,
        reasons,
        summary,
      };
    })
    .sort((a, b) => compareRankedModels(a, b, goal));
}

export function recommendOllamaModel(
  models: OllamaModelInfo[],
  goal: RecommendationGoal,
): RankedOllamaModel | null {
  const ranked = rankOllamaModels(models, goal);
  return ranked[0] ?? null;
}
