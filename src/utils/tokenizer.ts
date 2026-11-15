import {CloudRegion, ModelSpec} from '../data/models';

export interface TokenChunk {
  text: string;
  index: number;
  kind: 'word' | 'whitespace' | 'punctuation' | 'number' | 'symbol';
}

export interface TextMetrics {
  tokens: number;
  characters: number;
  words: number;
  lines: number;
  avgCharsPerToken: number;
}

export interface EfficiencyDiagnostic {
  id: string;
  severity: 'info' | 'warning';
  title: string;
  detail: string;
  estimatedTokenSavings: number;
  actionType?: 'compact-whitespace' | 'minify-json';
}

export interface PromptCostBreakdown {
  systemTokens: number;
  contextTokens: number;
  userTokens: number;
  framingOverheadTokens: number;
  totalInputTokens: number;
  expectedOutputTokens: number;
  totalTokensPerRequest: number;
  contextUtilizationPct: number;
  contextStatus: 'Nominal' | 'Approaching Limit' | 'Exceeds Window';
  outputExceedsMax: boolean;
  uncachedInputCostPerReq: number;
  cachedInputCostPerReq: number;
  effectiveInputCostPerReq: number;
  outputCostPerReq: number;
  totalCostPerReq: number;
  costPer1kRequests: number;
  dailyCost: number;
  monthlyCost: number;
  monthlyCacheSavings: number;
  monthlyTotalTokens: number;
  carbonGramsPer1kRequests: number;
  monthlyCarbonKg: number;
  estimatedTtftMs: number;
  estimatedTotalLatencyMs: number;
  networkRttMs: number;
}

/**
 * Deterministic BPE-style subword chunker.
 * Splits text into realistic token segments (subwords, leading spaces, digits, punctuation)
 * matching cl100k / Gemini SentencePiece empirical densities (~3.8-4.1 chars/token on prose,
 * ~2.6-3.2 chars/token on JSON/code).
 */
export function tokenizeText(input: string): TokenChunk[] {
  if (!input) return [];

  // Match: leading space + word chunk (up to 7 chars for long words), numbers in 1-3 digit groups,
  // repeated whitespace, or punctuation/symbols.
  const pattern =
    /\r\n|\n|[ \t]+| ?[A-Za-z]{1,7}(?:'[A-Za-z]{1,3})?|[0-9]{1,3}|[^\sA-Za-z0-9]/g;

  const chunks: TokenChunk[] = [];
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(input)) !== null) {
    const text = match[0];
    let kind: TokenChunk['kind'] = 'word';

    if (/^\s+$/.test(text)) {
      kind = 'whitespace';
    } else if (/^[0-9]+$/.test(text)) {
      kind = 'number';
    } else if (/^[.,;:!?'"()[\]{}]$/.test(text)) {
      kind = 'punctuation';
    } else if (/^[^\sA-Za-z0-9]+$/.test(text)) {
      kind = 'symbol';
    }

    chunks.push({
      text,
      index: idx++,
      kind,
    });
  }

  return chunks;
}

export function measureText(input: string): TextMetrics {
  const chunks = tokenizeText(input);
  const tokens = chunks.length;
  const characters = input.length;
  const trimmed = input.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const lines = input ? input.split(/\r\n|\r|\n/).length : 0;
  const avgCharsPerToken = tokens > 0 ? characters / tokens : 0;

  return {
    tokens,
    characters,
    words,
    lines,
    avgCharsPerToken,
  };
}

export function analyzePromptEfficiency(
  systemPrompt: string,
  contextPayload: string,
  userPrompt: string
): EfficiencyDiagnostic[] {
  const diagnostics: EfficiencyDiagnostic[] = [];
  const combined = `${systemPrompt}\n${contextPayload}\n${userPrompt}`;

  // Check 1: Excessive consecutive spaces/blank lines
  const excessiveWhitespaceMatches = combined.match(/[ \t]{3,}|\n{3,}/g);
  if (excessiveWhitespaceMatches && excessiveWhitespaceMatches.length > 0) {
    const compacted = compactWhitespace(combined);
    const saved = Math.max(1, tokenizeText(combined).length - tokenizeText(compacted).length);
    diagnostics.push({
      id: 'whitespace-bloat',
      severity: 'info',
      title: 'Excessive indentation or blank lines detected',
      detail: `Found ${excessiveWhitespaceMatches.length} blocks of repeated spaces or blank lines that consume extra whitespace tokens.`,
      estimatedTokenSavings: saved,
      actionType: 'compact-whitespace',
    });
  }

  // Check 2: Pretty-printed JSON in context payload
  const trimmedCtx = contextPayload.trim();
  if (trimmedCtx.startsWith('{') || trimmedCtx.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmedCtx);
      const minified = JSON.stringify(parsed);
      if (minified.length < trimmedCtx.length * 0.88) {
        const beforeTokens = tokenizeText(trimmedCtx).length;
        const afterTokens = tokenizeText(minified).length;
        const saved = Math.max(1, beforeTokens - afterTokens);
        diagnostics.push({
          id: 'unminified-json',
          severity: 'warning',
          title: 'Pretty-printed JSON inflates context tokens',
          detail: `Minifying the JSON context removes formatting indentation and saves ~${saved} tokens per request.`,
          estimatedTokenSavings: saved,
          actionType: 'minify-json',
        });
      }
    } catch {
      // Not valid pure JSON; ignore
    }
  }

  // Check 3: High system prompt share
  const sysTokens = tokenizeText(systemPrompt).length;
  const usrTokens = tokenizeText(userPrompt).length;
  if (sysTokens > 150 && sysTokens > usrTokens * 3) {
    diagnostics.push({
      id: 'caching-recommended',
      severity: 'info',
      title: 'Static instructions dominate input volume',
      detail: `System instructions (${sysTokens} tok) are >3x larger than the user query (${usrTokens} tok). Enabling prompt caching on the shared prefix significantly reduces input spend.`,
      estimatedTokenSavings: Math.round(sysTokens * 0.75),
    });
  }

  return diagnostics;
}

export function compactWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function tryMinifyJson(text: string): {changed: boolean; result: string} {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return {changed: false, result: text};
  }
  try {
    const parsed = JSON.parse(trimmed);
    const minified = JSON.stringify(parsed);
    return {changed: minified !== text, result: minified};
  } catch {
    return {changed: false, result: text};
  }
}

export function haversineDistanceKm(
  a: {lat: number; lng: number},
  b: {lat: number; lng: number}
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimates round-trip fiber-optic latency (ms) between user coordinates and a cloud region.
 * Uses realistic ~1.48 refractive index in fiber + routing path stretch (~1.3x great-circle)
 * plus baseline local access/TLS hop (14ms).
 */
export function estimateNetworkRttMs(
  userLocation: {lat: number; lng: number} | null,
  region: CloudRegion
): number {
  if (!userLocation) {
    return 28; // Default baseline metro-to-region RTT when no origin city is pinned
  }
  const distanceKm = haversineDistanceKm(userLocation, region.coordinates);
  const roundTripFiberKm = distanceKm * 2 * 1.3;
  const speedOfLightInFiberKmPerMs = 200; // ~200,000 km/s
  return Math.round(14 + roundTripFiberKm / speedOfLightInFiberKmPerMs);
}

export interface CalculateCostInput {
  systemPrompt: string;
  contextPayload: string;
  userPrompt: string;
  expectedOutputTokens: number;
  requestsPerDay: number;
  cacheHitRate: number; // 0..100
  useBatchApi: boolean;
  model: ModelSpec;
  region: CloudRegion;
  userLocation: {lat: number; lng: number} | null;
}

export function calculatePromptCosts(input: CalculateCostInput): PromptCostBreakdown {
  const systemTokens = tokenizeText(input.systemPrompt).length;
  const contextTokens = tokenizeText(input.contextPayload).length;
  const userTokens = tokenizeText(input.userPrompt).length;
  // ChatML / API message framing overhead (system + user role markers)
  const framingOverheadTokens =
    (systemTokens > 0 ? 4 : 0) + (contextTokens > 0 ? 4 : 0) + (userTokens > 0 ? 4 : 0);

  const totalInputTokens = systemTokens + contextTokens + userTokens + framingOverheadTokens;
  const expectedOutputTokens = Math.max(0, input.expectedOutputTokens);
  const totalTokensPerRequest = totalInputTokens + expectedOutputTokens;

  const contextUtilizationPct =
    input.model.contextWindow > 0
      ? (totalTokensPerRequest / input.model.contextWindow) * 100
      : 0;

  let contextStatus: PromptCostBreakdown['contextStatus'] = 'Nominal';
  if (contextUtilizationPct > 100) {
    contextStatus = 'Exceeds Window';
  } else if (contextUtilizationPct >= 80) {
    contextStatus = 'Approaching Limit';
  }

  const outputExceedsMax = expectedOutputTokens > input.model.maxOutputTokens;

  const batchFactor =
    input.useBatchApi && input.model.supportsBatchDiscount ? 0.5 : 1.0;

  const uncachedRatePerToken = (input.model.inputPerMillion / 1_000_000) * batchFactor;
  const cachedRatePerToken =
    input.model.cachedInputPerMillion !== null
      ? (input.model.cachedInputPerMillion / 1_000_000) * batchFactor
      : uncachedRatePerToken;
  const outputRatePerToken = (input.model.outputPerMillion / 1_000_000) * batchFactor;

  // Cacheable prefix is System + Context/RAG payload
  const cacheablePrefixTokens = systemTokens + contextTokens;
  const nonCacheableTokens = userTokens + framingOverheadTokens;
  const cacheRatio = Math.min(1, Math.max(0, input.cacheHitRate / 100));

  const uncachedInputCostPerReq = totalInputTokens * uncachedRatePerToken;
  const cachedInputCostPerReq =
    cacheablePrefixTokens * cachedRatePerToken + nonCacheableTokens * uncachedRatePerToken;

  const effectiveInputCostPerReq =
    uncachedInputCostPerReq * (1 - cacheRatio) + cachedInputCostPerReq * cacheRatio;

  const outputCostPerReq = expectedOutputTokens * outputRatePerToken;
  const totalCostPerReq = effectiveInputCostPerReq + outputCostPerReq;
  const costPer1kRequests = totalCostPerReq * 1000;
  const dailyCost = totalCostPerReq * input.requestsPerDay;
  const monthlyCost = dailyCost * 30;

  const monthlyUncachedTotal =
    (uncachedInputCostPerReq + outputCostPerReq) * input.requestsPerDay * 30;
  const monthlyCacheSavings = Math.max(0, monthlyUncachedTotal - monthlyCost);

  const monthlyTotalTokens = totalTokensPerRequest * input.requestsPerDay * 30;

  // Energy & regional carbon calculation
  // Wh per request = (totalTokens / 1000) * model.energyWhPer1kTokens * region.pue
  const whPerReq =
    (totalTokensPerRequest / 1000) * input.model.energyWhPer1kTokens * input.region.pue;
  const kwhPer1kReq = whPerReq; // (whPerReq * 1000) / 1000
  const carbonGramsPer1kRequests =
    kwhPer1kReq * input.region.gridCarbonIntensityGPerKwh;
  const monthlyCarbonKg =
    ((carbonGramsPer1kRequests / 1000) * input.requestsPerDay * 30) / 1000;

  // Network & inference latency
  const networkRttMs = estimateNetworkRttMs(input.userLocation, input.region);
  const prefillMs = Math.round(totalInputTokens * 0.08);
  const estimatedTtftMs = networkRttMs + input.model.baseTtftMs + prefillMs;
  const generationMs =
    input.model.avgTokensPerSecond > 0
      ? Math.round((expectedOutputTokens / input.model.avgTokensPerSecond) * 1000)
      : 0;
  const estimatedTotalLatencyMs = estimatedTtftMs + generationMs;

  return {
    systemTokens,
    contextTokens,
    userTokens,
    framingOverheadTokens,
    totalInputTokens,
    expectedOutputTokens,
    totalTokensPerRequest,
    contextUtilizationPct,
    contextStatus,
    outputExceedsMax,
    uncachedInputCostPerReq,
    cachedInputCostPerReq,
    effectiveInputCostPerReq,
    outputCostPerReq,
    totalCostPerReq,
    costPer1kRequests,
    dailyCost,
    monthlyCost,
    monthlyCacheSavings,
    monthlyTotalTokens,
    carbonGramsPer1kRequests,
    monthlyCarbonKg,
    estimatedTtftMs,
    estimatedTotalLatencyMs,
    networkRttMs,
  };
}

export function formatCurrency(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.0001) return `$${amount.toFixed(6)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompactNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}
