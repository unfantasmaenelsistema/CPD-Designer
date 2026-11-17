import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Cpu,
  Eraser,
  Flame,
  Grid,
  MousePointer,
  RotateCcw,
  Server,
  ShieldAlert,
  Snowflake,
  Square,
  Wind,
  Zap,
} from 'lucide-react';
import { CATALOG_ITEMS } from '../data/catalog';
import { RackOrientation, TileType } from '../types';

export type BrushTool = TileType | 'inspect';

interface CatalogSidebarProps {
  activeTool: BrushTool;
  onSelectTool: (tool: BrushTool) => void;
  defaultOrientation: RackOrientation;
  onOrientationChange: (orientation: RackOrientation) => void;
  cacEnabled: boolean;
  onToggleCac: () => void;
  onLoadPreset: (preset: 'standard' | 'faulty' | 'empty') => void;
}

function getCatalogIcon(type: TileType) {
  switch (type) {
    case 'rack_std':
      return Server;
    case 'rack_hd':
      return Cpu;
    case 'rack_net':
      return Grid;
    case 'crac':
      return Snowflake;
    case 'perforated':
      return Wind;
    case 'blind':
      return Square;
    case 'pdu':
      return Zap;
    case 'safety':
      return Flame;
    default:
      return Square;
  }
}

export const CatalogSidebar: React.FC<CatalogSidebarProps> = ({
  activeTool,
  onSelectTool,
  defaultOrientation,
  onOrientationChange,
  cacEnabled,
  onToggleCac,
  onLoadPreset,
}) => {
  const handleDragStart = (e: React.DragEvent, type: TileType) => {
    e.dataTransfer.setData('application/cpd-catalog-type', type);
    e.dataTransfer.setData('application/cpd-orientation', defaultOrientation);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="w-full lg:w-72 xl:w-80 shrink-0 bg-slate-900/50 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col">
      {/* Tool & Orientation Header */}
      <div className="p-4 border-b border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Catálogo de Elementos</h2>
          <span className="font-mono text-[11px] text-slate-400">60×60 cm</span>
        </div>

        {/* Inspect / Eraser Quick Tools */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSelectTool('inspect')}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              activeTool === 'inspect'
                ? 'bg-cyan-500/15 border-cyan-500/60 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
            <span>Inspeccionar</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('empty')}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer whitespace-nowrap ${
              activeTool === 'empty'
                ? 'bg-red-500/15 border-red-500/60 text-red-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Vaciar celda</span>
          </button>
        </div>

        {/* Rack Orientation Pre-Selector */}
        <div className="pt-1">
          <div className="text-[11px] font-medium text-slate-400 mb-1.5">
            Orientación Frontal de Rack (Admisión Fría)
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => onOrientationChange('north')}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                defaultOrientation === 'north'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <ArrowUp className="w-3.5 h-3.5" />
              <span>Frontal Norte</span>
            </button>
            <button
              type="button"
              onClick={() => onOrientationChange('south')}
              className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                defaultOrientation === 'south'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Frontal Sur</span>
            </button>
          </div>
        </div>
      </div>

      {/* Catalog List */}
      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        <p className="text-[11px] text-slate-400 px-1">
          Selecciona un elemento o arrástralo directamente sobre el plano 12×8.
        </p>

        {CATALOG_ITEMS.map((item) => {
          const Icon = getCatalogIcon(item.type);
          const isSelected = activeTool === item.type;

          const accentClass =
            item.type === 'rack_hd'
              ? 'text-amber-400'
              : item.type === 'crac' || item.type === 'perforated'
              ? 'text-cyan-400'
              : item.type === 'pdu'
              ? 'text-amber-300'
              : item.type === 'safety'
              ? 'text-emerald-400'
              : 'text-sky-400';

          return (
            <button
              key={item.type}
              type="button"
              draggable
              onDragStart={(e) => handleDragStart(e, item.type)}
              onClick={() => onSelectTool(item.type)}
              className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-cyan-950/40 border-cyan-500/70'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="p-1.5 rounded-md bg-slate-950 border border-slate-800 shrink-0 mt-0.5">
                  <Icon className={`w-4 h-4 ${accentClass}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {item.name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {item.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {item.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Cold Aisle Containment (CAC) & Room Presets */}
      <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-100">
              Cerramiento Pasillo Frío (CAC)
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
              Aísla los pasillos fríos y reduce un 18% el consumo de ventilación CRAC.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={cacEnabled}
            onClick={onToggleCac}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              cacEnabled
                ? 'bg-cyan-500 border-cyan-400'
                : 'bg-slate-800 border-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-slate-950 shadow transform transition-transform ${
                cacEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="pt-2 border-t border-slate-800/80">
          <div className="text-[11px] font-medium text-slate-400 mb-2">
            Escenarios de Sala Rápidos
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => onLoadPreset('standard')}
              className="px-2 py-1.5 text-[11px] font-medium text-slate-200 bg-slate-900 border border-slate-800 rounded-md hover:border-cyan-500/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              Sala Tipo
            </button>
            <button
              type="button"
              onClick={() => onLoadPreset('faulty')}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-amber-300 bg-slate-900 border border-slate-800 rounded-md hover:border-amber-500/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Con Fallos</span>
            </button>
            <button
              type="button"
              onClick={() => onLoadPreset('empty')}
              className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-400 bg-slate-900 border border-slate-800 rounded-md hover:border-red-500/50 hover:text-red-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Vaciar</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
