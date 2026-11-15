import {useState} from 'react';
import {CLOUD_REGIONS, MODEL_CATALOG} from '../data/models';
import {
  calculatePromptCosts,
  formatCompactNumber,
  formatCurrency,
} from '../utils/tokenizer';
import {ArrowRight, Trash2} from 'lucide-react';

export interface PromptSnapshot {
  id: string;
  name: string;
  createdAt: string;
  modelId: string;
  regionId: string;
  systemPrompt: string;
  contextPayload: string;
  userPrompt: string;
  expectedOutputTokens: number;
  requestsPerDay: number;
  cacheHitRate: number;
  useBatchApi: boolean;
}

interface SavedSnapshotsViewProps {
  snapshots: PromptSnapshot[];
  onLoadSnapshot: (snapshot: PromptSnapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  onSaveCurrent: () => void;
}

export function SavedSnapshotsView({
  snapshots,
  onLoadSnapshot,
  onDeleteSnapshot,
  onSaveCurrent,
}: SavedSnapshotsViewProps) {
  const [compareIds, setCompareIds] = useState<[string | null, string | null]>([
    null,
    null,
  ]);

  const getBreakdown = (snap: PromptSnapshot) => {
    const model = MODEL_CATALOG.find((m) => m.id === snap.modelId) ?? MODEL_CATALOG[0];
    const region = CLOUD_REGIONS.find((r) => r.id === snap.regionId) ?? CLOUD_REGIONS[0];
    return {
      model,
      region,
      cost: calculatePromptCosts({
        systemPrompt: snap.systemPrompt,
        contextPayload: snap.contextPayload,
        userPrompt: snap.userPrompt,
        expectedOutputTokens: snap.expectedOutputTokens,
        requestsPerDay: snap.requestsPerDay,
        cacheHitRate: snap.cacheHitRate,
        useBatchApi: snap.useBatchApi,
        model,
        region,
        userLocation: null,
      }),
    };
  };

  const toggleCompare = (id: string) => {
    setCompareIds(([first, second]) => {
      if (first === id) return [second, null];
      if (second === id) return [first, null];
      if (!first) return [id, second];
      return [first, id];
    });
  };

  const snapA = snapshots.find((s) => s.id === compareIds[0]);
  const snapB = snapshots.find((s) => s.id === compareIds[1]);
  const dataA = snapA ? getBreakdown(snapA) : null;
  const dataB = snapB ? getBreakdown(snapB) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Saved Prompt Snapshots
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Store prompt revisions locally to benchmark token optimizations and model swaps side by side.
          </p>
        </div>

        <button
          type="button"
          onClick={onSaveCurrent}
          className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          Save Current Prompt
        </button>
      </div>

      {snapA && snapB && dataA && dataB && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Comparison Delta: {snapA.name} vs {snapB.name}
            </h2>
            <button
              type="button"
              onClick={() => setCompareIds([null, null])}
              className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Clear Comparison
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 border-t border-slate-200 pt-4">
            <div>
              <div className="text-xs text-slate-500">Input Tokens Delta</div>
              <div className="mt-1 text-lg font-mono font-semibold text-slate-900 tabular-nums">
                {dataB.cost.totalInputTokens - dataA.cost.totalInputTokens >= 0 ? '+' : ''}
                {formatCompactNumber(
                  dataB.cost.totalInputTokens - dataA.cost.totalInputTokens
                )}{' '}
                tok
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {formatCompactNumber(dataA.cost.totalInputTokens)} →{' '}
                {formatCompactNumber(dataB.cost.totalInputTokens)}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Cost per Request Delta</div>
              <div className="mt-1 text-lg font-mono font-semibold text-slate-900 tabular-nums">
                {dataB.cost.totalCostPerReq - dataA.cost.totalCostPerReq >= 0 ? '+' : ''}
                {formatCurrency(
                  dataB.cost.totalCostPerReq - dataA.cost.totalCostPerReq
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {formatCurrency(dataA.cost.totalCostPerReq)} →{' '}
                {formatCurrency(dataB.cost.totalCostPerReq)}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Monthly Spend Delta</div>
              <div
                className={`mt-1 text-lg font-mono font-semibold tabular-nums ${
                  dataB.cost.monthlyCost <= dataA.cost.monthlyCost
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {dataB.cost.monthlyCost - dataA.cost.monthlyCost >= 0 ? '+' : ''}
                {formatCurrency(dataB.cost.monthlyCost - dataA.cost.monthlyCost)} / mo
              </div>
              <div className="text-xs text-slate-500 font-mono tabular-nums">
                {formatCurrency(dataA.cost.monthlyCost)} →{' '}
                {formatCurrency(dataB.cost.monthlyCost)}
              </div>
            </div>
          </div>
        </div>
      )}

      {snapshots.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-900">
            No saved prompt snapshots yet
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Save your current prompt configuration to track token count reductions, test alternative models, or compare regional deployments.
          </p>
          <button
            type="button"
            onClick={onSaveCurrent}
            className="mt-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            Save First Snapshot
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">
          {snapshots.map((snap) => {
            const {model, region, cost} = getBreakdown(snap);
            const isComparing = compareIds.includes(snap.id);
            return (
              <div
                key={snap.id}
                className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {snap.name}
                  </div>
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                    <span>{model.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{region.code}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatCompactNumber(cost.totalInputTokens)} in /{' '}
                      {formatCompactNumber(cost.expectedOutputTokens)} out
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-slate-800 font-medium">
                      {formatCurrency(cost.monthlyCost)} / mo
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleCompare(snap.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isComparing
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {isComparing ? 'Selected' : 'Compare'}
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadSnapshot(snap)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Load</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteSnapshot(snap.id)}
                    aria-label={`Delete ${snap.name}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
