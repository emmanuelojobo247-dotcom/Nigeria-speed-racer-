/// <reference types="google.maps" />
import {FormEvent, useCallback, useEffect, useMemo, useState} from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {CLOUD_REGIONS, CloudRegion, ModelSpec} from '../data/models';
import {useAutocompleteSuggestions} from '../hooks/useAutocompleteSuggestions';
import {
  estimateNetworkRttMs,
  haversineDistanceKm,
  PromptCostBreakdown,
} from '../utils/tokenizer';
import {Globe, MapPin, PlusCircle, Search, X} from 'lucide-react';

export interface SelectedOriginPlace {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  location: {lat: number; lng: number};
}

interface GeoLatencyPanelProps {
  activeRegionId: string;
  onSelectRegion: (regionId: string) => void;
  selectedModel: ModelSpec;
  breakdown: PromptCostBreakdown;
  userOrigin: SelectedOriginPlace | null;
  onChangeUserOrigin: (origin: SelectedOriginPlace | null) => void;
  onInjectPlaceToContext: (place: SelectedOriginPlace) => void;
  hasApiKey: boolean;
}

interface RegionMarkerProps {
  region: CloudRegion;
  isActive: boolean;
  isInspected: boolean;
  rttMs: number;
  onSelectMarker: (
    region: CloudRegion,
    marker: google.maps.marker.AdvancedMarkerElement
  ) => void;
}

function RegionMarker({
  region,
  isActive,
  isInspected,
  rttMs,
  onSelectMarker,
}: RegionMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <AdvancedMarker
      ref={markerRef}
      position={region.coordinates}
      title={`${region.name} (${rttMs} ms RTT)`}
      zIndex={isActive ? 1000 : isInspected ? 950 : 10}
      onClick={() => {
        if (marker) {
          onSelectMarker(region, marker);
        }
      }}
    >
      <Pin
        background={isActive ? '#2563EB' : '#0F172A'}
        borderColor={isActive ? '#1D4ED8' : '#334155'}
        glyphColor="#FFFFFF"
        scale={isActive ? 1.15 : 0.95}
      />
    </AdvancedMarker>
  );
}

function isQuotaRejection(err: unknown): boolean {
  const msg = String(err ?? '');
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('QuotaExceeded') ||
    msg.includes('429')
  );
}

export function GeoLatencyPanel({
  activeRegionId,
  onSelectRegion,
  selectedModel,
  breakdown,
  userOrigin,
  onChangeUserOrigin,
  onInjectPlaceToContext,
  hasApiKey,
}: GeoLatencyPanelProps) {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const apiStatus = useApiLoadingStatus();

  const [searchInput, setSearchInput] = useState('');
  const [placeLookupError, setPlaceLookupError] = useState<string | null>(null);
  const [inspectedRegion, setInspectedRegion] = useState<CloudRegion | null>(null);
  const [anchorMarker, setAnchorMarker] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [injectedBanner, setInjectedBanner] = useState(false);

  const {
    suggestions,
    isLoading: suggestionsLoading,
    error: autocompleteError,
    resetSession,
  } = useAutocompleteSuggestions(searchInput);

  const activeRegion =
    CLOUD_REGIONS.find((r) => r.id === activeRegionId) ?? CLOUD_REGIONS[0];

  useEffect(() => {
    if (!map) return;
    if (userOrigin) {
      map.panTo(userOrigin.location);
      map.setZoom(4);
    }
  }, [map, userOrigin]);

  const handleSearchInput = useCallback((e: FormEvent<HTMLInputElement>) => {
    setSearchInput((e.target as HTMLInputElement).value);
    setPlaceLookupError(null);
  }, []);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      setPlaceLookupError(null);

      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
        });

        const loc = place.location;
        if (!loc) {
          setPlaceLookupError('Selected place did not return coordinates.');
          resetSession();
          return;
        }

        const nextOrigin: SelectedOriginPlace = {
          placeId: place.id ?? '',
          displayName: place.displayName ?? suggestion.placePrediction.text.text,
          formattedAddress:
            place.formattedAddress ?? suggestion.placePrediction.text.text,
          location: {
            lat: loc.lat(),
            lng: loc.lng(),
          },
        };

        onChangeUserOrigin(nextOrigin);
        setSearchInput('');
        resetSession();
      } catch (err: unknown) {
        if (isQuotaRejection(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setPlaceLookupError(
          'Unable to load place details. Please try another query.'
        );
      }
    },
    [placesLib, onChangeUserOrigin, resetSession]
  );

  const rankedRegions = useMemo(() => {
    return CLOUD_REGIONS.map((region) => {
      const rttMs = estimateNetworkRttMs(
        userOrigin ? userOrigin.location : null,
        region
      );
      const distanceKm = userOrigin
        ? Math.round(haversineDistanceKm(userOrigin.location, region.coordinates))
        : null;
      const whPerReq =
        (breakdown.totalTokensPerRequest / 1000) *
        selectedModel.energyWhPer1kTokens *
        region.pue;
      const carbonPer1k = whPerReq * region.gridCarbonIntensityGPerKwh;
      return {
        region,
        rttMs,
        distanceKm,
        carbonPer1k,
      };
    }).sort((a, b) => a.rttMs - b.rttMs);
  }, [userOrigin, breakdown.totalTokensPerRequest, selectedModel.energyWhPer1kTokens]);

  const handleMarkerSelect = useCallback(
    (
      region: CloudRegion,
      marker: google.maps.marker.AdvancedMarkerElement
    ) => {
      setInspectedRegion(region);
      setAnchorMarker(marker);
    },
    []
  );

  const handleInjectContext = () => {
    if (!userOrigin) return;
    onInjectPlaceToContext(userOrigin);
    setInjectedBanner(true);
    setTimeout(() => setInjectedBanner(false), 2500);
  };

  const mapUnavailable =
    !hasApiKey ||
    apiStatus === APILoadingStatus.FAILED ||
    apiStatus === APILoadingStatus.AUTH_FAILURE;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Regional Deployment, Latency &amp; Geo-Context
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Search your primary user city via Google Places to measure network RTT across inference regions, compare grid carbon footprint, or test live Place JSON token overhead.
          </p>
        </div>

        <div className="relative w-full lg:w-96">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchInput}
              onInput={handleSearchInput}
              placeholder="Search origin city or address (Places API)..."
              aria-label="Search origin city or address"
              disabled={!hasApiKey}
              className="w-full pl-9 pr-9 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  resetSession();
                }}
                aria-label="Clear location search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {(suggestions.length > 0 || suggestionsLoading) && searchInput.trim() && (
            <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
              {suggestionsLoading && suggestions.length === 0 ? (
                <div className="px-3.5 py-2.5 text-xs text-slate-500">
                  Searching locations...
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {suggestions.map((suggestion, idx) => (
                    <li key={idx}>
                      <button
                        type="button"
                        onClick={() => void handleSelectSuggestion(suggestion)}
                        className="w-full text-left px-3.5 py-2.5 text-xs text-slate-800 hover:bg-slate-50 transition-colors flex items-start gap-2 cursor-pointer"
                      >
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span>{suggestion.placePrediction?.text.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {(autocompleteError || placeLookupError) && (
            <p className="mt-1.5 text-xs text-red-700">
              {placeLookupError ?? autocompleteError}
            </p>
          )}
        </div>
      </div>

      {userOrigin && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="text-xs text-slate-500">Active Origin Anchor (Google Places)</div>
            <div className="text-sm font-medium text-slate-900">
              {userOrigin.displayName}{' '}
              <span className="text-slate-400 font-normal" aria-hidden="true">
                ·
              </span>{' '}
              <span className="text-xs font-normal text-slate-600">
                {userOrigin.formattedAddress}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleInjectContext}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>
                {injectedBanner
                  ? 'Added to Prompt Context'
                  : 'Inject Place Payload into Context'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onChangeUserOrigin(null)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clear Origin
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-3">
          <div className="h-[460px] w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100 relative">
            {mapUnavailable ? (
              <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-2 bg-slate-100">
                <Globe className="w-8 h-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-800">
                  Interactive Map Unavailable
                </p>
                <p className="text-xs text-slate-500 max-w-sm">
                  Google Maps Platform could not initialize with the current environment key. You can still select an inference region from the table on the right.
                </p>
              </div>
            ) : (
              <GoogleMap
                mapId="DEMO_MAP_ID"
                defaultCenter={activeRegion.coordinates}
                defaultZoom={2}
                gestureHandling="greedy"
                disableDefaultUI={false}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{width: '100%', height: '100%'}}
              >
                {rankedRegions.map(({region, rttMs}) => (
                  <RegionMarker
                    key={region.id}
                    region={region}
                    isActive={region.id === activeRegionId}
                    isInspected={inspectedRegion?.id === region.id}
                    rttMs={rttMs}
                    onSelectMarker={handleMarkerSelect}
                  />
                ))}

                {userOrigin && (
                  <AdvancedMarker
                    position={userOrigin.location}
                    title={`Origin: ${userOrigin.displayName}`}
                    zIndex={1100}
                  >
                    <Pin
                      background="#059669"
                      borderColor="#065F46"
                      glyphColor="#FFFFFF"
                      scale={1.1}
                    />
                  </AdvancedMarker>
                )}

                {inspectedRegion && anchorMarker && (
                  <InfoWindow
                    anchor={anchorMarker}
                    pixelOffset={[0, -4]}
                    onCloseClick={() => setInspectedRegion(null)}
                  >
                    <div className="p-1 space-y-1.5 min-w-[210px]">
                      <div className="text-xs font-semibold text-slate-900">
                        {inspectedRegion.name}
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {inspectedRegion.code} · {inspectedRegion.jurisdiction}
                      </div>
                      <div className="text-[11px] font-mono text-slate-800 tabular-nums">
                        Est. RTT:{' '}
                        {estimateNetworkRttMs(
                          userOrigin ? userOrigin.location : null,
                          inspectedRegion
                        )}{' '}
                        ms · Grid: {inspectedRegion.gridCarbonIntensityGPerKwh} gCO2/kWh
                      </div>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        {inspectedRegion.note}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectRegion(inspectedRegion.id);
                          setInspectedRegion(null);
                        }}
                        className="mt-1 w-full px-2.5 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
                      >
                        {inspectedRegion.id === activeRegionId
                          ? 'Active Region'
                          : 'Set as Deployment Region'}
                      </button>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
            <span>
              Blue pin: Active inference region · Dark pins: Available cloud nodes · Green pin: Searched origin
            </span>
            <span className="font-mono tabular-nums">
              Active: {activeRegion.code}
            </span>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Cloud Inference Regions
            </h2>
            <span className="text-xs text-slate-500">
              {userOrigin ? 'Sorted by RTT from origin' : 'Baseline latency'}
            </span>
          </div>

          <div className="divide-y divide-slate-200 max-h-[452px] overflow-y-auto">
            {rankedRegions.map(({region, rttMs, distanceKm, carbonPer1k}) => {
              const isActive = region.id === activeRegionId;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => {
                    onSelectRegion(region.id);
                    if (map) {
                      map.panTo(region.coordinates);
                    }
                  }}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    isActive ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 truncate">
                        {region.name}
                      </span>
                      {isActive && (
                        <span className="text-xs font-medium text-blue-700">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {region.code} · {region.jurisdiction}
                      {distanceKm !== null && (
                        <>
                          {' '}
                          ·{' '}
                          <span className="font-mono tabular-nums">
                            {distanceKm.toLocaleString()} km
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-semibold text-slate-900 tabular-nums">
                      {rttMs} ms RTT
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 tabular-nums mt-0.5">
                      {carbonPer1k.toFixed(1)} gCO₂ / 1k
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
