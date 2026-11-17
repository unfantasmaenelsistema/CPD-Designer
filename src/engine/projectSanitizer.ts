/**
 * Saneado de un proyecto que llega de localStorage o de un JSON importado.
 *
 * Antes se aceptaba tal cual: un valor fuera de los rangos de la interfaz (por ejemplo baterías de
 * 999 999 Ah) desbloqueaba la misión del SAI sin diseñar nada, y las flags guardadas en el archivo se
 * daban por capturadas aunque fueran inventadas. Aquí cada número se limita al rango de su control,
 * cada opción a sus valores válidos y cada celda del plano se reconstruye con su tipo.
 */
import { createCell, createStandardPresetGrid, GRID_COLS, GRID_ROWS, isRackType } from '../data/catalog';
import {
  AuditChecklist,
  GridCell,
  RackOrientation,
  ThermalConfig,
  Tia942Config,
  TileType,
  UpsConfig,
} from '../types';
import {
  CTF_FLAGS,
  DEFAULT_AUDIT_CHECKLIST,
  DEFAULT_THERMAL_CONFIG,
  DEFAULT_TIA942_CONFIG,
  DEFAULT_UPS_CONFIG,
} from './dcimEngine';

type Dict = Record<string, unknown>;

const isObj = (v: unknown): v is Dict => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const clamp = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const oneOf = <T,>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const TILE_TYPES: TileType[] = ['empty', 'rack_std', 'rack_hd', 'rack_net', 'crac', 'perforated', 'blind', 'pdu', 'safety'];
const ORIENTATIONS: RackOrientation[] = ['north', 'south'];

function sanitizeCell(raw: unknown, row: number, col: number): GridCell {
  if (!isObj(raw)) return createCell(row, col, 'empty');
  const type = oneOf(raw.type, TILE_TYPES, 'empty');
  const orientation = oneOf(raw.orientation, ORIENTATIONS, 'south');
  const base = createCell(row, col, type, orientation);
  const label = typeof raw.label === 'string' ? raw.label.slice(0, 40) : base.label;
  if (!isRackType(type)) {
    // Solo los racks se editan en el inspector: el resto conserva los valores de catálogo.
    return { ...base, label };
  }
  return {
    ...base,
    label,
    powerKw: clamp(raw.powerKw, 0.5, 20, base.powerKw),
    powerFactor: clamp(raw.powerFactor, 0.8, 0.99, base.powerFactor),
    uUsed: Math.round(clamp(raw.uUsed, 1, 42, base.uUsed)),
    dualPower: bool(raw.dualPower, base.dualPower),
  };
}

/** Plano 8×12 con cada celda reconstruida; si no tiene esa forma, la sala tipo. */
export function sanitizeGrid(raw: unknown): GridCell[][] | null {
  if (!Array.isArray(raw) || raw.length !== GRID_ROWS || !raw.every((r) => Array.isArray(r) && r.length === GRID_COLS)) {
    return null;
  }
  return raw.map((r: unknown[], row) => r.map((cell, col) => sanitizeCell(cell, row, col)));
}

export function sanitizeUpsConfig(raw: unknown): UpsConfig {
  const d = DEFAULT_UPS_CONFIG;
  if (!isObj(raw)) return d;
  return {
    manualExtraKw: clamp(raw.manualExtraKw, 0, 100, d.manualExtraKw),
    manualPowerFactor: clamp(raw.manualPowerFactor, 0.8, 0.99, d.manualPowerFactor),
    technology: oneOf(raw.technology, ['vfd', 'vi', 'vfi'] as const, d.technology),
    growthMarginPct: clamp(raw.growthMarginPct, 0, 50, d.growthMarginPct),
    inverterEfficiencyPct: clamp(raw.inverterEfficiencyPct, 90, 98, d.inverterEfficiencyPct),
    redundancy: oneOf(raw.redundancy, ['N', 'N+1', '2N', '2(N+1)'] as const, d.redundancy),
    chemistry: oneOf(raw.chemistry, ['vrla', 'lifepo4'] as const, d.chemistry),
    targetRuntimeMin: clamp(raw.targetRuntimeMin, 5, 120, d.targetRuntimeMin),
    dcBusVoltage: oneOf(raw.dcBusVoltage, [192, 240, 384, 480] as const, d.dcBusVoltage),
    roomTempC: clamp(raw.roomTempC, 18, 35, d.roomTempC),
    blockCapacityAh: oneOf(raw.blockCapacityAh, [65, 100, 150, 200], d.blockCapacityAh),
    hasGeneratorAts: bool(raw.hasGeneratorAts, d.hasGeneratorAts),
    floorMaxLoadKgM2: oneOf(raw.floorMaxLoadKgM2, [1000, 1200, 1500], d.floorMaxLoadKgM2),
  };
}

export function sanitizeThermalConfig(raw: unknown): ThermalConfig {
  const d = DEFAULT_THERMAL_CONFIG;
  if (!isObj(raw)) return d;
  return {
    techniciansCount: Math.round(clamp(raw.techniciansCount, 0, 10, d.techniciansCount)),
    supplyTempC: clamp(raw.supplyTempC, 14, 32, d.supplyTempC),
    relativeHumidityPct: clamp(raw.relativeHumidityPct, 20, 80, d.relativeHumidityPct),
    coolingTech: oneOf(raw.coolingTech, ['dx', 'chiller', 'freecooling'] as const, d.coolingTech),
    energyPriceEurKwh: clamp(raw.energyPriceEurKwh, 0.01, 2, d.energyPriceEurKwh),
  };
}

export function sanitizeTiaConfig(raw: unknown): Tia942Config {
  const d = DEFAULT_TIA942_CONFIG;
  if (!isObj(raw)) return d;
  return {
    utilityFeeds: oneOf(raw.utilityFeeds, ['single', 'dual_substation'] as const, d.utilityFeeds),
    dieselRedundancy: oneOf(raw.dieselRedundancy, ['none', 'N', 'N+1', '2N'] as const, d.dieselRedundancy),
    fuelAutonomyHours: oneOf(raw.fuelAutonomyHours, ['12h', '24h', '72h'] as const, d.fuelAutonomyHours),
    distributionPath: oneOf(raw.distributionPath, ['single', 'dual_ab'] as const, d.distributionPath),
    mechanicalRedundancySource: oneOf(raw.mechanicalRedundancySource, ['from_floor', 'N', 'N+1', '2(N+1)'] as const, d.mechanicalRedundancySource),
    chilledWaterLoop: oneOf(raw.chilledWaterLoop, ['single_loop', 'dual_loop_isolated'] as const, d.chilledWaterLoop),
    fiberEntrances: oneOf(raw.fiberEntrances, ['single_entrance', 'dual_20m'] as const, d.fiberEntrances),
    coreRedundancy: oneOf(raw.coreRedundancy, ['single', 'redundant_diverse'] as const, d.coreRedundancy),
    fireRating: oneOf(raw.fireRating, ['RF-60', 'RF-120'] as const, d.fireRating),
    accessControl: oneOf(raw.accessControl, ['key', 'rfid', 'mantrap_biometric'] as const, d.accessControl),
  };
}

export function sanitizeChecklist(raw: unknown): AuditChecklist {
  const d = DEFAULT_AUDIT_CHECKLIST;
  if (!isObj(raw)) return d;
  return {
    tia607Grounding: bool(raw.tia607Grounding, d.tia607Grounding),
    leakDetectionRope: bool(raw.leakDetectionRope, d.leakDetectionRope),
    epoProtectedCover: bool(raw.epoProtectedCover, d.epoProtectedCover),
    noWetSprinklers: bool(raw.noWetSprinklers, d.noWetSprinklers),
  };
}

/** Solo flags que existen en el simulador (las guardadas por este mismo navegador). */
export function sanitizeFlags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((f): f is string => typeof f === 'string' && CTF_FLAGS.includes(f))));
}

export function sanitizeGridOrPreset(raw: unknown): GridCell[][] {
  return sanitizeGrid(raw) ?? createStandardPresetGrid();
}
