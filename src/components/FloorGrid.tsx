import React from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Flame,
  Play,
  RotateCw,
  Snowflake,
  Square,
  Wind,
  Zap,
} from 'lucide-react';
import {
  CATALOG_MAP,
  formatCoord,
  GRID_COLS,
  GRID_ROWS,
  isRackType,
  ROOM_AREA_M2,
  ROOM_DEPTH_M,
  ROOM_WIDTH_M,
} from '../data/catalog';
import {
  AppMode,
  CtfMission,
  CtfMissionId,
  FloorAnalysis,
  GridCell,
  RackOrientation,
  TileType,
} from '../types';
import { BrushTool } from './CatalogSidebar';

interface FloorGridProps {
  grid: GridCell[][];
  analysis: FloorAnalysis;
  selectedCoord: { row: number; col: number } | null;
  activeTool: BrushTool;
  cacEnabled: boolean;
  mode: AppMode;
  missions: CtfMission[];
  unlockedFlags: string[];
  activeMissionId: CtfMissionId;
  onSelectMission: (id: CtfMissionId) => void;
  onActivateCtfMission: (id: CtfMissionId) => void;
  onCellClick: (row: number, col: number) => void;
  onDropCatalogItem: (row: number, col: number, type: TileType, orientation: RackOrientation) => void;
  onMoveCell: (fromRow: number, fromCol: number, toRow: number, toCol: number) => void;
  onQuickRotateRack: (row: number, col: number) => void;
}

export const FloorGrid: React.FC<FloorGridProps> = ({
  grid,
  analysis,
  selectedCoord,
  activeTool,
  cacEnabled,
  mode,
  missions,
  unlockedFlags,
  activeMissionId,
  onSelectMission,
  onActivateCtfMission,
  onCellClick,
  onDropCatalogItem,
  onMoveCell,
  onQuickRotateRack,
}) => {
  const activeMission = missions.find((m) => m.id === activeMissionId) ?? missions[0];

  const handleCellDragStart = (e: React.DragEvent, cell: GridCell) => {
    if (cell.type === 'empty') {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(
      'application/cpd-move-cell',
      JSON.stringify({ row: cell.row, col: cell.col })
    );
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCellDrop = (e: React.DragEvent, targetRow: number, targetCol: number) => {
    e.preventDefault();
    const moveRaw = e.dataTransfer.getData('application/cpd-move-cell');
    if (moveRaw) {
      try {
        const parsed = JSON.parse(moveRaw) as { row: number; col: number };
        if (parsed.row !== targetRow || parsed.col !== targetCol) {
          onMoveCell(parsed.row, parsed.col, targetRow, targetCol);
        }
      } catch {
        // Ignore malformed drag payload
      }
      return;
    }

    const catalogType = e.dataTransfer.getData('application/cpd-catalog-type') as TileType;
    const orientation =
      (e.dataTransfer.getData('application/cpd-orientation') as RackOrientation) || 'south';
    if (catalogType) {
      onDropCatalogItem(targetRow, targetCol, catalogType, orientation);
    }
  };

  return (
    <section className="flex-1 min-w-0 p-4 lg:p-5 flex flex-col gap-4 overflow-y-auto bg-slate-950">
      {/* CTF Mission Strip (Visible in Misiones CTF mode) */}
      {mode === 'ctf' && activeMission && (
        <div className="bg-slate-900/80 border border-amber-500/30 rounded-lg p-3.5 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {missions.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelectMission(m.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                    m.id === activeMission.id
                      ? 'bg-amber-500/20 border-amber-500/60 text-amber-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {m.completed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <span className="font-mono text-[11px]">{m.code}</span>
                  )}
                  <span>{m.title}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={() => onActivateCtfMission(activeMission.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-3 h-3" />
                <span>Cargar Reto</span>
              </button>
              <span
                className={`font-mono text-xs font-semibold ${
                  activeMission.completed || unlockedFlags.includes(activeMission.flag)
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {activeMission.completed || unlockedFlags.includes(activeMission.flag)
                  ? activeMission.flag
                  : 'EN PROGRESO'}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-300">{activeMission.brief}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 pt-1">
            {activeMission.objectives.map((obj) => (
              <div
                key={obj.id}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded border text-xs ${
                  obj.passed
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950/70 border-slate-800 text-slate-400'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    obj.passed ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                />
                <span className="leading-tight">{obj.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room Header & Airflow Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold text-slate-100">
            Plano de Suelo Técnico Elevado (12 × 8 Baldosas)
          </h2>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
            <span className="font-mono">
              {ROOM_WIDTH_M.toFixed(1)} m × {ROOM_DEPTH_M.toFixed(1)} m ({ROOM_AREA_M2} m²)
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Herramienta activa:{' '}
              <strong className="text-cyan-300 font-medium">
                {activeTool === 'inspect'
                  ? 'Inspeccionar'
                  : activeTool === 'empty'
                  ? 'Vaciar celda'
                  : CATALOG_MAP[activeTool]?.name}
              </strong>
            </span>
          </div>
        </div>

        {/* Crisp Airflow & Containment Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-xs bg-sky-400 inline-block" />
            <span>Admisión Fría</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1.5 rounded-xs bg-red-500 inline-block" />
            <span>Escape Caliente</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border border-cyan-400 bg-cyan-950/50 inline-block" />
            <span>Pasillo Frío {cacEnabled ? '(CAC)' : ''}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs border border-red-500 thermal-hazard-bg inline-block" />
            <span>Hotspot / Error</span>
          </span>
        </div>
      </div>

      {/* 12x8 Raised Floor Matrix */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 sm:p-4 overflow-x-auto">
        <div className="min-w-[740px]">
          {/* Column Coordinates C01..C12 */}
          <div className="grid grid-cols-[36px_repeat(12,minmax(0,1fr))] gap-1.5 mb-1.5">
            <div />
            {Array.from({ length: GRID_COLS }, (_, c) => (
              <div
                key={`col-${c}`}
                className="text-center font-mono text-[10px] font-medium text-slate-500"
              >
                C{String(c + 1).padStart(2, '0')}
              </div>
            ))}
          </div>

          {/* Grid Rows F01..F08 */}
          <div className="space-y-1.5">
            {grid.map((rowCells, r) => (
              <div
                key={`row-${r}`}
                className="grid grid-cols-[36px_repeat(12,minmax(0,1fr))] gap-1.5 items-stretch"
              >
                {/* Row Label */}
                <div className="flex items-center justify-end pr-2 font-mono text-[10px] font-medium text-slate-500">
                  F{String(r + 1).padStart(2, '0')}
                </div>

                {rowCells.map((cell, c) => {
                  const k = `${r}-${c}`;
                  const cellIssues = analysis.issueMap[k] ?? [];
                  const hasCritical = cellIssues.some((i) => i.severity === 'critical');
                  const hasWarning = !hasCritical && cellIssues.some((i) => i.severity === 'warning');
                  const isContainedCold = Boolean(analysis.containedColdTiles[k]);
                  const isColdAisle = Boolean(analysis.coldAisleTiles[k]);
                  const isHotAisle = Boolean(analysis.hotAisleTiles[k]);
                  const isSelected =
                    selectedCoord?.row === r && selectedCoord?.col === c;
                  const isRack = isRackType(cell.type);
                  const itemMeta = CATALOG_MAP[cell.type];

                  // Base cell surface
                  let cellSurfaceClass =
                    'bg-slate-950/90 border-slate-800/90 hover:border-slate-600';

                  if (cell.type === 'blind') {
                    cellSurfaceClass =
                      'bg-slate-900 border-slate-800 hover:border-slate-600';
                  } else if (cell.type === 'perforated') {
                    cellSurfaceClass =
                      'bg-slate-900 perforated-tile-bg border-cyan-500/40 hover:border-cyan-400';
                  } else if (cell.type === 'crac') {
                    cellSurfaceClass =
                      'bg-cyan-950/40 border-cyan-500/50 hover:border-cyan-400';
                  } else if (cell.type === 'pdu') {
                    cellSurfaceClass =
                      'bg-amber-950/30 border-amber-500/50 hover:border-amber-400';
                  } else if (cell.type === 'safety') {
                    cellSurfaceClass =
                      'bg-emerald-950/30 border-emerald-500/50 hover:border-emerald-400';
                  } else if (isRack) {
                    cellSurfaceClass =
                      cell.type === 'rack_hd'
                        ? 'bg-slate-800/95 border-amber-500/40 hover:border-amber-400'
                        : 'bg-slate-800/95 border-slate-600 hover:border-cyan-400';
                  }

                  // CAC containment ring on valid cold aisle tiles
                  if (isContainedCold && !hasCritical) {
                    cellSurfaceClass +=
                      ' ring-2 ring-inset ring-cyan-400/75 bg-cyan-950/35';
                  } else if (isColdAisle && !hasCritical && cell.type === 'empty') {
                    cellSurfaceClass += ' bg-sky-950/20';
                  } else if (isHotAisle && !hasCritical && cell.type === 'empty') {
                    cellSurfaceClass += ' bg-red-950/15';
                  }

                  // Thermal Critical / Warning override
                  if (hasCritical) {
                    cellSurfaceClass =
                      'thermal-hazard-bg border-red-500 ring-1 ring-inset ring-red-500/80';
                  } else if (hasWarning) {
                    cellSurfaceClass += ' ring-1 ring-inset ring-amber-400/80';
                  }

                  if (isSelected) {
                    cellSurfaceClass +=
                      ' outline-2 outline-offset-1 outline-cyan-400 z-10';
                  }

                  return (
                    <div
                      key={k}
                      role="button"
                      tabIndex={0}
                      draggable={cell.type !== 'empty'}
                      onDragStart={(e) => handleCellDragStart(e, cell)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => handleCellDrop(e, r, c)}
                      onClick={() => onCellClick(r, c)}
                      onDoubleClick={() => {
                        if (isRack) onQuickRotateRack(r, c);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCellClick(r, c);
                        }
                      }}
                      title={`${formatCoord(r, c)} · ${
                        itemMeta ? itemMeta.name : 'Celda vacía'
                      }${
                        isRack
                          ? ` (${cell.powerKw.toFixed(1)} kW, Frontal ${
                              cell.orientation === 'north' ? 'Norte' : 'Sur'
                            })`
                          : ''
                      }${hasCritical ? ' — ALERTA TÉRMICA' : ''}`}
                      className={`relative aspect-square min-h-[54px] rounded-md border transition-all cursor-pointer select-none flex flex-col justify-between overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${cellSurfaceClass}`}
                    >
                      {/* RACK VISUALIZATION: Blue Cold Intake Edge + Red Hot Exhaust Edge */}
                      {isRack && (
                        <>
                          {/* Top Edge: Blue Intake if North, Red Exhaust if South */}
                          <div
                            className={`h-2 w-full flex items-center justify-center ${
                              cell.orientation === 'north'
                                ? 'bg-sky-500/90 text-slate-950'
                                : 'bg-red-500/90 text-slate-950'
                            }`}
                          >
                            {cell.orientation === 'north' ? (
                              <ArrowDown className="w-2.5 h-2.5 stroke-[3]" />
                            ) : (
                              <ArrowUp className="w-2.5 h-2.5 stroke-[3]" />
                            )}
                          </div>

                          {/* Rack Center Body */}
                          <div className="px-1 flex flex-col items-center justify-center text-center leading-none gap-0.5 flex-1">
                            <div className="flex items-center gap-0.5">
                              <span
                                className={`font-mono text-[9px] font-bold ${
                                  cell.type === 'rack_hd'
                                    ? 'text-amber-300'
                                    : cell.type === 'rack_net'
                                    ? 'text-cyan-300'
                                    : 'text-slate-200'
                                }`}
                              >
                                {itemMeta?.code === 'HD-AI' ? 'HD' : itemMeta?.code}
                              </span>
                              {cell.dualPower && (
                                <span className="font-mono text-[8px] text-emerald-400 font-bold">
                                  AB
                                </span>
                              )}
                            </div>
                            <span className="font-mono text-[9px] font-semibold text-slate-100 tabular-nums">
                              {cell.powerKw.toFixed(1)}kW
                            </span>
                          </div>

                          {/* Bottom Edge: Red Exhaust if North, Blue Intake if South */}
                          <div
                            className={`h-2 w-full flex items-center justify-center ${
                              cell.orientation === 'north'
                                ? 'bg-red-500/90 text-slate-950'
                                : 'bg-sky-500/90 text-slate-950'
                            }`}
                          >
                            {cell.orientation === 'north' ? (
                              <ArrowDown className="w-2.5 h-2.5 stroke-[3]" />
                            ) : (
                              <ArrowUp className="w-2.5 h-2.5 stroke-[3]" />
                            )}
                          </div>
                        </>
                      )}

                      {/* NON-RACK EQUIPMENT VISUALIZATION */}
                      {!isRack && cell.type === 'crac' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center">
                          <Snowflake className="w-4 h-4 text-cyan-300" />
                          <span className="font-mono text-[9px] font-bold text-cyan-200 mt-0.5">
                            CRAC
                          </span>
                        </div>
                      )}

                      {!isRack && cell.type === 'perforated' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center">
                          <Wind
                            className={`w-3.5 h-3.5 ${
                              hasCritical ? 'text-red-400' : 'text-cyan-300'
                            }`}
                          />
                          <span
                            className={`font-mono text-[8px] font-semibold mt-0.5 ${
                              hasCritical ? 'text-red-300' : 'text-cyan-300'
                            }`}
                          >
                            PERF
                          </span>
                        </div>
                      )}

                      {!isRack && cell.type === 'blind' && (
                        <div className="flex-1 flex items-center justify-center">
                          <Square className="w-3 h-3 text-slate-700" />
                        </div>
                      )}

                      {!isRack && cell.type === 'pdu' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center">
                          <Zap className="w-4 h-4 text-amber-400" />
                          <span className="font-mono text-[8px] font-bold text-amber-300 mt-0.5">
                            PDU
                          </span>
                        </div>
                      )}

                      {!isRack && cell.type === 'safety' && (
                        <div className="flex-1 flex flex-col items-center justify-center p-1 text-center">
                          <Flame className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="font-mono text-[8px] font-bold text-emerald-300 mt-0.5">
                            GAS
                          </span>
                        </div>
                      )}

                      {/* Hotspot / Thermal Alert Badge Overlay */}
                      {(hasCritical || hasWarning) && (
                        <div
                          className={`absolute top-0.5 right-0.5 rounded p-0.5 ${
                            hasCritical
                              ? 'bg-red-600 text-white'
                              : 'bg-amber-500 text-slate-950'
                          }`}
                        >
                          <AlertTriangle className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Helpful Interaction Hint */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            Doble clic sobre un rack para rotar 180° · Arrastra cualquier equipo para moverlo de baldosa.
          </span>
          <span className="font-mono">
            Atajos: [R] Rotar seleccionado · [Supr] Vaciar celda
          </span>
        </div>
      </div>

      {/* Real-Time Spatial Thermal Validation Console */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {analysis.issues.length > 0 ? (
              <Flame className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <h3 className="text-sm font-semibold text-slate-100">
              Motor de Validación Térmica Espacial
            </h3>
          </div>
          <span className="font-mono text-xs text-slate-400">
            {analysis.hotspotCount} hotspot(s) · {analysis.misplacedPerforatedCount} rejilla(s) errónea(s)
          </span>
        </div>

        {analysis.issues.length === 0 ? (
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-emerald-950/25 border border-emerald-500/30 text-xs text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                Flujo de pasillos fríos/calientes validado sin cortocircuitos térmicos ni recirculación de aire caliente.
              </span>
            </div>
            {cacEnabled && (
              <span className="font-mono text-[11px] text-cyan-300 shrink-0">
                CAC -18% ventilación activo
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {analysis.issues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => onCellClick(issue.row, issue.col)}
                className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-3 cursor-pointer ${
                  issue.severity === 'critical'
                    ? 'bg-red-950/30 border-red-500/40 hover:border-red-400'
                    : 'bg-amber-950/25 border-amber-500/40 hover:border-amber-400'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle
                    className={`w-4 h-4 shrink-0 mt-0.5 ${
                      issue.severity === 'critical' ? 'text-red-400' : 'text-amber-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100">
                      {issue.title}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                      {issue.detail}
                    </p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-cyan-300 shrink-0">
                  <RotateCw className="w-3 h-3" />
                  <span>Ubicar</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
