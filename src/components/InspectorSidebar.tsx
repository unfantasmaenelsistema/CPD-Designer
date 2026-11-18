import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Cpu,
  Flame,
  Info,
  RotateCw,
  Snowflake,
  Trash2,
  Zap,
} from 'lucide-react';
import { CATALOG_MAP, formatCoord, isRackType } from '../data/catalog';
import { FloorAnalysis, GridCell, TelemetryKPIs } from '../types';

interface InspectorSidebarProps {
  selectedCell: GridCell | null;
  analysis: FloorAnalysis;
  kpis: TelemetryKPIs;
  onUpdateCell: (row: number, col: number, patch: Partial<GridCell>) => void;
  onRotateRack: (row: number, col: number) => void;
  onDeleteCell: (row: number, col: number) => void;
  onConvertPerforatedToBlind: (row: number, col: number) => void;
}

const BTU_PER_KW = 3412.142;
const FRIGORIAS_PER_KW = 859.845;

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  selectedCell,
  analysis,
  kpis,
  onUpdateCell,
  onRotateRack,
  onDeleteCell,
  onConvertPerforatedToBlind,
}) => {
  const cellIssues = selectedCell
    ? analysis.issueMap[`${selectedCell.row}-${selectedCell.col}`] ?? []
    : [];

  const isRack = selectedCell ? isRackType(selectedCell.type) : false;
  const meta = selectedCell ? CATALOG_MAP[selectedCell.type] : undefined;

  return (
    <aside className="w-full lg:w-80 xl:w-96 shrink-0 bg-slate-900/50 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">
          Inspector de Celda &amp; Rack
        </h2>
        {selectedCell && (
          <span className="font-mono text-xs font-semibold text-cyan-400">
            {formatCoord(selectedCell.row, selectedCell.col)}
          </span>
        )}
      </div>

      <div className="p-4 space-y-5 overflow-y-auto flex-1">
        {!selectedCell || selectedCell.type === 'empty' ? (
          /* ROOM ENGINEERING SUMMARY WHEN NO EQUIPMENT IS SELECTED */
          <div className="space-y-5">
            <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Info className="w-4 h-4 text-cyan-400" />
                <span>
                  {selectedCell
                    ? `Celda ${formatCoord(selectedCell.row, selectedCell.col)} vacía`
                    : 'Ninguna celda seleccionada'}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Haz clic sobre cualquier rack, CRAC o baldosa del plano para ajustar su carga térmica (kW), factor de potencia, ocupación en U o redundancia A+B.
              </p>
            </div>

            {/* Cooling Balance */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">Balance Frigorífico de Sala</span>
                <span
                  className={`font-mono font-semibold ${
                    kpis.coolingMarginKw >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {kpis.coolingMarginKw >= 0 ? '+' : ''}
                  {kpis.coolingMarginKw.toFixed(1)} kWt
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Carga térmica total (IT + pérdidas)</span>
                  <span className="font-mono text-slate-200">{kpis.totalHeatKw.toFixed(1)} kWt</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Capacidad CRAC instalada ({kpis.cracCount} uds)</span>
                  <span className="font-mono text-cyan-300">
                    {kpis.totalCoolingCapacityKw.toFixed(1)} kWt
                  </span>
                </div>
              </div>

              {/* Capacity Utilization Bar */}
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    kpis.totalCoolingCapacityKw === 0
                      ? 'bg-red-500'
                      : kpis.totalHeatKw / kpis.totalCoolingCapacityKw > 0.9
                      ? 'bg-red-500'
                      : kpis.totalHeatKw / kpis.totalCoolingCapacityKw > 0.75
                      ? 'bg-amber-400'
                      : 'bg-cyan-400'
                  }`}
                  style={{
                    width: `${
                      kpis.totalCoolingCapacityKw > 0
                        ? Math.min(100, (kpis.totalHeatKw / kpis.totalCoolingCapacityKw) * 100)
                        : kpis.totalHeatKw > 0
                        ? 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* TIA-942 Readiness Diagnostics */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Diagnóstico TIA-942 ({kpis.tier})
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  {Math.round(kpis.dualPowerRackRatio * 100)}% racks A+B
                </span>
              </div>
              <ul className="space-y-1.5">
                {kpis.tierReasons.map((reason, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-xs text-slate-300 leading-snug"
                  >
                    <span className="text-cyan-400 mt-0.5">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Inventory */}
            <div className="pt-3 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Racks IT / Comms</div>
                <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
                  {kpis.rackCount} uds
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Unidades CRAC</div>
                <div className="font-mono text-sm font-semibold text-cyan-300 mt-0.5">
                  {kpis.cracCount} uds
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">SAI / PDU Sala</div>
                <div className="font-mono text-sm font-semibold text-amber-300 mt-0.5">
                  {kpis.pduCount} uds
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Extinción NOVEC</div>
                <div className="font-mono text-sm font-semibold text-emerald-300 mt-0.5">
                  {kpis.safetyCount} uds
                </div>
              </div>
            </div>
          </div>
        ) : isRack ? (
          /* RACK INSPECTOR WITH REAL-TIME SLIDERS & ROTATION */
          <div className="space-y-4">
            {/* Rack Identity & Actions */}
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono text-cyan-400">{meta?.code}</div>
                <h3 className="text-sm font-semibold text-slate-100">{meta?.name}</h3>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  {selectedCell.orientation === 'north' ? (
                    <>
                      <ArrowUp className="w-3.5 h-3.5 text-sky-400" />
                      <span>Frontal Norte (Admisión ↑ / Escape ↓)</span>
                    </>
                  ) : (
                    <>
                      <ArrowDown className="w-3.5 h-3.5 text-sky-400" />
                      <span>Frontal Sur (Admisión ↓ / Escape ↑)</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Rotate 180 & Delete Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onRotateRack(selectedCell.row, selectedCell.col)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-cyan-300 bg-cyan-950/40 border border-cyan-500/50 rounded-lg hover:bg-cyan-900/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rotar 180°</span>
              </button>
              <button
                type="button"
                onClick={() => onDeleteCell(selectedCell.row, selectedCell.col)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg hover:bg-red-950/60 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Eliminar Rack</span>
              </button>
            </div>

            {/* Slider 1: Real IT Load (0.5 kW - 20 kW) */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-kw" className="font-medium text-slate-200">
                  Carga Real IT
                </label>
                <span className="font-mono font-semibold text-cyan-300">
                  {selectedCell.powerKw.toFixed(1)} kW
                </span>
              </div>
              <input
                id="slider-kw"
                type="range"
                min={0.5}
                max={20}
                step={0.1}
                value={selectedCell.powerKw}
                onChange={(e) =>
                  onUpdateCell(selectedCell.row, selectedCell.col, {
                    powerKw: parseFloat(e.target.value),
                  })
                }
                className="w-full dcim-slider"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-500">
                <span>0.5 kW</span>
                <span>10.0 kW</span>
                <span>20.0 kW</span>
              </div>
            </div>

            {/* Slider 2: Power Factor (0.80 - 0.99) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-pf" className="font-medium text-slate-200">
                  Factor de Potencia (cos φ)
                </label>
                <span className="font-mono font-semibold text-slate-100">
                  {selectedCell.powerFactor.toFixed(2)}
                </span>
              </div>
              <input
                id="slider-pf"
                type="range"
                min={0.8}
                max={0.99}
                step={0.01}
                value={selectedCell.powerFactor}
                onChange={(e) =>
                  onUpdateCell(selectedCell.row, selectedCell.col, {
                    powerFactor: parseFloat(e.target.value),
                  })
                }
                className="w-full dcim-slider"
              />
              <div className="flex justify-between font-mono text-[10px] text-slate-500">
                <span>0.80</span>
                <span>0.90</span>
                <span>0.99</span>
              </div>
            </div>

            {/* Slider 3: U Occupancy (1 - 42 U) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="slider-u" className="font-medium text-slate-200">
                  Ocupación en Rack
                </label>
                <span className="font-mono font-semibold text-slate-100">
                  {selectedCell.uUsed} / {selectedCell.uTotal} U
                </span>
              </div>
              <input
                id="slider-u"
                type="range"
                min={1}
                max={42}
                step={1}
                value={selectedCell.uUsed}
                onChange={(e) =>
                  onUpdateCell(selectedCell.row, selectedCell.col, {
                    uUsed: parseInt(e.target.value, 10),
                  })
                }
                className="w-full dcim-slider"
              />
              <div className="h-1.5 w-full rounded bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all"
                  style={{ width: `${(selectedCell.uUsed / selectedCell.uTotal) * 100}%` }}
                />
              </div>
            </div>

            {/* Dual Power Feed Toggle (A+B) */}
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-100">
                  Doble Alimentación (A+B)
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Requerido para redundancia Tier III / IV con doble PDU.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={selectedCell.dualPower}
                onClick={() =>
                  onUpdateCell(selectedCell.row, selectedCell.col, {
                    dualPower: !selectedCell.dualPower,
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${
                  selectedCell.dualPower
                    ? 'bg-emerald-500 border-emerald-400'
                    : 'bg-slate-800 border-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-slate-950 shadow transform transition-transform ${
                    selectedCell.dualPower ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Cell Calculated Electrical & Thermal Specs */}
            <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Potencia Aparente</div>
                <div className="font-mono text-sm font-semibold text-cyan-300 mt-0.5">
                  {(selectedCell.powerKw / selectedCell.powerFactor).toFixed(2)} kVA
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Intensidad (230V eq.)</div>
                <div className="font-mono text-sm font-semibold text-slate-100 mt-0.5">
                  {((selectedCell.powerKw * 1000) / (230 * selectedCell.powerFactor)).toFixed(1)} A
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Calor Disipado</div>
                <div className="font-mono text-xs font-semibold text-amber-300 mt-0.5">
                  {Math.round(selectedCell.powerKw * BTU_PER_KW).toLocaleString('es-ES')} BTU/h
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div className="text-slate-400 text-[11px]">Frigorías Requeridas</div>
                <div className="font-mono text-xs font-semibold text-slate-100 mt-0.5">
                  {Math.round(selectedCell.powerKw * FRIGORIAS_PER_KW).toLocaleString('es-ES')} Frig/h
                </div>
              </div>
            </div>

            {/* Cell Thermal Audit Status */}
            {cellIssues.length > 0 ? (
              <div className="space-y-2">
                {cellIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 rounded-lg bg-red-950/35 border border-red-500/50 text-xs text-red-200 space-y-1"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{issue.title}</span>
                    </div>
                    <p className="text-[11px] text-red-200/90 leading-snug">{issue.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2.5 rounded-lg bg-emerald-950/25 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Flujo de admisión/escape validado en esta posición.</span>
              </div>
            )}
          </div>
        ) : (
          /* NON-RACK EQUIPMENT INSPECTOR (CRAC, PERFORATED, BLIND, PDU, SAFETY) */
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-800">
              <div className="font-mono text-xs text-cyan-400">{meta?.code}</div>
              <h3 className="text-sm font-semibold text-slate-100 mt-0.5">{meta?.name}</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{meta?.description}</p>
            </div>

            {selectedCell.type === 'crac' && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400 text-[11px] flex items-center gap-1">
                    <Snowflake className="w-3 h-3 text-cyan-400" />
                    <span>Capacidad Frío</span>
                  </div>
                  <div className="font-mono text-sm font-semibold text-cyan-300 mt-1">
                    25.0 kWt
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400 text-[11px] flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Consumo Eléctrico</span>
                  </div>
                  <div className="font-mono text-sm font-semibold text-slate-100 mt-1">
                    {kpis.cracCount > 0
                      ? `${(kpis.cracElectricalKw / kpis.cracCount).toFixed(1)} kW`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Media por CRAC según la carga actual
                  </div>
                </div>
              </div>
            )}

            {selectedCell.type === 'pdu' && (
              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/30 text-xs space-y-1">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  <span>Disipación Térmica por Conversión</span>
                </div>
                <p className="text-slate-300 font-mono">
                  +1.5 kWt ({Math.round(1.5 * BTU_PER_KW).toLocaleString('es-ES')} BTU/h)
                </p>
              </div>
            )}

            {selectedCell.type === 'safety' && (
              <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/30 text-xs space-y-1">
                <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5" />
                  <span>Protección Activa contra Incendios</span>
                </div>
                <p className="text-slate-300">
                  Agente limpio NOVEC 1230 / FM-200 + detección temprana termovelocimétrica activa.
                </p>
              </div>
            )}

            {cellIssues.length > 0 && (
              <div className="space-y-2">
                {cellIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 rounded-lg bg-red-950/35 border border-red-500/50 text-xs text-red-200 space-y-2"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{issue.title}</span>
                    </div>
                    <p className="text-[11px] leading-snug">{issue.detail}</p>
                    {selectedCell.type === 'perforated' && (
                      <button
                        type="button"
                        onClick={() =>
                          onConvertPerforatedToBlind(selectedCell.row, selectedCell.col)
                        }
                        className="w-full py-1.5 px-3 rounded bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-400 font-medium transition-colors cursor-pointer"
                      >
                        Sustituir por Baldosa Ciega
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => onDeleteCell(selectedCell.row, selectedCell.col)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-red-300 bg-red-950/30 border border-red-500/40 rounded-lg hover:bg-red-950/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Vaciar Celda</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Note inside Inspector */}
      <div className="p-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
        <span className="inline-flex items-center gap-1">
          <Cpu className="w-3.5 h-3.5" />
          <span>Motor TIA-942 en vivo</span>
        </span>
        <span className="font-mono">ASHRAE TC 9.9</span>
      </div>
    </aside>
  );
};
