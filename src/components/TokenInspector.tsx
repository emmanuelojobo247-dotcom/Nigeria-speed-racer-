import {useMemo, useState} from 'react';
import {
  EfficiencyDiagnostic,
  TokenChunk,
  tokenizeText,
} from '../utils/tokenizer';
import {Minimize2, Sparkles, Wrench} from 'lucide-react';

interface TokenInspectorProps {
  systemPrompt: string;
  contextPayload: string;
  userPrompt: string;
  diagnostics: EfficiencyDiagnostic[];
  onCompactWhitespace: () => void;
  onMinifyJson: () => void;
}

const TOKEN_TONES = [
  'bg-blue-50 text-blue-950 border-blue-200/70',
  'bg-slate-100 text-slate-900 border-slate-200/90',
  'bg-emerald-50 text-emerald-950 border-emerald-200/70',
  'bg-amber-50 text-amber-950 border-amber-200/70',
  'bg-indigo-50 text-indigo-950 border-indigo-200/70',
];

function renderChunkGlyph(chunk: TokenChunk): string {
  if (chunk.text === '\n' || chunk.text === '\r\n') return '↵\n';
  if (/^[ \t]+$/.test(chunk.text)) {
    return chunk.text.replace(/ /g, '·').replace(/\t/g, '→');
  }
  return chunk.text;
}

export function TokenInspector({
  systemPrompt,
  contextPayload,
  userPrompt,
  diagnostics,
  onCompactWhitespace,
  onMinifyJson,
}: TokenInspectorProps) {
  const [activeSection, setActiveSection] = useState<'all' | 'system' | 'context' | 'user'>('all');
  const [hoveredChunk, setHoveredChunk] = useState<TokenChunk | null>(null);

  const chunks = useMemo(() => {
    const source =
      activeSection === 'system'
        ? systemPrompt
        : activeSection === 'context'
          ? contextPayload
          : activeSection === 'user'
            ? userPrompt
            : [systemPrompt, contextPayload, userPrompt].filter(Boolean).join('\n\n');
    return tokenizeText(source);
  }, [activeSection, systemPrompt, contextPayload, userPrompt]);

  const visibleChunks = chunks.slice(0, 1200);
  const truncatedCount = Math.max(0, chunks.length - visibleChunks.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              {id: 'all', label: 'Combined'},
              {id: 'system', label: 'System'},
              {id: 'context', label: 'Context'},
              {id: 'user', label: 'User'},
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500 font-mono tabular-nums">
          {hoveredChunk ? (
            <span>
              Token #{hoveredChunk.index + 1} · {hoveredChunk.kind} · {hoveredChunk.text.length} chars
            </span>
          ) : (
            <span>{chunks.length.toLocaleString()} tokens inspected</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 min-h-[260px] max-h-[380px] overflow-y-auto">
        {chunks.length === 0 ? (
          <div className="h-[220px] flex flex-col items-center justify-center text-center text-slate-500 text-sm">
            <p className="font-medium text-slate-700">No text in this section</p>
            <p className="mt-1 text-xs text-slate-500">
              Enter prompt text in the editor to inspect subword token boundaries.
            </p>
          </div>
        ) : (
          <div className="font-mono text-[13px] leading-7 whitespace-pre-wrap break-words">
            {visibleChunks.map((chunk) => {
              const tone = TOKEN_TONES[chunk.index % TOKEN_TONES.length];
              return (
                <span
                  key={chunk.index}
                  onMouseEnter={() => setHoveredChunk(chunk)}
                  onMouseLeave={() => setHoveredChunk(null)}
                  className={`inline border-b px-0.5 rounded-[2px] transition-colors ${tone}`}
                >
                  {renderChunkGlyph(chunk)}
                </span>
              );
            })}
            {truncatedCount > 0 && (
              <span className="ml-2 text-xs text-slate-500">
                (+{truncatedCount.toLocaleString()} additional tokens omitted from preview)
              </span>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Token Efficiency Diagnostics
          </h3>
          <span className="text-xs text-slate-500 tabular-nums">
            {diagnostics.length} {diagnostics.length === 1 ? 'finding' : 'findings'}
          </span>
        </div>

        {diagnostics.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-4 py-3 text-xs text-slate-600">
            No obvious whitespace or formatting bloat detected in the current prompt.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {diagnostics.map((item) => (
              <div
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-900">
                    <span>{item.title}</span>
                    <span className="text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={`font-mono tabular-nums ${
                        item.severity === 'warning' ? 'text-amber-700' : 'text-blue-700'
                      }`}
                    >
                      ~{item.estimatedTokenSavings} tokens saveable
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{item.detail}</p>
                </div>

                {item.actionType === 'compact-whitespace' && (
                  <button
                    type="button"
                    onClick={onCompactWhitespace}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Minimize2 className="w-3.5 h-3.5" />
                    <span>Compact Whitespace</span>
                  </button>
                )}

                {item.actionType === 'minify-json' && (
                  <button
                    type="button"
                    onClick={onMinifyJson}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Minify JSON</span>
                  </button>
                )}

                {!item.actionType && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Enable Prefix Cache</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
