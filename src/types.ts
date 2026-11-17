export type TileType =
  | 'empty'
  | 'rack_std'
  | 'rack_hd'
  | 'rack_net'
  | 'crac'
  | 'perforated'
  | 'blind'
  | 'pdu'
  | 'safety';

export type RackOrientation = 'north' | 'south';

export type TabId = 'floor' | 'ups' | 'thermal' | 'tier' | 'audit';

export type AppMode = 'free' | 'ctf';

export type UpsTechnology = 'vfd' | 'vi' | 'vfi';
export type UpsRedundancy = 'N' | 'N+1' | '2N' | '2(N+1)';
export type BatteryChemistry = 'vrla' | 'lifepo4';
export type DcBusVoltage = 192 | 240 | 384 | 480;

export type CoolingTechnology = 'dx' | 'chiller' | 'freecooling';

export interface ThermalConfig {
  techniciansCount: number;
  supplyTempC: number;
  relativeHumidityPct: number;
  coolingTech: CoolingTechnology;
  energyPriceEurKwh: number;
}

export interface UpsConfig {
  manualExtraKw: number;
  manualPowerFactor: number;
  technology: UpsTechnology;
  growthMarginPct: number;
  inverterEfficiencyPct: number;
  redundancy: UpsRedundancy;
  chemistry: BatteryChemistry;
  targetRuntimeMin: number;
  dcBusVoltage: DcBusVoltage;
  roomTempC: number;
  blockCapacityAh: number;
  hasGeneratorAts: boolean;
  floorMaxLoadKgM2: number;
}

export interface Tia942Config {
  utilityFeeds: 'single' | 'dual_substation';
  dieselRedundancy: 'none' | 'N' | 'N+1' | '2N';
  fuelAutonomyHours: '12h' | '24h' | '72h';
  distributionPath: 'single' | 'dual_ab';
  mechanicalRedundancySource: 'from_floor' | 'N' | 'N+1' | '2(N+1)';
  chilledWaterLoop: 'single_loop' | 'dual_loop_isolated';
  fiberEntrances: 'single_entrance' | 'dual_20m';
  coreRedundancy: 'single' | 'redundant_diverse';
  fireRating: 'RF-60' | 'RF-120';
  accessControl: 'key' | 'rfid' | 'mantrap_biometric';
}

export interface AuditChecklist {
  tia607Grounding: boolean; // CBN / Mesh-BN equipotential grounding
  leakDetectionRope: boolean; // Underfloor water leak detection sensor
  epoProtectedCover: boolean; // Emergency Power Off with accidental-press cover
  noWetSprinklers: boolean; // Verified NO wet-pipe water sprinklers above IT racks
}

export type AuditSeverity = 'critical' | 'major' | 'minor' | 'pass';

export interface AuditFinding {
  id: string;
  category: string;
  severity: AuditSeverity;
  title: string;
  detail: string;
  recommendation: string;
}

export interface AuditReport {
  timestamp: string;
  findings: AuditFinding[];
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  passCount: number;
  scorePct: number;
  verdict: 'APTO PARA PRODUCCIÓN' | 'APTO CON OBSERVACIONES' | 'NO CONFORME (RIESGO CRÍTICO)';
}

export type TierLevel = 'Tier I' | 'Tier II' | 'Tier III' | 'Tier IV';

export interface SubsystemTierEvaluation {
  id: 'electrical' | 'mechanical' | 'telecom' | 'architectural';
  name: string;
  tier: TierLevel;
  tierNum: 1 | 2 | 3 | 4;
  summary: string;
  bottleneckReason: string;
}

export interface Tia942EvaluationResult {
  globalTier: TierLevel;
  globalTierNum: 1 | 2 | 3 | 4;
  availabilityPct: string;
  annualDowntimeHours: string;
  weakestSubsystem: SubsystemTierEvaluation;
  subsystems: SubsystemTierEvaluation[];
  effectiveMechanicalRedundancy: 'N' | 'N+1' | '2(N+1)';
  weakestLinkExplanation: string;
}

export interface UpsCalculationResult {
  floorItKw: number;
  floorItKva: number;
  manualExtraKw: number;
  manualExtraKva: number;
  totalCriticalKw: number;
  totalCriticalKva: number;
  effectivePowerFactor: number;
  recommendedUpsKva: number;
  recommendedUpsKw: number;
  loadFactorPct: number;
  moduleCountActive: number;
  moduleCountTotal: number;
  moduleRatingKva: number;
  perModuleLoadPct: number;
  upsElectricalLossKw: number;
  upsThermalLossBtuH: number;
  transferTimeMs: string;
  isTopologySafeForCpds: boolean;
  dcDischargeCurrentA: number;
  agingFactor: number;
  tempCorrectionFactor: number;
  peukertExponent: number;
  peukertMultiplier: number;
  cRate: number;
  rawAhRequired: number;
  correctedAhRequired: number;
  blocksPerString: number;
  parallelStrings: number;
  installedAhTotal: number;
  totalBlocks: number;
  weightPerBlockKg: number;
  totalBatteryWeightKg: number;
  estimatedCabinets: number;
  footprintM2: number;
  floorLoadKgM2: number;
  isFloorOverloaded: boolean;
  estimatedActualRuntimeMin: number;
}

export interface GridCell {
  row: number;
  col: number;
  type: TileType;
  label?: string;
  orientation: RackOrientation;
  powerKw: number;
  powerFactor: number;
  uUsed: number;
  uTotal: number;
  dualPower: boolean;
}

export interface CatalogItem {
  type: TileType;
  code: string;
  name: string;
  shortName: string;
  category: 'compute' | 'cooling' | 'floor' | 'power_safety';
  description: string;
  defaultPowerKw: number;
  defaultPowerFactor: number;
  defaultUUsed: number;
  coolingCapacityKw: number;
  electricalDrawKw: number;
  thermalLossKw: number;
  isRack: boolean;
}

export type ThermalIssueSeverity = 'critical' | 'warning';

export interface ThermalIssue {
  id: string;
  row: number;
  col: number;
  severity: ThermalIssueSeverity;
  code: string;
  title: string;
  detail: string;
  relatedCoords?: Array<{ row: number; col: number }>;
}

export interface FloorAnalysis {
  issues: ThermalIssue[];
  issueMap: Record<string, ThermalIssue[]>;
  coldAisleTiles: Record<string, boolean>;
  hotAisleTiles: Record<string, boolean>;
  containedColdTiles: Record<string, boolean>;
  hotspotCount: number;
  misplacedPerforatedCount: number;
  clearanceWarningCount: number;
}

export interface TelemetryKPIs {
  totalItKw: number;
  totalItKva: number;
  weightedPowerFactor: number;
  pduLossKw: number;
  jouleLossKw: number;
  upsLossKw: number;
  lightingEnvelopeKw: number;
  peopleHeatKw: number;
  totalHeatKw: number;
  totalBtuPerHour: number;
  totalFrigoriasPerHour: number;
  totalCoolingTons: number;
  cracCount: number;
  totalCoolingCapacityKw: number;
  totalCoolingCapacityBtuH: number;
  cracElectricalKw: number;
  effectiveCop: number;
  coolingMarginKw: number;
  thermalPenaltyKw: number;
  totalFacilityKw: number;
  pue: number;
  dciePct: number;
  pueStatus: 'optimal' | 'moderate' | 'critical' | 'idle';
  tier: TierLevel;
  tierReasons: string[];
  rackCount: number;
  dualPowerRackRatio: number;
  pduCount: number;
  safetyCount: number;
  perforatedCount: number;
}

export interface ProjectData {
  version: string;
  name: string;
  exportedAt: string;
  cacEnabled: boolean;
  mode: AppMode;
  grid: GridCell[][];
  upsConfig?: UpsConfig;
  thermalConfig?: ThermalConfig;
  tia942Config?: Tia942Config;
  auditChecklist?: AuditChecklist;
  unlockedFlags?: string[];
  activeMissionId?: CtfMissionId;
}

export interface CtfObjective {
  id: string;
  label: string;
  passed: boolean;
}

export type CtfMissionId = 'ctf-1' | 'ctf-2' | 'ctf-3' | 'ctf-4';

export interface CtfMission {
  id: CtfMissionId;
  code: string;
  title: string;
  subtitle: string;
  brief: string;
  flag: string;
  objectives: CtfObjective[];
  completed: boolean;
}
