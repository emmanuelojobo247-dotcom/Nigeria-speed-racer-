import {useMemo, useState} from 'react';
import {
  CloudRegion,
  MODEL_CATALOG,
  ModelProvider,
  ModelSpec,
} from '../data/models';
import {
  calculatePromptCosts,
  formatCompactNumber,
  formatCurrency,
  PromptCostBreakdown,
} from '../utils/tokenizer';
import {ArrowUpDown, Check, Search} from 'lucide-react';

interface ModelMatrixViewProps {
  systemPrompt: string;
  contextPayload: string;
  userPrompt: string;
  expectedOutputTokens: number;
  requestsPerDay: number;
  cacheHitRate: number;
  useBatchApi: boolean;
  selectedModelId: string;
  activeRegion: CloudRegion;
  userLocation: {lat: number; lng: number} | null;
  onSelectModel: (modelId: string) => void;
}

type SortKey = 'monthlyCost' | 'totalCostPerReq' | 'estimatedTtftMs' | 'contextWindow';

interface ModelRow {
  model: ModelSpec;
  breakdown: PromptCostBreakdown;
}

export function ModelMatrixView({
  systemPrompt,
  contextPayload,
  userPrompt,
  expectedOutputTokens,
  requestsPerDay,
  cacheHitRate,
  useBatchApi,
  selectedModelId,
  activeRegion,
  userLocation,
  onSelectModel,
}: ModelMatrixViewProps) {
  const [providerFilter, setProviderFilter] = useState<'All' | ModelProvider>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('monthlyCost');
  const [sortAsc, setSortAsc] = useState(true);

  const rows = useMemo<ModelRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    return MODEL_CATALOG.filter((m) => {
      if (providerFilter !== 'All' && m.provider !== providerFilter) return false;
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.provider.toLowerCase().includes(q) &&
        !m.tierLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    })
      .map((model) => ({
        model,
        breakdown: calculatePromptCosts({
          systemPrompt,
          contextPayload,
          userPrompt,
          expectedOutputTokens,
          requestsPerDay,
          cacheHitRate,
          useBatchApi,
          model,
          region: activeRegion,
          userLocation,
        }),
      }))
      .sort((a, b) => {
        const valA =
          sortBy === 'contextWindow' ? a.model.contextWindow : a.breakdown[sortBy];
        const valB =
          sortBy === 'contextWindow' ? b.model.contextWindow : b.breakdown[sortBy];
        return sortAsc ? valA - valB : valB - valA;
      });
  }, [
    providerFilter,
    searchQuery,
    sortBy,
    sortAsc,
    systemPrompt,
    contextPayload,
    userPrompt,
    expectedOutputTokens,
    requestsPerDay,
    cacheHitRate,
    useBatchApi,
    activeRegion,
    userLocation,
  ]);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortBy(key);
      setSortAsc(key !== 'contextWindow');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Multi-Model Cost & Context Matrix
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Live comparison across providers for your current prompt ({formatCompactNumber(rows[0]?.breakdown.totalInputTokens ?? 0)} input tokens, {formatCompactNumber(expectedOutputTokens)} output tokens, {formatCompactNumber(requestsPerDay)} req/day).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['All', 'Google', 'Anthropic', 'OpenAI', 'DeepSeek'] as const).map(
              (provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setProviderFilter(provider)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    providerFilter === provider
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {provider}
                </button>
              )
            )}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter models..."
              aria-label="Filter models"
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 w-44"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-600">
                <th className="py-3 px-4 whitespace-nowrap">Model</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('contextWindow')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Context</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">In / Out ($/1M)</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('totalCostPerReq')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Cost / Req</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('monthlyCost')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Monthly (30d)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('estimatedTtftMs')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                  >
                    <span>Est. TTFT</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Window Fit</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 px-4 text-center text-slate-500 text-sm">
                    No models match your current filter. Clear the search query or select All providers.
                  </td>
                </tr>
              ) : (
                rows.map(({model, breakdown}) => {
                  const isSelected = model.id === selectedModelId;
                  return (
                    <tr
                      key={model.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{model.name}</div>
                        <div className="text-xs text-slate-500">
                          {model.provider} · {model.tierLabel}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {(model.contextWindow / 1000).toFixed(0)}k
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                        ${model.inputPerMillion.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} / $
                        {model.outputPerMillion.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs font-medium text-slate-900 tabular-nums">
                        {formatCurrency(breakdown.totalCostPerReq)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {formatCurrency(breakdown.monthlyCost)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-700 tabular-nums">
                        {breakdown.estimatedTtftMs} ms
                      </td>
                      <td className="py-3 px-4 text-right text-xs tabular-nums">
                        <span
                          className={
                            breakdown.contextStatus === 'Exceeds Window'
                              ? 'text-red-700 font-medium'
                              : breakdown.contextStatus === 'Approaching Limit'
                                ? 'text-amber-700 font-medium'
                                : 'text-emerald-700'
                          }
                        >
                          {breakdown.contextUtilizationPct.toFixed(1)}% · {breakdown.contextStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectModel(model.id)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          <span>{isSelected ? 'Active' : 'Use Model'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
