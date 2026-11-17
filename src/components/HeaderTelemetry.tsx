import React, { useRef } from 'react';
import {
  Activity,
  Award,
  CheckCircle2,
  Download,
  Flame,
  Layers,
  ShieldCheck,
  Thermometer,
  Upload,
  AlertTriangle,
  XCircle,
  Zap,
  ExternalLink,
} from 'lucide-react';
import { AppMode, FloorAnalysis, TabId, TelemetryKPIs } from '../types';

interface HeaderTelemetryProps {
  kpis: TelemetryKPIs;
  analysis: FloorAnalysis;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onExportJson: () => void;
  onImportJson: (file: File) => void;
}

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'floor', label: 'Plano 2D & Pasillos', icon: Layers },
  { id: 'ups', label: 'SAI (UPS) & Autonomía', icon: Zap },
  { id: 'thermal', label: 'Termodinámica & PUE', icon: Thermometer },
  { id: 'tier', label: 'Topología Tier TIA-942', icon: ShieldCheck },
  { id: 'audit', label: 'Auditoría & Misiones CTF', icon: Award },
];

export const HeaderTelemetry: React.FC<HeaderTelemetryProps> = ({
  kpis,
  analysis,
  activeTab,
  onTabChange,
  mode,
  onModeChange,
  onExportJson,
  onImportJson,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJson(file);
      e.target.value = '';
    }
  };

  const pueColorClass =
    kpis.pueStatus === 'optimal'
      ? 'text-emerald-400'
      : kpis.pueStatus === 'moderate'
      ? 'text-amber-400'
      : kpis.pueStatus === 'critical'
      ? 'text-red-400'
      : 'text-slate-400';

  const pueLabel =
    kpis.pueStatus === 'optimal'
      ? 'Óptimo'
      : kpis.pueStatus === 'moderate'
      ? 'Mejorable'
      : kpis.pueStatus === 'critical'
      ? 'Crítico'
      : 'Sin carga';

  const PueIcon =
    kpis.pueStatus === 'optimal'
      ? CheckCircle2
      : kpis.pueStatus === 'moderate'
      ? AlertTriangle
      : kpis.pueStatus === 'critical'
      ? XCircle
      : Activity;

  const tierColorClass =
    kpis.tier === 'Tier IV'
      ? 'text-emerald-400'
      : kpis.tier === 'Tier III'
      ? 'text-cyan-400'
      : kpis.tier === 'Tier II'
      ? 'text-amber-400'
      : 'text-slate-300';

  const totalAlerts = analysis.hotspotCount + analysis.misplacedPerforatedCount;

  return (
    <header className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
      {/* Row 1: Brand, Author Web Link, Mode Selector & JSON Tools */}
      <div className="px-4 lg:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            title="Visitar Un Fantasma en el Sistema"
            className="shrink-0 flex items-center justify-center rounded-lg bg-slate-900 border border-slate-800 p-1 hover:border-cyan-500/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <img
              src="./assets/aistudio/icono_81a3db5b.png"
              alt="Logo Un Fantasma en el Sistema"
              className="h-9 w-9 object-contain"
              referrerPolicy="no-referrer"
            />
          </a>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap">
                CPD Designer
              </h1>
              <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="text-xs sm:text-sm font-medium text-slate-400 truncate">
                DCIM &amp; TIA-942 Engineering Suite
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <a
                href="https://www.unfantasmaenelsistema.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-cyan-400/90 hover:text-cyan-300 transition-colors whitespace-nowrap"
              >
                <span>unfantasmaenelsistema.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <span aria-hidden="true">·</span>
              <span className="whitespace-nowrap">Simulador 100% Client-Side</span>
            </div>
          </div>
        </div>

        {/* Mode & Project Actions */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <div
            role="group"
            aria-label="Selector de modo"
            className="flex items-center p-0.5 bg-slate-900 border border-slate-800 rounded-lg"
          >
            <button
              type="button"
              onClick={() => onModeChange('free')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'free'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Modo Libre
            </button>
            <button
              type="button"
              onClick={() => onModeChange('ctf')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'ctf'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Misiones CTF
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-lg hover:border-slate-700 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Importar JSON</span>
          </button>

          <button
            type="button"
            onClick={onExportJson}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar JSON</span>
          </button>
        </div>
      </div>

      {/* Row 2: Global Real-Time Telemetry Bar */}
      <div className="px-4 lg:px-6 py-2 bg-slate-900/60 border-b border-slate-800/80 grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-0 lg:divide-x lg:divide-slate-800">
        {/* KPI 1: Carga IT Total */}
        <div className="lg:pr-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium text-slate-400">Carga IT Total</div>
            <div className="font-mono text-sm sm:text-base font-semibold text-slate-100 tabular-nums">
              {kpis.totalItKw.toFixed(1)} kW
              <span className="text-slate-500 mx-1.5">/</span>
              <span className="text-cyan-400">{kpis.totalItKva.toFixed(1)} kVA</span>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-slate-400 hidden sm:block">
            <div>{kpis.rackCount} racks</div>
            <div>FP {kpis.weightedPowerFactor.toFixed(2)}</div>
          </div>
        </div>

        {/* KPI 2: Carga Térmica Total */}
        <div className="lg:px-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium text-slate-400">Carga Térmica Total</div>
            <div className="font-mono text-sm sm:text-base font-semibold text-slate-100 tabular-nums">
              {Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')} BTU/h
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-amber-400/90 hidden sm:block">
            <div>{Math.round(kpis.totalFrigoriasPerHour).toLocaleString('es-ES')} Frig/h</div>
            <div className="text-slate-400">{kpis.totalHeatKw.toFixed(1)} kWt</div>
          </div>
        </div>

        {/* KPI 3: PUE Estimado */}
        <div className="lg:px-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium text-slate-400">PUE Estimado</div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm sm:text-base font-bold tabular-nums ${pueColorClass}`}>
                {kpis.pue > 0 ? kpis.pue.toFixed(2) : '—'}
              </span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${pueColorClass}`}>
                <PueIcon className="w-3.5 h-3.5" />
                <span>{pueLabel}</span>
              </span>
            </div>
          </div>
          <div className="text-right font-mono text-[11px] text-slate-400 hidden sm:block">
            <div>Total: {kpis.totalFacilityKw.toFixed(1)} kW</div>
            <div className={totalAlerts > 0 ? 'text-red-400' : 'text-emerald-400'}>
              {totalAlerts > 0 ? `${totalAlerts} alerta(s)` : 'Sin hotspots'}
            </div>
          </div>
        </div>

        {/* KPI 4: Clasificación TIA-942 */}
        <div className="lg:pl-5 flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium text-slate-400">Clasificación Actual (TIA-942)</div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-sm sm:text-base font-bold ${tierColorClass}`}>
                {kpis.tier}
              </span>
              <span className="text-xs text-slate-400 truncate max-w-[140px]">
                {kpis.cracCount} CRAC · {kpis.coolingMarginKw >= 0 ? `+${kpis.coolingMarginKw.toFixed(0)}` : kpis.coolingMarginKw.toFixed(0)} kWt
              </span>
            </div>
          </div>
          {totalAlerts > 0 && (
            <div className="hidden xl:flex items-center gap-1 text-xs font-medium text-red-400">
              <Flame className="w-3.5 h-3.5" />
              <span className="font-mono">{totalAlerts}</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 3: 5-Module Tab Navigation */}
      <nav
        aria-label="Módulos de ingeniería"
        className="px-4 lg:px-6 flex items-center gap-1 overflow-x-auto bg-slate-950"
      >
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'border-cyan-400 text-cyan-300 bg-slate-900/50'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span>
                {idx + 1}. {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </header>
  );
};
