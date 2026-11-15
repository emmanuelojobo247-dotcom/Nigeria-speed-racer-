export type ModelProvider = 'Google' | 'Anthropic' | 'OpenAI' | 'DeepSeek';

export interface ModelSpec {
  id: string;
  name: string;
  provider: ModelProvider;
  contextWindow: number;
  maxOutputTokens: number;
  inputPerMillion: number;
  cachedInputPerMillion: number | null;
  outputPerMillion: number;
  supportsBatchDiscount: boolean;
  avgTokensPerSecond: number;
  baseTtftMs: number;
  energyWhPer1kTokens: number;
  tierLabel: string;
}

export interface CloudRegion {
  id: string;
  code: string;
  name: string;
  city: string;
  jurisdiction: string;
  coordinates: {lat: number; lng: number};
  gridCarbonIntensityGPerKwh: number;
  pue: number;
  note: string;
}

export interface PromptPreset {
  id: string;
  label: string;
  summary: string;
  systemPrompt: string;
  contextPayload: string;
  userPrompt: string;
  expectedOutputTokens: number;
  requestsPerDay: number;
  cacheHitRate: number;
}

export const MODEL_CATALOG: ModelSpec[] = [
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.31,
    outputPerMillion: 10.0,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 92,
    baseTtftMs: 420,
    energyWhPer1kTokens: 0.42,
    tierLabel: 'Reasoning & Long Context',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.0375,
    outputPerMillion: 0.6,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 175,
    baseTtftMs: 210,
    energyWhPer1kTokens: 0.14,
    tierLabel: 'Balanced Speed & Cost',
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash-Lite',
    provider: 'Google',
    contextWindow: 1_048_576,
    maxOutputTokens: 65_536,
    inputPerMillion: 0.075,
    cachedInputPerMillion: 0.01875,
    outputPerMillion: 0.3,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 240,
    baseTtftMs: 140,
    energyWhPer1kTokens: 0.09,
    tierLabel: 'High-Volume Throughput',
  },
  {
    id: 'claude-opus-4',
    name: 'Claude Opus 4',
    provider: 'Anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    inputPerMillion: 15.0,
    cachedInputPerMillion: 1.5,
    outputPerMillion: 75.0,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 48,
    baseTtftMs: 680,
    energyWhPer1kTokens: 0.78,
    tierLabel: 'Frontier Complex Tasks',
  },
  {
    id: 'claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 64_000,
    inputPerMillion: 3.0,
    cachedInputPerMillion: 0.3,
    outputPerMillion: 15.0,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 82,
    baseTtftMs: 410,
    energyWhPer1kTokens: 0.4,
    tierLabel: 'Code & Analysis Workhorse',
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputPerMillion: 0.8,
    cachedInputPerMillion: 0.08,
    outputPerMillion: 4.0,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 145,
    baseTtftMs: 240,
    energyWhPer1kTokens: 0.16,
    tierLabel: 'Low-Latency Assistant',
  },
  {
    id: 'gpt-4.1',
    name: 'GPT-4.1',
    provider: 'OpenAI',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    inputPerMillion: 2.0,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 8.0,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 86,
    baseTtftMs: 390,
    energyWhPer1kTokens: 0.45,
    tierLabel: 'Instruction & Coding',
  },
  {
    id: 'gpt-4.1-mini',
    name: 'GPT-4.1 mini',
    provider: 'OpenAI',
    contextWindow: 1_000_000,
    maxOutputTokens: 32_768,
    inputPerMillion: 0.4,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 1.6,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 160,
    baseTtftMs: 230,
    energyWhPer1kTokens: 0.15,
    tierLabel: 'Cost-Optimized General',
  },
  {
    id: 'o3-mini',
    name: 'o3-mini',
    provider: 'OpenAI',
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputPerMillion: 1.1,
    cachedInputPerMillion: 0.55,
    outputPerMillion: 4.4,
    supportsBatchDiscount: true,
    avgTokensPerSecond: 115,
    baseTtftMs: 520,
    energyWhPer1kTokens: 0.36,
    tierLabel: 'STEM & Reasoning',
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    provider: 'DeepSeek',
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputPerMillion: 0.27,
    cachedInputPerMillion: 0.07,
    outputPerMillion: 1.1,
    supportsBatchDiscount: false,
    avgTokensPerSecond: 75,
    baseTtftMs: 460,
    energyWhPer1kTokens: 0.31,
    tierLabel: 'Open-Weight MoE',
  },
];

export const CLOUD_REGIONS: CloudRegion[] = [
  {
    id: 'us-central1',
    code: 'us-central1',
    name: 'Iowa (North America)',
    city: 'Council Bluffs, US',
    jurisdiction: 'US Residency',
    coordinates: {lat: 41.2619, lng: -95.8608},
    gridCarbonIntensityGPerKwh: 385,
    pue: 1.1,
    note: 'Central US backbone with wind-heavy off-peak generation.',
  },
  {
    id: 'us-west1',
    code: 'us-west1',
    name: 'Oregon (US West)',
    city: 'The Dalles, US',
    jurisdiction: 'US Residency',
    coordinates: {lat: 45.5946, lng: -121.1787},
    gridCarbonIntensityGPerKwh: 112,
    pue: 1.09,
    note: 'Hydro-backed Pacific Northwest corridor for low-carbon inference.',
  },
  {
    id: 'us-east4',
    code: 'us-east4',
    name: 'Northern Virginia (US East)',
    city: 'Ashburn, US',
    jurisdiction: 'US Residency',
    coordinates: {lat: 39.0438, lng: -77.4874},
    gridCarbonIntensityGPerKwh: 332,
    pue: 1.12,
    note: 'High-density Atlantic peering hub for East Coast & transatlantic traffic.',
  },
  {
    id: 'europe-west1',
    code: 'europe-west1',
    name: 'Belgium (EU West)',
    city: 'Saint-Ghislain, BE',
    jurisdiction: 'EEA / GDPR',
    coordinates: {lat: 50.4491, lng: 3.8185},
    gridCarbonIntensityGPerKwh: 145,
    pue: 1.09,
    note: 'EU data boundary compliant with low-carbon European grid mix.',
  },
  {
    id: 'europe-west3',
    code: 'europe-west3',
    name: 'Frankfurt (EU Central)',
    city: 'Frankfurt, DE',
    jurisdiction: 'EEA / GDPR',
    coordinates: {lat: 50.1109, lng: 8.6821},
    gridCarbonIntensityGPerKwh: 320,
    pue: 1.13,
    note: 'Primary DACH financial & enterprise low-latency exchange.',
  },
  {
    id: 'europe-west2',
    code: 'europe-west2',
    name: 'London (UK)',
    city: 'London, UK',
    jurisdiction: 'UK GDPR',
    coordinates: {lat: 51.5072, lng: -0.1276},
    gridCarbonIntensityGPerKwh: 198,
    pue: 1.12,
    note: 'UK sovereign residency with sub-10ms London metro access.',
  },
  {
    id: 'asia-northeast1',
    code: 'asia-northeast1',
    name: 'Tokyo (APAC East)',
    city: 'Tokyo, JP',
    jurisdiction: 'APAC / Japan',
    coordinates: {lat: 35.6762, lng: 139.6503},
    gridCarbonIntensityGPerKwh: 438,
    pue: 1.14,
    note: 'Low-jitter East Asia inference node serving Japan & Korea.',
  },
  {
    id: 'asia-southeast1',
    code: 'asia-southeast1',
    name: 'Singapore (APAC South)',
    city: 'Jurong West, SG',
    jurisdiction: 'APAC / ASEAN',
    coordinates: {lat: 1.3521, lng: 103.8198},
    gridCarbonIntensityGPerKwh: 405,
    pue: 1.15,
    note: 'Primary ASEAN subsea cable hub serving Southeast Asia.',
  },
  {
    id: 'australia-southeast1',
    code: 'australia-southeast1',
    name: 'Sydney (Oceania)',
    city: 'Sydney, AU',
    jurisdiction: 'Australia',
    coordinates: {lat: -33.8688, lng: 151.2093},
    gridCarbonIntensityGPerKwh: 510,
    pue: 1.14,
    note: 'Australian sovereign endpoint for ANZ enterprise workloads.',
  },
  {
    id: 'southamerica-east1',
    code: 'southamerica-east1',
    name: 'São Paulo (LATAM)',
    city: 'Osasco, BR',
    jurisdiction: 'LGPD / Brazil',
    coordinates: {lat: -23.5505, lng: -46.6333},
    gridCarbonIntensityGPerKwh: 96,
    pue: 1.13,
    note: 'Hydro-dominant Latin America hub with ultra-low grid carbon.',
  },
];

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'rag-support',
    label: 'RAG Support Triage',
    summary: 'System policy + retrieved KB snippets + customer ticket classification',
    systemPrompt: `You are a tier-2 technical support triage assistant. Classify incoming tickets by severity, extract account identifiers, and draft a concise resolution grounded strictly in the provided knowledge base excerpts. Return valid JSON matching the schema: {"severity": "P1|P2|P3", "category": string, "citations": string[], "reply": string}.`,
    contextPayload: `{
  "kb_articles": [
    {
      "id": "KB-412",
      "title": "SSO SAML Clock Skew Resolution",
      "body": "If SAML assertions fail with AADSTS50012, verify IdP NTP synchronization within 120 seconds and confirm the ACS URL matches the tenant primary domain."
    },
    {
      "id": "KB-508",
      "title": "Webhook Retry Backoff Schedule",
      "body": "Failed webhook deliveries retry with exponential backoff at 1m, 5m, 30m, and 2h intervals before moving to the dead-letter queue."
    }
  ]
}`,
    userPrompt: `Customer reports intermittent 401 errors on SAML login every morning around 08:00 UTC for EU workspace users, and webhook delivery logs show 3 retries before succeeding. Summarize root causes and next steps.`,
    expectedOutputTokens: 320,
    requestsPerDay: 4500,
    cacheHitRate: 65,
  },
  {
    id: 'sql-analyst',
    label: 'SQL Schema Generator',
    summary: 'Database DDL schema context + natural language analytics query',
    systemPrompt: `You are a PostgreSQL query compiler. Generate read-only SELECT statements using explicit column aliases, CTEs where helpful, and indexed timestamp predicates. Never emit DML or DDL statements.`,
    contextPayload: `CREATE TABLE orders (
  order_id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  region_code TEXT NOT NULL,
  subtotal_cents BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_orders_org_created ON orders (org_id, created_at DESC);`,
    userPrompt: `Calculate 30-day rolling net revenue in USD-equivalent cents grouped by region_code for the top 5 regions, excluding refunded orders.`,
    expectedOutputTokens: 240,
    requestsPerDay: 1800,
    cacheHitRate: 80,
  },
  {
    id: 'geo-concierge',
    label: 'Geo-Grounded Itinerary',
    summary: 'Location-aware prompt ready for live Google Places context testing',
    systemPrompt: `You are a neighborhood logistics planner. Using only verified place attributes supplied in the context block, estimate transit pacing, highlight accessibility notes, and output a structured stop sequence without inventing addresses or opening hours.`,
    contextPayload: `{
  "trip_constraints": {
    "pace": "moderate",
    "max_walking_minutes_between_stops": 18,
    "output_format": "markdown_table"
  }
}`,
    userPrompt: `Build a half-day neighborhood walkthrough around the supplied destination anchor with clear time buffers and transit options.`,
    expectedOutputTokens: 520,
    requestsPerDay: 2500,
    cacheHitRate: 35,
  },
  {
    id: 'legal-extraction',
    label: 'Contract Clause Extractor',
    summary: 'Dense MSA excerpt for high-input-token cost benchmarking',
    systemPrompt: `Extract indemnification caps, termination notice windows, governing law jurisdiction, and SLA credit thresholds into strict JSON. Quote exact clause numbers.`,
    contextPayload: `SECTION 8. LIMITATION OF LIABILITY. EXCEPT FOR BREACHES OF CONFIDENTIALITY (SECTION 6) OR INDEMNIFICATION OBLIGATIONS (SECTION 9), IN NO EVENT SHALL EITHER PARTY'S AGGREGATE LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT EXCEED THE TOTAL FEES PAID OR PAYABLE BY CUSTOMER IN THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE FIRST EVENT GIVING RISE TO LIABILITY.
SECTION 11. TERM AND TERMINATION. This Agreement commences on the Effective Date and continues for an initial term of twenty-four (24) months, renewing automatically for successive twelve (12) month periods unless either party delivers written notice of non-renewal at least sixty (60) days prior to the end of the then-current term.
SECTION 14. GOVERNING LAW. This Agreement is governed by the laws of the State of Delaware, excluding its conflict-of-laws principles.`,
    userPrompt: `Identify all liability caps, renewal notice deadlines, and carve-outs in the excerpt above.`,
    expectedOutputTokens: 410,
    requestsPerDay: 900,
    cacheHitRate: 50,
  },
];
