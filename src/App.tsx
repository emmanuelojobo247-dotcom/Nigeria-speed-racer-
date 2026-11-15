import {useCallback, useEffect, useMemo, useState} from 'react';
import {APIProvider} from '@vis.gl/react-google-maps';
import {
  CLOUD_REGIONS,
  MODEL_CATALOG,
  PROMPT_PRESETS,
  PromptPreset,
} from './data/models';
import {
  analyzePromptEfficiency,
  calculatePromptCosts,
  compactWhitespace,
  formatCompactNumber,
  formatCurrency,
  measureText,
  tryMinifyJson,
} from './utils/tokenizer';
import {TokenInspector} from './components/TokenInspector';
import {ModelMatrixView} from './components/ModelMatrixView';
import {
  GeoLatencyPanel,
  SelectedOriginPlace,
} from './components/GeoLatencyPanel';
import {
  PromptSnapshot,
  SavedSnapshotsView,
} from './components/SavedSnapshotsView';
import {
  BookmarkPlus,
  Download,
  Globe,
  RotateCcw,
  Wrench,
} from 'lucide-react';

type ActiveView = 'calculator' | 'matrix' | 'geo' | 'saved';

const STORAGE_KEY = 'promptledger_snapshots_v1';
const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

function loadStoredSnapshots(): PromptSnapshot[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const initialPreset = PROMPT_PRESETS[0];

  const [activeView, setActiveView] = useState<ActiveView>('calculator');
  const [editorMode, setEditorMode] = useState<'compose' | 'inspect'>('compose');
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState(initialPreset.systemPrompt);
  const [contextPayload, setContextPayload] = useState(
    initialPreset.contextPayload
  );
  const [userPrompt, setUserPrompt] = useState(initialPreset.userPrompt);
  const [expectedOutputTokens, setExpectedOutputTokens] = useState(
    initialPreset.expectedOutputTokens
  );
  const [requestsPerDay, setRequestsPerDay] = useState(
    initialPreset.requestsPerDay
  );
  const [cacheHitRate, setCacheHitRate] = useState(initialPreset.cacheHitRate);
  const [useBatchApi, setUseBatchApi] = useState(false);

  const [selectedModelId, setSelectedModelId] = useState(MODEL_CATALOG[1].id);
  const [activeRegionId, setActiveRegionId] = useState(CLOUD_REGIONS[0].id);
  const [userOrigin, setUserOrigin] = useState<SelectedOriginPlace | null>(null);

  const [snapshots, setSnapshots] = useState<PromptSnapshot[]>(loadStoredSnapshots);
  const [snapshotName, setSnapshotName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    } catch {
      // Ignore storage quota issues
    }
  }, [snapshots]);

  const showTransientNotice = useCallback((message: string) => {
    setStatusNotice(message);
    setTimeout(() => {
      setStatusNotice((prev) => (prev === message ? null : prev));
    }, 2800);
  }, []);

  const selectedModel = useMemo(
    () =>
      MODEL_CATALOG.find((m) => m.id === selectedModelId) ?? MODEL_CATALOG[0],
    [selectedModelId]
  );

  const activeRegion = useMemo(
    () =>
      CLOUD_REGIONS.find((r) => r.id === activeRegionId) ?? CLOUD_REGIONS[0],
    [activeRegionId]
  );

  const systemMetrics = useMemo(() => measureText(systemPrompt), [systemPrompt]);
  const contextMetrics = useMemo(
    () => measureText(contextPayload),
    [contextPayload]
  );
  const userMetrics = useMemo(() => measureText(userPrompt), [userPrompt]);

  const diagnostics = useMemo(
    () => analyzePromptEfficiency(systemPrompt, contextPayload, userPrompt),
    [systemPrompt, contextPayload, userPrompt]
  );

  const breakdown = useMemo(
    () =>
      calculatePromptCosts({
        systemPrompt,
        contextPayload,
        userPrompt,
        expectedOutputTokens,
        requestsPerDay,
        cacheHitRate,
        useBatchApi,
        model: selectedModel,
        region: activeRegion,
        userLocation: userOrigin ? userOrigin.location : null,
      }),
    [
      systemPrompt,
      contextPayload,
      userPrompt,
      expectedOutputTokens,
      requestsPerDay,
      cacheHitRate,
      useBatchApi,
      selectedModel,
      activeRegion,
      userOrigin,
    ]
  );

  const handleLoadPreset = (preset: PromptPreset) => {
    setSystemPrompt(preset.systemPrompt);
    setContextPayload(preset.contextPayload);
    setUserPrompt(preset.userPrompt);
    setExpectedOutputTokens(preset.expectedOutputTokens);
    setRequestsPerDay(preset.requestsPerDay);
    setCacheHitRate(preset.cacheHitRate);
    showTransientNotice(`Loaded "${preset.label}" preset`);
  };

  const handleClearPrompt = () => {
    setSystemPrompt('');
    setContextPayload('');
    setUserPrompt('');
    setExpectedOutputTokens(250);
    showTransientNotice('Cleared prompt fields');
  };

  const handleCompactWhitespace = () => {
    setSystemPrompt((prev) => compactWhitespace(prev));
    setContextPayload((prev) => compactWhitespace(prev));
    setUserPrompt((prev) => compactWhitespace(prev));
    showTransientNotice('Compacted redundant whitespace');
  };

  const handleMinifyJson = () => {
    const res = tryMinifyJson(contextPayload);
    if (res.changed) {
      setContextPayload(res.result);
      showTransientNotice('Minified JSON context payload');
    }
  };

  const handleInjectPlaceToContext = (place: SelectedOriginPlace) => {
    const payload = JSON.stringify(
      {
        grounding_place: {
          place_id: place.placeId,
          display_name: place.displayName,
          formatted_address: place.formattedAddress,
          location: place.location,
        },
      },
      null,
      2
    );
    setContextPayload(payload);
    setActiveView('calculator');
    showTransientNotice(`Added ${place.displayName} context to prompt`);
  };

  const handleSaveSnapshot = (customName?: string) => {
    const label =
      (customName ?? snapshotName).trim() ||
      `Revision ${snapshots.length + 1} (${selectedModel.name})`;
    const next: PromptSnapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: label,
      createdAt: new Date().toISOString(),
      modelId: selectedModel.id,
      regionId: activeRegion.id,
      systemPrompt,
      contextPayload,
      userPrompt,
      expectedOutputTokens,
      requestsPerDay,
      cacheHitRate,
      useBatchApi,
    };
    setSnapshots((prev) => [next, ...prev]);
    setSnapshotName('');
    setShowSaveForm(false);
    showTransientNotice(`Saved "${label}"`);
  };

  const handleLoadSnapshot = (snap: PromptSnapshot) => {
    setSystemPrompt(snap.systemPrompt);
    setContextPayload(snap.contextPayload);
    setUserPrompt(snap.userPrompt);
    setExpectedOutputTokens(snap.expectedOutputTokens);
    setRequestsPerDay(snap.requestsPerDay);
    setCacheHitRate(snap.cacheHitRate);
    setUseBatchApi(snap.useBatchApi);
    setSelectedModelId(snap.modelId);
    setActiveRegionId(snap.regionId);
    setActiveView('calculator');
    showTransientNotice(`Restored "${snap.name}"`);
  };

  const handleDeleteSnapshot = (id: string) => {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleExportCsv = () => {
    const rows = [
      ['Metric', 'Value', 'Unit'],
      ['Model', selectedModel.name, selectedModel.provider],
      ['Region', activeRegion.code, activeRegion.jurisdiction],
      ['System Tokens', String(breakdown.systemTokens), 'tokens'],
      ['Context / RAG Tokens', String(breakdown.contextTokens), 'tokens'],
      ['User Query Tokens', String(breakdown.userTokens), 'tokens'],
      ['Message Framing Overhead', String(breakdown.framingOverheadTokens), 'tokens'],
      ['Total Input Tokens', String(breakdown.totalInputTokens), 'tokens'],
      ['Expected Output Tokens', String(breakdown.expectedOutputTokens), 'tokens'],
      ['Context Utilization', breakdown.contextUtilizationPct.toFixed(2), '%'],
      ['Requests Per Day', String(requestsPerDay), 'requests/day'],
      ['Cache Hit Rate', String(cacheHitRate), '%'],
      ['Batch API Discount', useBatchApi ? 'Enabled' : 'Disabled', '50%'],
      ['Cost Per Request', breakdown.totalCostPerReq.toFixed(6), 'USD'],
      ['Cost Per 1K Requests', breakdown.costPer1kRequests.toFixed(4), 'USD'],
      ['Monthly Cost (30d)', breakdown.monthlyCost.toFixed(2), 'USD'],
      ['Monthly Cache Savings', breakdown.monthlyCacheSavings.toFixed(2), 'USD'],
      ['Estimated TTFT', String(breakdown.estimatedTtftMs), 'ms'],
      ['Estimated Total Latency', String(breakdown.estimatedTotalLatencyMs), 'ms'],
      ['Carbon Per 1K Requests', breakdown.carbonGramsPer1kRequests.toFixed(2), 'gCO2eq'],
    ];

    const csvContent = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `promptledger-${selectedModel.id}-${activeRegion.code}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showTransientNotice('Exported CSV cost report');
  };

  const isJsonMinifyReady = useMemo(
    () => tryMinifyJson(contextPayload).changed,
    [contextPayload]
  );

  const utilizationBarWidth = Math.min(100, breakdown.contextUtilizationPct);

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['places', 'marker']}
      language="en"
      region="US"
    >
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        {quotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        <header className="bg-white border-b border-slate-200">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
            <a
              href="#calculator"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('calculator');
              }}
              className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              PromptLedger
            </a>

            <nav
              aria-label="Primary"
              className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
            >
              {(
                [
                  {id: 'calculator', label: 'Calculator'},
                  {id: 'matrix', label: 'Model Matrix'},
                  {id: 'geo', label: 'Geo & Latency'},
                  {id: 'saved', label: 'Saved'},
                ] as const
              ).map((nav) => {
                const isCurrent = activeView === nav.id;
                return (
                  <button
                    key={nav.id}
                    type="button"
                    onClick={() => setActiveView(nav.id)}
                    className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isCurrent
                        ? 'border-blue-600 text-slate-900'
                        : 'border-transparent text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {nav.label}
                  </button>
                );
              })}
            </nav>

            <div className="shrink-0">
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </header>

        {statusNotice && (
          <div className="max-w-[1360px] w-full mx-auto px-4 sm:px-6 pt-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-900 flex items-center justify-between">
              <span>{statusNotice}</span>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="text-blue-700 hover:text-blue-950 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-8">
          {activeView === 'calculator' && (
            <div className="space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                    Prompt Token &amp; Cost Calculator
                  </h1>
                  <p className="mt-1 text-sm text-slate-600 max-w-2xl">
                    Measure system, RAG context, and user token density in real time, forecast monthly API spend with prefix caching, and benchmark regional deployment latency.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {PROMPT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleLoadPreset(preset)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={handleClearPrompt}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Left 7 Columns: Prompt Studio */}
                <section className="lg:col-span-7 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/70 p-1">
                      <button
                        type="button"
                        onClick={() => setEditorMode('compose')}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          editorMode === 'compose'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Compose Sections
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditorMode('inspect')}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          editorMode === 'inspect'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Token Inspector ({formatCompactNumber(breakdown.totalInputTokens - breakdown.framingOverheadTokens)})
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {!showSaveForm ? (
                        <button
                          type="button"
                          onClick={() => setShowSaveForm(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5" />
                          <span>Save Snapshot</span>
                        </button>
                      ) : (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSaveSnapshot();
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            value={snapshotName}
                            onChange={(e) => setSnapshotName(e.target.value)}
                            placeholder="Revision label..."
                            className="px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-36"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowSaveForm(false)}
                            className="px-2 py-1 text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {editorMode === 'inspect' ? (
                    <TokenInspector
                      systemPrompt={systemPrompt}
                      contextPayload={contextPayload}
                      userPrompt={userPrompt}
                      diagnostics={diagnostics}
                      onCompactWhitespace={handleCompactWhitespace}
                      onMinifyJson={handleMinifyJson}
                    />
                  ) : (
                    <div className="space-y-4">
                      {/* System Prompt */}
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
                          <label
                            htmlFor="system-prompt"
                            className="text-xs font-semibold text-slate-800"
                          >
                            01. System Instructions
                          </label>
                          <span className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatCompactNumber(systemMetrics.tokens)} tok ·{' '}
                            {formatCompactNumber(systemMetrics.characters)} chars
                          </span>
                        </div>
                        <textarea
                          id="system-prompt"
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          rows={4}
                          placeholder="Define role, output schema, and behavioral constraints..."
                          className="w-full p-4 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y bg-white"
                        />
                      </div>

                      {/* Context / RAG Payload */}
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
                          <label
                            htmlFor="context-payload"
                            className="text-xs font-semibold text-slate-800"
                          >
                            02. Context / RAG / Tool Payload
                          </label>
                          <div className="flex items-center gap-3">
                            {isJsonMinifyReady && (
                              <button
                                type="button"
                                onClick={handleMinifyJson}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900 cursor-pointer"
                              >
                                <Wrench className="w-3 h-3" />
                                <span>Minify JSON</span>
                              </button>
                            )}
                            <span className="text-xs text-slate-500 font-mono tabular-nums">
                              {formatCompactNumber(contextMetrics.tokens)} tok ·{' '}
                              {formatCompactNumber(contextMetrics.characters)} chars
                            </span>
                          </div>
                        </div>
                        <textarea
                          id="context-payload"
                          value={contextPayload}
                          onChange={(e) => setContextPayload(e.target.value)}
                          rows={6}
                          placeholder="Paste retrieved documents, JSON records, database schemas, or few-shot examples..."
                          className="w-full p-4 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y bg-white"
                        />
                      </div>

                      {/* User Prompt */}
                      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
                          <label
                            htmlFor="user-prompt"
                            className="text-xs font-semibold text-slate-800"
                          >
                            03. User Query
                          </label>
                          <span className="text-xs text-slate-500 font-mono tabular-nums">
                            {formatCompactNumber(userMetrics.tokens)} tok ·{' '}
                            {formatCompactNumber(userMetrics.characters)} chars
                          </span>
                        </div>
                        <textarea
                          id="user-prompt"
                          value={userPrompt}
                          onChange={(e) => setUserPrompt(e.target.value)}
                          rows={3}
                          placeholder="Enter the dynamic end-user request..."
                          className="w-full p-4 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y bg-white"
                        />
                      </div>

                      {/* Output & Workload Volume Parameters */}
                      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
                        <h2 className="text-sm font-semibold text-slate-900">
                          Output &amp; Workload Simulation
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <label
                                htmlFor="output-tokens"
                                className="font-medium text-slate-700"
                              >
                                Expected Output Tokens
                              </label>
                              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                {formatCompactNumber(expectedOutputTokens)} tok
                              </span>
                            </div>
                            <input
                              id="output-tokens"
                              type="range"
                              min={0}
                              max={8000}
                              step={20}
                              value={Math.min(8000, expectedOutputTokens)}
                              onChange={(e) =>
                                setExpectedOutputTokens(Number(e.target.value))
                              }
                              className="w-full accent-blue-600 cursor-pointer"
                            />
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="number"
                                min={0}
                                max={100000}
                                value={expectedOutputTokens}
                                onChange={(e) =>
                                  setExpectedOutputTokens(
                                    Math.max(0, Number(e.target.value) || 0)
                                  )
                                }
                                aria-label="Exact expected output tokens"
                                className="w-28 px-2.5 py-1 text-xs font-mono tabular-nums border border-slate-200 rounded-md focus:outline-none focus:border-blue-600"
                              />
                              <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                                Model max:{' '}
                                {formatCompactNumber(selectedModel.maxOutputTokens)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <label
                                htmlFor="requests-per-day"
                                className="font-medium text-slate-700"
                              >
                                Requests per Day
                              </label>
                              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                {formatCompactNumber(requestsPerDay * 30)} / mo
                              </span>
                            </div>
                            <input
                              id="requests-per-day"
                              type="number"
                              min={1}
                              max={10000000}
                              value={requestsPerDay}
                              onChange={(e) =>
                                setRequestsPerDay(
                                  Math.max(0, Number(e.target.value) || 0)
                                )
                              }
                              className="w-full px-3 py-1.5 text-sm font-mono tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                            />
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {[100, 1000, 10000, 50000, 250000].map((vol) => (
                                <button
                                  key={vol}
                                  type="button"
                                  onClick={() => setRequestsPerDay(vol)}
                                  className={`px-2 py-0.5 text-[11px] font-mono tabular-nums rounded transition-colors cursor-pointer ${
                                    requestsPerDay === vol
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                  }`}
                                >
                                  {vol >= 1000 ? `${vol / 1000}k` : vol}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-slate-200 pt-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <label
                                htmlFor="cache-hit-rate"
                                className="font-medium text-slate-700"
                              >
                                Prefix Cache Hit Rate
                              </label>
                              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                {cacheHitRate}%
                              </span>
                            </div>
                            <input
                              id="cache-hit-rate"
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={cacheHitRate}
                              onChange={(e) =>
                                setCacheHitRate(Number(e.target.value))
                              }
                              className="w-full accent-blue-600 cursor-pointer"
                            />
                            <p className="text-[11px] text-slate-500">
                              Applies cached rate to repeated System + Context prefix.
                            </p>
                          </div>

                          <div className="flex items-start gap-3 pt-1">
                            <input
                              id="batch-api-toggle"
                              type="checkbox"
                              checked={
                                useBatchApi && selectedModel.supportsBatchDiscount
                              }
                              disabled={!selectedModel.supportsBatchDiscount}
                              onChange={(e) => setUseBatchApi(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 cursor-pointer disabled:opacity-50"
                            />
                            <label
                              htmlFor="batch-api-toggle"
                              className="text-xs text-slate-700 cursor-pointer"
                            >
                              <span className="font-medium text-slate-900 block">
                                Asynchronous Batch API (50% discount)
                              </span>
                              <span className="text-slate-500">
                                {selectedModel.supportsBatchDiscount
                                  ? 'Eligible for 24h asynchronous batch pricing.'
                                  : 'Not offered for this model endpoint.'}
                              </span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                {/* Right 5 Columns: Cost & Compute Ledger */}
                <aside className="lg:col-span-5 space-y-5">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
                    {/* Model Picker */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label
                          htmlFor="model-select"
                          className="font-medium text-slate-600"
                        >
                          Target Model
                        </label>
                        <button
                          type="button"
                          onClick={() => setActiveView('matrix')}
                          className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                        >
                          Compare All Models
                        </button>
                      </div>

                      <select
                        id="model-select"
                        value={selectedModel.id}
                        onChange={(e) => setSelectedModelId(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      >
                        {MODEL_CATALOG.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.provider} — {m.name} (${m.inputPerMillion}/$
                            {m.outputPerMillion} per 1M)
                          </option>
                        ))}
                      </select>

                      <div className="text-xs text-slate-500">
                        {selectedModel.provider} · {(selectedModel.contextWindow / 1000).toFixed(0)}k context ·{' '}
                        {selectedModel.tierLabel}
                      </div>
                    </div>

                    {/* Primary Spend Headline */}
                    <div className="border-t border-slate-200 pt-5 space-y-4">
                      <div>
                        <div className="text-xs font-medium text-slate-500">
                          Projected Monthly Spend (30 days)
                        </div>
                        <div className="mt-1 text-4xl font-mono font-semibold tracking-tight text-slate-900 tabular-nums">
                          {formatCurrency(breakdown.monthlyCost)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                          {formatCurrency(breakdown.dailyCost)} / day ·{' '}
                          {formatCompactNumber(breakdown.monthlyTotalTokens)} total tokens / mo
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4">
                        <div>
                          <div className="text-xs text-slate-500">Cost per Request</div>
                          <div className="mt-0.5 text-lg font-mono font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(breakdown.totalCostPerReq)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Cost per 1K Calls</div>
                          <div className="mt-0.5 text-lg font-mono font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(breakdown.costPer1kRequests)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Context Window Utilization */}
                    <div className="border-t border-slate-200 pt-5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700">
                          Context Window Utilization
                        </span>
                        <span
                          className={`font-mono font-medium tabular-nums ${
                            breakdown.contextStatus === 'Exceeds Window'
                              ? 'text-red-700'
                              : breakdown.contextStatus === 'Approaching Limit'
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                          }`}
                        >
                          {breakdown.contextUtilizationPct.toFixed(2)}% ·{' '}
                          {breakdown.contextStatus}
                        </span>
                      </div>

                      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-150 ${
                            breakdown.contextStatus === 'Exceeds Window'
                              ? 'bg-red-600'
                              : breakdown.contextStatus === 'Approaching Limit'
                                ? 'bg-amber-500'
                                : 'bg-blue-600'
                          }`}
                          style={{width: `${Math.max(1, utilizationBarWidth)}%`}}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
                        <span>
                          {formatCompactNumber(breakdown.totalTokensPerRequest)} total tok
                        </span>
                        <span>
                          {formatCompactNumber(selectedModel.contextWindow)} limit
                        </span>
                      </div>

                      {breakdown.outputExceedsMax && (
                        <p className="text-xs text-red-700 font-medium">
                          Expected output ({formatCompactNumber(expectedOutputTokens)}) exceeds model max output limit ({formatCompactNumber(selectedModel.maxOutputTokens)}).
                        </p>
                      )}
                    </div>

                    {/* Itemized Ledger Table */}
                    <div className="border-t border-slate-200 pt-5">
                      <h2 className="text-xs font-semibold text-slate-800 mb-3">
                        Itemized Token &amp; Cost Ledger
                      </h2>

                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="py-2 text-slate-600">System Instructions</td>
                            <td className="py-2 text-right font-mono text-slate-900 tabular-nums">
                              {formatCompactNumber(breakdown.systemTokens)} tok
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 text-slate-600">Context / RAG Payload</td>
                            <td className="py-2 text-right font-mono text-slate-900 tabular-nums">
                              {formatCompactNumber(breakdown.contextTokens)} tok
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 text-slate-600">User Query</td>
                            <td className="py-2 text-right font-mono text-slate-900 tabular-nums">
                              {formatCompactNumber(breakdown.userTokens)} tok
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 text-slate-600">Message Framing</td>
                            <td className="py-2 text-right font-mono text-slate-900 tabular-nums">
                              {formatCompactNumber(breakdown.framingOverheadTokens)} tok
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium text-slate-800">
                              Effective Input Cost / Req
                            </td>
                            <td className="py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                              {formatCurrency(breakdown.effectiveInputCostPerReq)}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-2 font-medium text-slate-800">
                              Expected Output ({formatCompactNumber(breakdown.expectedOutputTokens)} tok)
                            </td>
                            <td className="py-2 text-right font-mono font-medium text-slate-900 tabular-nums">
                              {formatCurrency(breakdown.outputCostPerReq)}
                            </td>
                          </tr>
                          {breakdown.monthlyCacheSavings > 0 && (
                            <tr>
                              <td className="py-2 text-emerald-700 font-medium">
                                Monthly Prefix Cache Savings
                              </td>
                              <td className="py-2 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                                -{formatCurrency(breakdown.monthlyCacheSavings)}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Active Deployment Region Summary */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-500">
                          Deployment Region &amp; Latency
                        </div>
                        <div className="text-sm font-semibold text-slate-900 mt-0.5">
                          {activeRegion.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {activeRegion.code} · {activeRegion.jurisdiction}
                          {userOrigin ? ` · Origin: ${userOrigin.displayName}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveView('geo')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Open Map</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3 border-t border-slate-200 pt-3">
                      <div>
                        <div className="text-[11px] text-slate-500">Network RTT</div>
                        <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                          {breakdown.networkRttMs} ms
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Est. TTFT</div>
                        <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                          {breakdown.estimatedTtftMs} ms
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500">Carbon / 1K</div>
                        <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                          {breakdown.carbonGramsPer1kRequests.toFixed(1)} g
                        </div>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {activeView === 'matrix' && (
            <ModelMatrixView
              systemPrompt={systemPrompt}
              contextPayload={contextPayload}
              userPrompt={userPrompt}
              expectedOutputTokens={expectedOutputTokens}
              requestsPerDay={requestsPerDay}
              cacheHitRate={cacheHitRate}
              useBatchApi={useBatchApi}
              selectedModelId={selectedModelId}
              activeRegion={activeRegion}
              userLocation={userOrigin ? userOrigin.location : null}
              onSelectModel={(modelId) => {
                setSelectedModelId(modelId);
                setActiveView('calculator');
              }}
            />
          )}

          {activeView === 'geo' && (
            <GeoLatencyPanel
              activeRegionId={activeRegionId}
              onSelectRegion={setActiveRegionId}
              selectedModel={selectedModel}
              breakdown={breakdown}
              userOrigin={userOrigin}
              onChangeUserOrigin={setUserOrigin}
              onInjectPlaceToContext={handleInjectPlaceToContext}
              hasApiKey={Boolean(MAPS_API_KEY)}
            />
          )}

          {activeView === 'saved' && (
            <SavedSnapshotsView
              snapshots={snapshots}
              onLoadSnapshot={handleLoadSnapshot}
              onDeleteSnapshot={handleDeleteSnapshot}
              onSaveCurrent={() => handleSaveSnapshot()}
            />
          )}
        </main>

        <footer className="border-t border-slate-200 bg-white mt-12">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              PromptLedger · Token counts use deterministic BPE-aligned subword chunking; published provider pricing per 1M tokens.
            </span>
            <span>
              Regional latency and grid carbon figures are modeling estimates.
            </span>
          </div>
        </footer>
      </div>
    </APIProvider>
  );
}
