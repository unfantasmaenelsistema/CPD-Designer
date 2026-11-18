import {
  CATALOG_MAP,
  formatCoord,
  GRID_COLS,
  GRID_ROWS,
  isRackType,
  ROOM_AREA_M2,
} from '../data/catalog';
import {
  AuditChecklist,
  AuditFinding,
  AuditReport,
  CtfMission,
  FloorAnalysis,
  GridCell,
  SubsystemTierEvaluation,
  TelemetryKPIs,
  ThermalConfig,
  ThermalIssue,
  Tia942Config,
  Tia942EvaluationResult,
  TierLevel,
  UpsCalculationResult,
  UpsConfig,
} from '../types';

export const BTU_PER_KW = 3412.142;
export const FRIGORIAS_PER_BTU = 0.252;
export const BTU_PER_TR = 12000;
export const LIGHTING_W_PER_M2 = 20;
export const BTU_PER_PERSON = 450;

/** Flags de las cuatro misiones (también sirven para validar el progreso guardado). */
export const CTF_FLAGS: string[] = [
  'FLAG{COLD_AISLE_THERMAL_MASTER}',
  'FLAG{UPS_ONLINE_AUTONOMY_OK}',
  'FLAG{TIA942_CONCURRENT_MAINTENANCE}',
  'FLAG{DCIM_CHIEF_ENGINEER_PRO}',
];

export const DEFAULT_UPS_CONFIG: UpsConfig = {
  manualExtraKw: 0,
  manualPowerFactor: 0.95,
  technology: 'vfi',
  growthMarginPct: 25,
  inverterEfficiencyPct: 95.5,
  redundancy: 'N+1',
  chemistry: 'vrla',
  targetRuntimeMin: 15,
  dcBusVoltage: 384,
  roomTempC: 25,
  blockCapacityAh: 100,
  hasGeneratorAts: true,
  floorMaxLoadKgM2: 1200,
};

export const DEFAULT_THERMAL_CONFIG: ThermalConfig = {
  techniciansCount: 2,
  supplyTempC: 22,
  relativeHumidityPct: 48,
  coolingTech: 'chiller',
  energyPriceEurKwh: 0.16,
};

export const DEFAULT_TIA942_CONFIG: Tia942Config = {
  utilityFeeds: 'single',
  dieselRedundancy: 'N+1',
  fuelAutonomyHours: '24h',
  distributionPath: 'dual_ab',
  mechanicalRedundancySource: 'from_floor',
  chilledWaterLoop: 'dual_loop_isolated',
  fiberEntrances: 'dual_20m',
  coreRedundancy: 'redundant_diverse',
  fireRating: 'RF-120',
  accessControl: 'rfid',
};

export const DEFAULT_AUDIT_CHECKLIST: AuditChecklist = {
  tia607Grounding: true,
  leakDetectionRope: true,
  epoProtectedCover: true,
  noWetSprinklers: true,
};

const TIER_AVAILABILITY: Record<1 | 2 | 3 | 4, { level: TierLevel; pct: string; downtime: string }> = {
  1: { level: 'Tier I', pct: '99.671%', downtime: '28.8 h/año' },
  2: { level: 'Tier II', pct: '99.741%', downtime: '22.0 h/año' },
  3: { level: 'Tier III', pct: '99.982%', downtime: '1.6 h/año' },
  4: { level: 'Tier IV', pct: '99.995%', downtime: '0.4 h/año' },
};

function keyOf(r: number, c: number): string {
  return `${r}-${c}`;
}

/**
 * Spatial Thermal Validation Engine (12x8 Matrix)
 */
export function analyzeFloorGrid(
  grid: GridCell[][],
  cacEnabled: boolean
): FloorAnalysis {
  const issues: ThermalIssue[] = [];
  const issueMap: Record<string, ThermalIssue[]> = {};
  const coldAisleTiles: Record<string, boolean> = {};
  const hotAisleTiles: Record<string, boolean> = {};
  const containedColdTiles: Record<string, boolean> = {};

  const addIssue = (issue: ThermalIssue) => {
    issues.push(issue);
    const k = keyOf(issue.row, issue.col);
    if (!issueMap[k]) issueMap[k] = [];
    issueMap[k].push(issue);
    if (issue.relatedCoords) {
      issue.relatedCoords.forEach(({ row, col }) => {
        const rk = keyOf(row, col);
        if (!issueMap[rk]) issueMap[rk] = [];
        if (!issueMap[rk].some((existing) => existing.id === issue.id)) {
          issueMap[rk].push(issue);
        }
      });
    }
  };

  let hotspotCount = 0;
  let misplacedPerforatedCount = 0;
  let clearanceWarningCount = 0;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r][c];

      if (isRackType(cell.type)) {
        if (cell.orientation === 'north' && r === 0) {
          clearanceWarningCount++;
          addIssue({
            id: `wall-${r}-${c}`,
            row: r,
            col: c,
            severity: 'warning',
            code: 'CLEARANCE',
            title: `Admisión bloqueada en ${formatCoord(r, c)}`,
            detail:
              'La cara frontal fría (Norte) está pegada al muro perimetral sin pasillo de suministro.',
          });
        } else if (cell.orientation === 'south' && r === GRID_ROWS - 1) {
          clearanceWarningCount++;
          addIssue({
            id: `wall-${r}-${c}`,
            row: r,
            col: c,
            severity: 'warning',
            code: 'CLEARANCE',
            title: `Admisión bloqueada en ${formatCoord(r, c)}`,
            detail:
              'La cara frontal fría (Sur) está pegada al muro perimetral sin pasillo de suministro.',
          });
        }

        if (r + 1 < GRID_ROWS) {
          const southNeighbor = grid[r + 1][c];
          if (isRackType(southNeighbor.type)) {
            const cellRearFacesSouth = cell.orientation === 'north';
            const southFrontFacesNorth = southNeighbor.orientation === 'north';
            const cellFrontFacesSouth = cell.orientation === 'south';
            const southRearFacesNorth = southNeighbor.orientation === 'south';

            if (
              (cellRearFacesSouth && southFrontFacesNorth) ||
              (cellFrontFacesSouth && southRearFacesNorth)
            ) {
              hotspotCount++;
              addIssue({
                id: `direct-sc-${r}-${c}`,
                row: r,
                col: c,
                severity: 'critical',
                code: 'HOTSPOT_DIRECT',
                title: `Cortocircuito térmico directo ${formatCoord(r, c)} ↔ ${formatCoord(r + 1, c)}`,
                detail:
                  'La descarga caliente trasera incide directamente sobre la admisión frontal del rack contiguo sin pasillo de separación.',
                relatedCoords: [{ row: r + 1, col: c }],
              });
            }
          }
        }
        continue;
      }

      const northCell = r > 0 ? grid[r - 1][c] : null;
      const southCell = r < GRID_ROWS - 1 ? grid[r + 1][c] : null;

      let coldIntakeCount = 0;
      let hotExhaustCount = 0;
      let hotSourceCoord: { row: number; col: number } | null = null;
      let coldTargetCoord: { row: number; col: number } | null = null;

      if (northCell && isRackType(northCell.type)) {
        if (northCell.orientation === 'south') {
          coldIntakeCount++;
          coldTargetCoord = { row: r - 1, col: c };
        } else {
          hotExhaustCount++;
          hotSourceCoord = { row: r - 1, col: c };
        }
      }

      if (southCell && isRackType(southCell.type)) {
        if (southCell.orientation === 'north') {
          coldIntakeCount++;
          coldTargetCoord = { row: r + 1, col: c };
        } else {
          hotExhaustCount++;
          hotSourceCoord = { row: r + 1, col: c };
        }
      }

      const k = keyOf(r, c);

      if (hotExhaustCount > 0 && coldIntakeCount > 0) {
        hotspotCount++;
        const related: Array<{ row: number; col: number }> = [];
        if (hotSourceCoord) related.push(hotSourceCoord);
        if (coldTargetCoord) related.push(coldTargetCoord);

        addIssue({
          id: `aisle-mix-${r}-${c}`,
          row: r,
          col: c,
          severity: 'critical',
          code: 'HOTSPOT_RECIRCULATION',
          title: `Recirculación / Cortocircuito Térmico en ${formatCoord(r, c)}`,
          detail: `El aire caliente expulsado por ${
            hotSourceCoord ? formatCoord(hotSourceCoord.row, hotSourceCoord.col) : 'un rack'
          } es aspirado por la admisión fría de ${
            coldTargetCoord ? formatCoord(coldTargetCoord.row, coldTargetCoord.col) : 'el rack opuesto'
          }. Rota uno de los racks 180°.`,
          relatedCoords: related,
        });
      } else if (coldIntakeCount > 0 && hotExhaustCount === 0) {
        coldAisleTiles[k] = true;
        if (cacEnabled) {
          containedColdTiles[k] = true;
        }
      } else if (hotExhaustCount > 0 && coldIntakeCount === 0) {
        hotAisleTiles[k] = true;
      }

      if (cell.type === 'perforated' && hotExhaustCount > 0) {
        misplacedPerforatedCount++;
        addIssue({
          id: `perf-hot-${r}-${c}`,
          row: r,
          col: c,
          severity: 'critical',
          code: 'PERFORATED_HOT_AISLE',
          title: `Baldosa perforada en pasillo caliente (${formatCoord(r, c)})`,
          detail:
            'Impulsar aire frío desde el plenum en la zona de escape caliente provoca mezcla térmica y pérdida de presión estática. Sustituye por baldosa ciega.',
          relatedCoords: hotSourceCoord ? [hotSourceCoord] : undefined,
        });
      }
    }
  }

  return {
    issues,
    issueMap,
    coldAisleTiles,
    hotAisleTiles,
    containedColdTiles,
    hotspotCount,
    misplacedPerforatedCount,
    clearanceWarningCount,
  };
}

export function computeUpsLossKw(loadKw: number, upsConfig: UpsConfig): number {
  if (loadKw <= 0) return 0;
  const eff = Math.min(0.99, Math.max(0.85, upsConfig.inverterEfficiencyPct / 100));
  const baseConversionLoss = loadKw * (1 / eff - 1);
  const dualBusOverhead =
    upsConfig.redundancy === '2N' || upsConfig.redundancy === '2(N+1)'
      ? loadKw * 0.012 + 0.3
      : 0;
  return baseConversionLoss + dualBusOverhead;
}

export function evaluateTia942Subsystems(
  kpis: Pick<
    TelemetryKPIs,
    | 'rackCount'
    | 'dualPowerRackRatio'
    | 'pduCount'
    | 'cracCount'
    | 'totalCoolingCapacityKw'
    | 'totalHeatKw'
    | 'safetyCount'
  >,
  analysis: Pick<FloorAnalysis, 'hotspotCount' | 'misplacedPerforatedCount'>,
  cacEnabled: boolean,
  upsConfig: UpsConfig,
  tiaConfig: Tia942Config
): Tia942EvaluationResult {
  const criticalThermal = analysis.hotspotCount + analysis.misplacedPerforatedCount;

  // 1. ELECTRICAL SUBSYSTEM
  let elecTierNum: 1 | 2 | 3 | 4 = 1;
  let elecBottleneck = '';
  const allRacksDual = kpis.rackCount === 0 || kpis.dualPowerRackRatio === 1;
  const upsIsVfi = upsConfig.technology === 'vfi';
  const upsHasRedundancy = upsConfig.redundancy !== 'N';
  const upsIsDualBus =
    upsConfig.redundancy === '2N' || upsConfig.redundancy === '2(N+1)';

  if (
    tiaConfig.utilityFeeds === 'dual_substation' &&
    tiaConfig.dieselRedundancy === '2N' &&
    tiaConfig.fuelAutonomyHours === '72h' &&
    tiaConfig.distributionPath === 'dual_ab' &&
    upsIsVfi &&
    upsIsDualBus &&
    allRacksDual &&
    kpis.pduCount >= 2
  ) {
    elecTierNum = 4;
    elecBottleneck =
      'Tolerante a fallos (2N): doble subestación, diésel 2N (72h), SAI VFI dual-bus y distribución A+B.';
  } else if (
    (tiaConfig.dieselRedundancy === 'N+1' || tiaConfig.dieselRedundancy === '2N') &&
    (tiaConfig.fuelAutonomyHours === '24h' || tiaConfig.fuelAutonomyHours === '72h') &&
    tiaConfig.distributionPath === 'dual_ab' &&
    upsIsVfi &&
    upsHasRedundancy &&
    allRacksDual &&
    kpis.pduCount >= 1
  ) {
    elecTierNum = 3;
    const missingFor4: string[] = [];
    if (tiaConfig.utilityFeeds !== 'dual_substation') missingFor4.push('2 subestaciones');
    if (tiaConfig.dieselRedundancy !== '2N') missingFor4.push('diésel 2N');
    if (tiaConfig.fuelAutonomyHours !== '72h') missingFor4.push('72h de combustible');
    if (!upsIsDualBus) missingFor4.push('SAI 2N / 2(N+1)');
    if (kpis.pduCount < 2) missingFor4.push('mínimo 2 cuadros PDU en sala');
    elecBottleneck = `Mantenible concurrentemente (A+B). Para Tier IV falta: ${missingFor4.join(', ')}.`;
  } else if (
    tiaConfig.dieselRedundancy !== 'none' &&
    upsHasRedundancy &&
    kpis.pduCount >= 1
  ) {
    elecTierNum = 2;
    const reasons: string[] = [];
    if (!upsIsVfi) reasons.push('SAI debe ser On-Line VFI');
    if (tiaConfig.distributionPath !== 'dual_ab') reasons.push('distribución por camino único');
    if (!allRacksDual) reasons.push('racks en plano sin doble fuente A+B');
    if (tiaConfig.dieselRedundancy === 'N') reasons.push('diésel sin redundancia N+1');
    if (tiaConfig.fuelAutonomyHours === '12h') reasons.push('combustible < 24h');
    elecBottleneck = `Componentes redundantes pero sin mantenimiento concurrente completo (${reasons.join(', ')}).`;
  } else {
    elecTierNum = 1;
    const reasons: string[] = [];
    if (tiaConfig.dieselRedundancy === 'none') reasons.push('sin grupo electrógeno');
    if (!upsHasRedundancy) reasons.push('SAI único (N)');
    if (kpis.pduCount === 0) reasons.push('sin cuadro PDU/SAI en el plano');
    elecBottleneck = `Camino eléctrico único con SPOF (${reasons.join(', ')}).`;
  }

  // 2. MECHANICAL SUBSYSTEM
  // La redundancia real sale siempre del plano. N = CRAC necesarios para la carga;
  // N+1 = una unidad de reserva; 2(N+1) = dos sistemas completos con su reserva.
  const REDUNDANCY_RANK = { N: 0, 'N+1': 1, '2(N+1)': 2 } as const;
  const cracUnitKw = kpis.cracCount > 0 ? kpis.totalCoolingCapacityKw / kpis.cracCount : 25;
  const cracNeededN = Math.max(1, Math.ceil(kpis.totalHeatKw / cracUnitKw));
  const floorTwoN = kpis.cracCount >= 2 * (cracNeededN + 1);
  const floorNPlus1 =
    kpis.cracCount >= 2 && kpis.totalCoolingCapacityKw - cracUnitKw >= kpis.totalHeatKw;
  const floorRedundancy: 'N' | 'N+1' | '2(N+1)' = floorTwoN
    ? '2(N+1)'
    : floorNPlus1
    ? 'N+1'
    : 'N';

  // Elegir N, N+1 o 2(N+1) a mano simula un escenario peor (p. ej. una unidad
  // fuera de servicio), pero nunca añade máquinas que no estén en el plano.
  let effectiveMechanicalRedundancy: 'N' | 'N+1' | '2(N+1)' = floorRedundancy;
  let manualAboveFloor = false;
  if (tiaConfig.mechanicalRedundancySource !== 'from_floor') {
    const manual = tiaConfig.mechanicalRedundancySource;
    if (REDUNDANCY_RANK[manual] <= REDUNDANCY_RANK[floorRedundancy]) {
      effectiveMechanicalRedundancy = manual;
    } else {
      manualAboveFloor = true;
    }
  }

  let mechTierNum: 1 | 2 | 3 | 4 = 1;
  let mechBottleneck = '';
  const hasCoolingCapacity =
    kpis.cracCount > 0 && kpis.totalCoolingCapacityKw >= kpis.totalHeatKw;
  const manualNote = manualAboveFloor
    ? ` La redundancia ${tiaConfig.mechanicalRedundancySource} elegida a mano no se cumple en el plano (${kpis.cracCount} CRAC; N = ${cracNeededN}): se evalúa ${floorRedundancy}.`
    : '';

  if (
    hasCoolingCapacity &&
    effectiveMechanicalRedundancy === '2(N+1)' &&
    tiaConfig.chilledWaterLoop === 'dual_loop_isolated' &&
    criticalThermal === 0 &&
    cacEnabled
  ) {
    mechTierNum = 4;
    mechBottleneck =
      'Climatización 2(N+1) tolerante a fallos con doble anillo seccionado, CAC y 0 hotspots.';
  } else if (
    hasCoolingCapacity &&
    (effectiveMechanicalRedundancy === 'N+1' || effectiveMechanicalRedundancy === '2(N+1)') &&
    tiaConfig.chilledWaterLoop === 'dual_loop_isolated' &&
    criticalThermal === 0
  ) {
    mechTierNum = 3;
    const missing4: string[] = [];
    if (effectiveMechanicalRedundancy !== '2(N+1)') {
      missing4.push(`redundancia 2(N+1) (${2 * (cracNeededN + 1)} CRAC para N = ${cracNeededN})`);
    }
    if (!cacEnabled) missing4.push('cerramiento CAC');
    mechBottleneck = `Mantenible concurrentemente (N+1 + doble anillo). Para Tier IV falta: ${missing4.join(', ')}.`;
  } else if (
    hasCoolingCapacity &&
    (effectiveMechanicalRedundancy === 'N+1' || effectiveMechanicalRedundancy === '2(N+1)')
  ) {
    mechTierNum = 2;
    const reasons: string[] = [];
    if (tiaConfig.chilledWaterLoop !== 'dual_loop_isolated') {
      reasons.push('anillo hidráulico simple (corte total al mantener válvulas)');
    }
    if (criticalThermal > 0) {
      reasons.push(`${criticalThermal} anomalía(s) térmica(s) en el plano`);
    }
    mechBottleneck = `CRAC redundante pero limitado por: ${reasons.join(', ')}.`;
  } else {
    mechTierNum = 1;
    mechBottleneck = !hasCoolingCapacity
      ? 'Déficit de capacidad frigorífica CRAC frente a carga térmica de sala.'
      : 'Climatización sin redundancia (N): el fallo de 1 CRAC sobrecalienta el CPD.';
  }
  mechBottleneck += manualNote;

  // 3. TELECOM SUBSYSTEM
  let telecomTierNum: 1 | 2 | 3 | 4 = 1;
  let telecomBottleneck = '';
  if (
    tiaConfig.fiberEntrances === 'dual_20m' &&
    tiaConfig.coreRedundancy === 'redundant_diverse'
  ) {
    telecomTierNum = 4;
    telecomBottleneck =
      'Cumple Tier III/IV: doble acometida (≥20 m) + Core redundante en bandejas opuestas.';
  } else if (
    tiaConfig.fiberEntrances === 'dual_20m' ||
    tiaConfig.coreRedundancy === 'redundant_diverse'
  ) {
    telecomTierNum = 2;
    telecomBottleneck =
      tiaConfig.fiberEntrances !== 'dual_20m'
        ? '1 sola entrada de fibra óptica crea un SPOF en la acometida exterior.'
        : 'Core único o rutas compartidas en bandeja crean un SPOF interno.';
  } else {
    telecomTierNum = 1;
    telecomBottleneck =
      'Entrada única de telecomunicaciones y switching sin diversidad física.';
  }

  // 4. ARCHITECTURAL & PHYSICAL SUBSYSTEM
  let archTierNum: 1 | 2 | 3 | 4 = 1;
  let archBottleneck = '';
  if (
    tiaConfig.fireRating === 'RF-120' &&
    tiaConfig.accessControl === 'mantrap_biometric' &&
    kpis.safetyCount >= 1
  ) {
    archTierNum = 4;
    archBottleneck =
      'Sectorización RF-120, esclusa biométrica Man-Trap + CCTV y extinción por gas inerte.';
  } else if (
    tiaConfig.fireRating === 'RF-120' &&
    tiaConfig.accessControl !== 'key'
  ) {
    archTierNum = 3;
    const missing4: string[] = [];
    if (tiaConfig.accessControl !== 'mantrap_biometric') {
      missing4.push('esclusa biométrica Man-Trap');
    }
    if (kpis.safetyCount === 0) missing4.push('extinción NOVEC/FM-200 en plano');
    archBottleneck = `Protección RF-120 + control electrónico. Para Tier IV falta: ${missing4.join(', ')}.`;
  } else if (tiaConfig.fireRating === 'RF-60' && tiaConfig.accessControl !== 'key') {
    archTierNum = 2;
    archBottleneck = 'Sectorización básica RF-60 (requiere RF-120 para Tier III/IV).';
  } else {
    archTierNum = 1;
    archBottleneck =
      tiaConfig.accessControl === 'key'
        ? 'Control de acceso mediante llave física sin trazabilidad electrónica.'
        : 'Sectorización física básica.';
  }

  const subsystems: SubsystemTierEvaluation[] = [
    {
      id: 'electrical',
      name: 'Eléctrico',
      tier: TIER_AVAILABILITY[elecTierNum].level,
      tierNum: elecTierNum,
      summary: `${tiaConfig.utilityFeeds === 'dual_substation' ? '2 Subest.' : '1 Subest.'} · Diésel ${tiaConfig.dieselRedundancy} (${tiaConfig.fuelAutonomyHours}) · ${tiaConfig.distributionPath === 'dual_ab' ? 'A+B' : 'Única'}`,
      bottleneckReason: elecBottleneck,
    },
    {
      id: 'mechanical',
      name: 'Mecánico / Clima',
      tier: TIER_AVAILABILITY[mechTierNum].level,
      tierNum: mechTierNum,
      summary: `CRAC ${effectiveMechanicalRedundancy} · ${tiaConfig.chilledWaterLoop === 'dual_loop_isolated' ? 'Doble anillo' : 'Anillo simple'}`,
      bottleneckReason: mechBottleneck,
    },
    {
      id: 'telecom',
      name: 'Telecomunicaciones',
      tier: TIER_AVAILABILITY[telecomTierNum].level,
      tierNum: telecomTierNum,
      summary: `${tiaConfig.fiberEntrances === 'dual_20m' ? '2 Entradas ≥20m' : '1 Entrada'} · ${tiaConfig.coreRedundancy === 'redundant_diverse' ? 'Core Diverso' : 'Core Simple'}`,
      bottleneckReason: telecomBottleneck,
    },
    {
      id: 'architectural',
      name: 'Arquitectónico',
      tier: TIER_AVAILABILITY[archTierNum].level,
      tierNum: archTierNum,
      summary: `${tiaConfig.fireRating} · ${tiaConfig.accessControl === 'mantrap_biometric' ? 'Man-Trap Biométrico' : tiaConfig.accessControl === 'rfid' ? 'RFID' : 'Llave'}`,
      bottleneckReason: archBottleneck,
    },
  ];

  const sortedByWeakest = [...subsystems].sort((a, b) => a.tierNum - b.tierNum);
  const weakestSubsystem = sortedByWeakest[0];
  const strongestSubsystem = sortedByWeakest[sortedByWeakest.length - 1];
  const globalTierNum = weakestSubsystem.tierNum;
  const tierMeta = TIER_AVAILABILITY[globalTierNum];

  const weakestLinkExplanation =
    strongestSubsystem.tierNum > weakestSubsystem.tierNum
      ? `Aunque tu subsistema ${strongestSubsystem.name} alcanza ${strongestSubsystem.tier}, el CPD global queda limitado a ${tierMeta.level} por el subsistema ${weakestSubsystem.name} (${weakestSubsystem.bottleneckReason})`
      : `Los 4 subsistemas están equilibrados en ${tierMeta.level} (${tierMeta.pct} de disponibilidad).`;

  return {
    globalTier: tierMeta.level,
    globalTierNum,
    availabilityPct: tierMeta.pct,
    annualDowntimeHours: tierMeta.downtime,
    weakestSubsystem,
    subsystems,
    effectiveMechanicalRedundancy,
    weakestLinkExplanation,
  };
}

export function calculateTelemetryKPIs(
  grid: GridCell[][],
  analysis: FloorAnalysis,
  cacEnabled: boolean,
  upsConfig: UpsConfig = DEFAULT_UPS_CONFIG,
  thermalConfig: ThermalConfig = DEFAULT_THERMAL_CONFIG,
  tiaConfig: Tia942Config = DEFAULT_TIA942_CONFIG
): TelemetryKPIs {
  let totalItKw = 0;
  let totalItKva = 0;
  let pduFloorLossKw = 0;
  let cracCount = 0;
  let totalCoolingCapacityKw = 0;
  let rackCount = 0;
  let dualPowerRacks = 0;
  let pduCount = 0;
  let safetyCount = 0;
  let perforatedCount = 0;

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = grid[r][c];
      const item = CATALOG_MAP[cell.type];

      if (isRackType(cell.type)) {
        rackCount++;
        const kw = Math.max(0.5, cell.powerKw);
        const pf = Math.min(0.99, Math.max(0.8, cell.powerFactor));
        totalItKw += kw;
        totalItKva += kw / pf;
        if (cell.dualPower) dualPowerRacks++;
      } else if (cell.type === 'crac') {
        cracCount++;
        totalCoolingCapacityKw += item?.coolingCapacityKw ?? 25;
      } else if (cell.type === 'pdu') {
        pduCount++;
        pduFloorLossKw += item?.thermalLossKw ?? 1.5;
      } else if (cell.type === 'safety') {
        safetyCount++;
      } else if (cell.type === 'perforated') {
        perforatedCount++;
      }
    }
  }

  const weightedPowerFactor = totalItKva > 0 ? totalItKw / totalItKva : 0.9;

  const upsLossKw = computeUpsLossKw(totalItKw, upsConfig);
  const jouleLossKw = totalItKw * 0.02;
  const lightingEnvelopeKw = (ROOM_AREA_M2 * LIGHTING_W_PER_M2) / 1000;
  const peopleHeatKw =
    (Math.max(0, thermalConfig.techniciansCount) * BTU_PER_PERSON) / BTU_PER_KW;

  const totalHeatKw =
    totalItKw +
    upsLossKw +
    jouleLossKw +
    pduFloorLossKw +
    lightingEnvelopeKw +
    peopleHeatKw;

  const totalBtuPerHour = totalHeatKw * BTU_PER_KW;
  const totalFrigoriasPerHour = totalBtuPerHour * FRIGORIAS_PER_BTU;
  const totalCoolingTons = totalBtuPerHour / BTU_PER_TR;
  const totalCoolingCapacityBtuH = totalCoolingCapacityKw * BTU_PER_KW;

  const baseCop =
    thermalConfig.coolingTech === 'freecooling'
      ? 6.1
      : thermalConfig.coolingTech === 'chiller'
      ? 4.1
      : 2.95;

  const tempDelta = thermalConfig.supplyTempC - 22;
  const tempWorkMultiplier =
    tempDelta < 0
      ? 1 + Math.abs(tempDelta) * 0.032
      : Math.max(0.84, 1 - tempDelta * 0.02);

  const cacMultiplier = cacEnabled ? 0.82 : 1.0;

  let cracElectricalKw = 0;
  if (cracCount > 0) {
    const fanStandbyKw = cracCount * 0.55;
    const compressorLoadKw = (totalHeatKw / baseCop) * tempWorkMultiplier;
    cracElectricalKw = (fanStandbyKw + compressorLoadKw) * cacMultiplier;
  } else if (totalItKw > 0) {
    cracElectricalKw = totalItKw * 0.58;
  }

  const coolingDeficitKw = Math.max(0, totalHeatKw - totalCoolingCapacityKw);
  const thermalPenaltyKw =
    analysis.hotspotCount * 1.45 +
    analysis.misplacedPerforatedCount * 0.7 +
    analysis.clearanceWarningCount * 0.35 +
    (cracCount > 0 && coolingDeficitKw > 0 ? coolingDeficitKw * 0.35 : 0);

  const effectiveCop =
    cracElectricalKw + thermalPenaltyKw > 0
      ? totalHeatKw / (cracElectricalKw + thermalPenaltyKw)
      : baseCop;

  const totalFacilityKw =
    totalItKw +
    upsLossKw +
    jouleLossKw +
    pduFloorLossKw +
    lightingEnvelopeKw +
    cracElectricalKw +
    thermalPenaltyKw;

  const pue = totalItKw > 0 ? totalFacilityKw / totalItKw : 0;
  const dciePct = pue > 0 ? (1 / pue) * 100 : 0;

  let pueStatus: TelemetryKPIs['pueStatus'] = 'idle';
  if (totalItKw > 0) {
    if (pue < 1.4) pueStatus = 'optimal';
    else if (pue <= 1.8) pueStatus = 'moderate';
    else pueStatus = 'critical';
  }

  const dualPowerRackRatio = rackCount > 0 ? dualPowerRacks / rackCount : 0;
  const coolingMarginKw = totalCoolingCapacityKw - totalHeatKw;

  const tiaEval = evaluateTia942Subsystems(
    {
      rackCount,
      dualPowerRackRatio,
      pduCount,
      cracCount,
      totalCoolingCapacityKw,
      totalHeatKw,
      safetyCount,
    },
    analysis,
    cacEnabled,
    upsConfig,
    tiaConfig
  );

  const tier: TierLevel = rackCount === 0 ? 'Tier I' : tiaEval.globalTier;
  const tierReasons: string[] =
    rackCount === 0
      ? ['Añade racks IT al plano para evaluar la topología de redundancia.']
      : [
          tiaEval.weakestLinkExplanation,
          ...tiaEval.subsystems
            .filter((s) => s.tierNum < 4)
            .slice(0, 2)
            .map((s) => `${s.name} (${s.tier}): ${s.bottleneckReason}`),
        ];

  return {
    totalItKw,
    totalItKva,
    weightedPowerFactor,
    pduLossKw: pduFloorLossKw,
    jouleLossKw,
    upsLossKw,
    lightingEnvelopeKw,
    peopleHeatKw,
    totalHeatKw,
    totalBtuPerHour,
    totalFrigoriasPerHour,
    totalCoolingTons,
    cracCount,
    totalCoolingCapacityKw,
    totalCoolingCapacityBtuH,
    cracElectricalKw,
    effectiveCop,
    coolingMarginKw,
    thermalPenaltyKw,
    totalFacilityKw,
    pue,
    dciePct,
    pueStatus,
    tier,
    tierReasons,
    rackCount,
    dualPowerRackRatio,
    pduCount,
    safetyCount,
    perforatedCount,
  };
}

export function calculateUpsEngineering(
  floorItKw: number,
  floorItKva: number,
  config: UpsConfig
): UpsCalculationResult {
  const manualExtraKw = Math.max(0, config.manualExtraKw);
  const manualPf = Math.min(0.99, Math.max(0.8, config.manualPowerFactor));
  const manualExtraKva = manualExtraKw / manualPf;

  const totalCriticalKw = floorItKw + manualExtraKw;
  const totalCriticalKva = floorItKva + manualExtraKva;
  const effectivePowerFactor =
    totalCriticalKva > 0 ? totalCriticalKw / totalCriticalKva : 0.95;

  const growthMultiplier = 1 + config.growthMarginPct / 100;
  const recommendedUpsKva = totalCriticalKva * growthMultiplier;
  const recommendedUpsKw = totalCriticalKw * growthMultiplier;

  const eff = Math.min(0.98, Math.max(0.9, config.inverterEfficiencyPct / 100));
  const upsElectricalLossKw = computeUpsLossKw(totalCriticalKw, config);
  const upsThermalLossBtuH = upsElectricalLossKw * BTU_PER_KW;

  const standardModules = [10, 20, 30, 40, 50, 60, 80, 100, 120, 160, 200, 250, 300, 400, 500];
  let moduleCountActive = 1;
  let moduleCountTotal = 1;
  let moduleRatingKva = 20;

  if (recommendedUpsKva > 0) {
    if (config.redundancy === 'N') {
      moduleCountActive = 1;
      moduleCountTotal = 1;
      moduleRatingKva =
        standardModules.find((m) => m >= recommendedUpsKva) ??
        Math.ceil(recommendedUpsKva / 50) * 50;
    } else if (config.redundancy === 'N+1') {
      const targetPerModule = recommendedUpsKva <= 60 ? 20 : recommendedUpsKva <= 150 ? 40 : 60;
      moduleCountActive = Math.max(2, Math.ceil(recommendedUpsKva / targetPerModule));
      const reqPerMod = recommendedUpsKva / moduleCountActive;
      moduleRatingKva =
        standardModules.find((m) => m >= reqPerMod) ?? Math.ceil(reqPerMod / 10) * 10;
      moduleCountTotal = moduleCountActive + 1;
    } else if (config.redundancy === '2N') {
      moduleCountActive = 1;
      moduleCountTotal = 2;
      moduleRatingKva =
        standardModules.find((m) => m >= recommendedUpsKva) ??
        Math.ceil(recommendedUpsKva / 50) * 50;
    } else {
      const targetPerModule = recommendedUpsKva <= 60 ? 20 : recommendedUpsKva <= 150 ? 40 : 60;
      const activePerBus = Math.max(2, Math.ceil(recommendedUpsKva / targetPerModule));
      const reqPerMod = recommendedUpsKva / activePerBus;
      moduleRatingKva =
        standardModules.find((m) => m >= reqPerMod) ?? Math.ceil(reqPerMod / 10) * 10;
      moduleCountActive = activePerBus;
      moduleCountTotal = (activePerBus + 1) * 2;
    }
  }

  const activeCapacityKva =
    config.redundancy === '2N' || config.redundancy === '2(N+1)'
      ? moduleRatingKva * moduleCountActive * 2
      : moduleRatingKva * moduleCountActive;

  const perModuleLoadPct =
    activeCapacityKva > 0 ? (totalCriticalKva / activeCapacityKva) * 100 : 0;

  const loadFactorPct =
    recommendedUpsKva > 0 ? (totalCriticalKva / (moduleRatingKva * moduleCountActive)) * 100 : 0;

  const transferTimeMs =
    config.technology === 'vfi'
      ? '0 ms (Inversor continuo)'
      : config.technology === 'vi'
      ? '2 – 6 ms (Conmutación AVR)'
      : '4 – 10 ms (Relé Bypass)';

  const isTopologySafeForCpds = config.technology === 'vfi';

  const dcDischargeCurrentA =
    totalCriticalKw > 0
      ? (totalCriticalKw * 1000) / (config.dcBusVoltage * eff)
      : 0;

  const agingFactor = 1.25;
  const tempDelta = Math.max(0, 25 - config.roomTempC);
  const tempCorrectionFactor =
    config.chemistry === 'vrla' ? 1 + tempDelta * 0.008 : 1 + tempDelta * 0.004;

  const peukertExponent = config.chemistry === 'vrla' ? 1.22 : 1.03;
  const runtimeHours = Math.max(0.05, config.targetRuntimeMin / 60);
  const c10RefHours = 10;
  const peukertMultiplier =
    runtimeHours < c10RefHours
      ? Math.pow(c10RefHours / runtimeHours, (peukertExponent - 1) / peukertExponent)
      : 1.0;

  const rawAhRequired = dcDischargeCurrentA * runtimeHours;
  const correctedAhRequired =
    rawAhRequired * agingFactor * tempCorrectionFactor * peukertMultiplier;

  const blocksPerString = config.dcBusVoltage / 12;
  const parallelStringsPerBus =
    totalCriticalKw > 0
      ? Math.max(1, Math.ceil(correctedAhRequired / config.blockCapacityAh))
      : 0;

  const dualBusMultiplier =
    config.redundancy === '2N' || config.redundancy === '2(N+1)' ? 2 : 1;

  const parallelStrings = parallelStringsPerBus * dualBusMultiplier;
  const totalBlocks = parallelStrings * blocksPerString;
  const installedAhTotal = parallelStringsPerBus * config.blockCapacityAh;

  const cRate = installedAhTotal > 0 ? dcDischargeCurrentA / installedAhTotal : 0;

  const weightPerBlockKg =
    config.chemistry === 'vrla'
      ? config.blockCapacityAh * 0.31
      : config.blockCapacityAh * 0.125;

  const estimatedCabinets = totalBlocks > 0 ? Math.ceil(totalBlocks / 32) : 0;
  const cabinetSteelWeightKg =
    estimatedCabinets * (config.chemistry === 'vrla' ? 110 : 85);

  const totalBatteryWeightKg = totalBlocks * weightPerBlockKg + cabinetSteelWeightKg;
  const footprintM2 = estimatedCabinets * 0.72;
  const floorLoadKgM2 = footprintM2 > 0 ? totalBatteryWeightKg / footprintM2 : 0;
  const isFloorOverloaded = floorLoadKgM2 > config.floorMaxLoadKgM2;

  const scalingRatio =
    correctedAhRequired > 0 ? installedAhTotal / correctedAhRequired : 1;
  const estimatedActualRuntimeMin =
    totalCriticalKw > 0
      ? config.targetRuntimeMin * Math.pow(scalingRatio, peukertExponent)
      : 0;

  return {
    floorItKw,
    floorItKva,
    manualExtraKw,
    manualExtraKva,
    totalCriticalKw,
    totalCriticalKva,
    effectivePowerFactor,
    recommendedUpsKva,
    recommendedUpsKw,
    loadFactorPct,
    moduleCountActive,
    moduleCountTotal,
    moduleRatingKva,
    perModuleLoadPct,
    upsElectricalLossKw,
    upsThermalLossBtuH,
    transferTimeMs,
    isTopologySafeForCpds,
    dcDischargeCurrentA,
    agingFactor,
    tempCorrectionFactor,
    peukertExponent,
    peukertMultiplier,
    cRate,
    rawAhRequired,
    correctedAhRequired,
    blocksPerString,
    parallelStrings,
    installedAhTotal,
    totalBlocks,
    weightPerBlockKg,
    totalBatteryWeightKg,
    estimatedCabinets,
    footprintM2,
    floorLoadKgM2,
    isFloorOverloaded,
    estimatedActualRuntimeMin,
  };
}

/**
 * Phase 5 Live Engineering Design Linter & Physical Audit
 */
export function runEngineeringAudit(
  grid: GridCell[][],
  kpis: TelemetryKPIs,
  analysis: FloorAnalysis,
  cacEnabled: boolean,
  upsConfig: UpsConfig,
  upsCalc: UpsCalculationResult,
  thermalConfig: ThermalConfig,
  checklist: AuditChecklist
): AuditReport {
  const findings: AuditFinding[] = [];
  const hasColdAisles = Object.keys(analysis.coldAisleTiles).length > 0;

  // 1. IT Load Presence
  if (kpis.rackCount === 0) {
    findings.push({
      id: 'audit-no-racks',
      category: 'Diseño Sala 2D',
      severity: 'critical',
      title: 'Sin racks IT desplegados en el plano técnico',
      detail: 'No existen cargas críticas configuradas para validar la infraestructura.',
      recommendation: 'Coloca racks en el Plano 2D formando pasillos fríos y calientes.',
    });
  }

  // 2. UPS Capacity (>= 100% IT + 20% margin) & VFI Technology
  if (upsConfig.technology !== 'vfi') {
    findings.push({
      id: 'audit-ups-vfi',
      category: 'Energía SAI',
      severity: 'critical',
      title: `SAI no es On-Line Doble Conversión (${upsConfig.technology.toUpperCase()})`,
      detail: `Tiempo de transferencia ${upsCalc.transferTimeMs} incompatible con fuentes PFC activas de servidores.`,
      recommendation: 'Cambia la tecnología del SAI a On-Line Doble Conversión (VFI - IEC 62040-3).',
    });
  } else if (upsConfig.growthMarginPct < 20) {
    findings.push({
      id: 'audit-ups-margin',
      category: 'Energía SAI',
      severity: 'major',
      title: `Margen de seguridad SAI insuficiente (${upsConfig.growthMarginPct}% < 20%)`,
      detail: `El inversor supera la recomendación del 80% de carga nominal.`,
      recommendation: 'Aumenta el margen de crecimiento del SAI al menos al 20% en la Pestaña 2.',
    });
  } else {
    findings.push({
      id: 'audit-ups-ok',
      category: 'Energía SAI',
      severity: 'pass',
      title: 'Dimensionamiento SAI On-Line VFI y margen >= 20% conforme',
      detail: `SAI de ${upsCalc.recommendedUpsKva.toFixed(1)} kVA cubre el 100% de ${upsCalc.totalCriticalKva.toFixed(1)} kVA más ${upsConfig.growthMarginPct}% de margen.`,
      recommendation: 'Mantener pruebas periódicas de descarga de baterías.',
    });
  }

  // 3. Battery Structural Floor Load
  if (upsCalc.isFloorOverloaded) {
    findings.push({
      id: 'audit-bat-floor',
      category: 'Estructura',
      severity: 'major',
      title: `Sobrecarga estructural de baterías (${Math.round(upsCalc.floorLoadKgM2)} kg/m²)`,
      detail: `Supera la resistencia límite de ${upsConfig.floorMaxLoadKgM2} kg/m² del suelo técnico.`,
      recommendation: 'Migrar a baterías LiFePO4 o instalar bancadas de reparto de carga.',
    });
  }

  // 4. CRAC BTU/h Capacity + N+1 Redundancy
  const hasNCooling = kpis.totalCoolingCapacityBtuH >= kpis.totalBtuPerHour && kpis.cracCount > 0;
  const hasNPlus1Cooling =
    kpis.cracCount >= 2 && kpis.totalCoolingCapacityKw - 25 >= kpis.totalHeatKw;

  if (!hasNCooling) {
    findings.push({
      id: 'audit-crac-deficit',
      category: 'Climatización',
      severity: 'critical',
      title: 'Déficit de potencia frigorífica CRAC frente a carga térmica total',
      detail: `Instalados ${Math.round(kpis.totalCoolingCapacityBtuH).toLocaleString('es-ES')} BTU/h frente a una demanda de ${Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')} BTU/h.`,
      recommendation: 'Añade unidades CRAC en el Plano 2D hasta cubrir la demanda con redundancia N+1.',
    });
  } else if (!hasNPlus1Cooling) {
    findings.push({
      id: 'audit-crac-n1',
      category: 'Climatización',
      severity: 'major',
      title: 'Climatización sin redundancia N+1',
      detail: `Si falla una unidad CRAC, las restantes no disipan los ${Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')} BTU/h totales.`,
      recommendation: 'Añade al menos 1 unidad CRAC adicional de respaldo en el Plano 2D.',
    });
  } else {
    findings.push({
      id: 'audit-crac-ok',
      category: 'Climatización',
      severity: 'pass',
      title: 'Capacidad frigorífica CRAC con redundancia N+1 verificada',
      detail: `${kpis.cracCount} unidades (${Math.round(kpis.totalCoolingCapacityBtuH).toLocaleString('es-ES')} BTU/h) superan la demanda con tolerancia al fallo de 1 unidad.`,
      recommendation: 'Alternar horas de funcionamiento entre equipos CRAC.',
    });
  }

  // 5. Cold/Hot Aisle Spatial Violations & Perforated Tiles in Cold Aisle
  if (analysis.hotspotCount > 0 || analysis.misplacedPerforatedCount > 0) {
    findings.push({
      id: 'audit-aisle-violation',
      category: 'Flujo de Aire 2D',
      severity: 'critical',
      title: `Violaciones de pasillo frío/caliente (${analysis.hotspotCount} hotspots, ${analysis.misplacedPerforatedCount} rejillas erróneas)`,
      detail: 'Existe recirculación de aire caliente hacia admisión fría o baldosas perforadas en pasillo caliente.',
      recommendation: 'Rota los racks enfrentados a 180° y sustituye las baldosas perforadas en pasillo caliente por ciegas.',
    });
  } else if (hasColdAisles && kpis.perforatedCount === 0) {
    findings.push({
      id: 'audit-no-perf',
      category: 'Flujo de Aire 2D',
      severity: 'major',
      title: 'Ausencia de baldosas perforadas en pasillos fríos',
      detail: 'Los racks tienen pasillos fríos definidos pero no hay rejillas de impulsión desde el plenum.',
      recommendation: 'Coloca baldosas perforadas delante de la cara frontal azul de los racks.',
    });
  } else {
    findings.push({
      id: 'audit-aisle-ok',
      category: 'Flujo de Aire 2D',
      severity: 'pass',
      title: 'Arquitectura de pasillos fríos/calientes y rejillas validada',
      detail: `0 cortocircuitos térmicos y ${kpis.perforatedCount} baldosa(s) perforada(s) correctamente ubicadas.${cacEnabled ? ' Cerramiento CAC activo.' : ''}`,
      recommendation: 'Mantener cerramiento CAC y sellado de pasamuros en suelo técnico.',
    });
  }

  // 6. Clean Agent Fire Suppression (NOVEC 1230 / FM-200) & Prohibition of Wet Sprinklers
  if (kpis.safetyCount === 0) {
    findings.push({
      id: 'audit-no-novec',
      category: 'PCI / Seguridad',
      severity: 'critical',
      title: 'Sin sistema automático de extinción por gas limpio (NOVEC 1230 / FM-200)',
      detail: 'No se ha instalado ningún cilindro de agente limpio ni detector termovelocimétrico en el Plano 2D.',
      recommendation: 'Coloca al menos un equipo Extinción Gas + Sensor en el Plano 2D.',
    });
  } else {
    findings.push({
      id: 'audit-novec-ok',
      category: 'PCI / Seguridad',
      severity: 'pass',
      title: 'Detección temprana y extinción automática por agente limpio instalada',
      detail: `${kpis.safetyCount} punto(s) NOVEC 1230 / FM-200 con detector termovelocimétrico en sala.`,
      recommendation: 'Verificar estanqueidad de sala (Door Fan Test) anualmente.',
    });
  }

  if (!checklist.noWetSprinklers) {
    findings.push({
      id: 'audit-wet-sprinklers',
      category: 'PCI / Seguridad',
      severity: 'critical',
      title: 'Rociadores de agua de tubería húmeda no descartados sobre racks',
      detail: 'TIA-942 y NFPA 75 prohíben explícitamente rociadores húmedos convencionales sobre equipamiento IT energizado por riesgo de cortocircuito masivo.',
      recommendation: 'Desmontar tubería húmeda o sustituir por sistema seco pre-acción + gas limpio y marcar verificación.',
    });
  } else {
    findings.push({
      id: 'audit-no-wet-ok',
      category: 'PCI / Seguridad',
      severity: 'pass',
      title: 'Sala libre de rociadores de agua de tubería húmeda sobre racks',
      detail: 'Confirmada ausencia de rociadores húmedos convencionales conforme a NFPA 75 / TIA-942.',
      recommendation: 'Mantener señalización de agente limpio en accesos.',
    });
  }

  // 7. ASHRAE TC 9.9 Environmental & PUE < 1.5
  const ashraeOk =
    thermalConfig.supplyTempC >= 18 &&
    thermalConfig.supplyTempC <= 27 &&
    thermalConfig.relativeHumidityPct >= 40 &&
    thermalConfig.relativeHumidityPct <= 60;

  if (!ashraeOk) {
    const severity =
      thermalConfig.relativeHumidityPct < 35 ||
      thermalConfig.relativeHumidityPct > 65 ||
      thermalConfig.supplyTempC > 27
        ? 'critical'
        : 'minor';
    findings.push({
      id: 'audit-ashrae',
      category: 'ASHRAE TC 9.9',
      severity,
      title: `Parámetros ambientales fuera de envolvente recomendada (${thermalConfig.supplyTempC}°C / ${thermalConfig.relativeHumidityPct}% HR)`,
      detail: 'La banda recomendada ASHRAE TC 9.9 exige 18–27 °C y 40–60% de humedad relativa.',
      recommendation: 'Ajusta temperatura e impulsión/humedad en la Pestaña 3.',
    });
  } else {
    findings.push({
      id: 'audit-ashrae-ok',
      category: 'ASHRAE TC 9.9',
      severity: 'pass',
      title: `Condiciones ambientales dentro de envolvente ASHRAE TC 9.9 (${thermalConfig.supplyTempC}°C · ${thermalConfig.relativeHumidityPct}% HR)`,
      detail: 'Riesgo mínimo de ESD, corrosión o throttling térmico.',
      recommendation: 'Monitorizar sensores en parte frontal superior/media/inferior de racks.',
    });
  }

  if (kpis.pue > 1.5) {
    findings.push({
      id: 'audit-pue-target',
      category: 'Eficiencia Energética',
      severity: kpis.pue > 1.8 ? 'major' : 'minor',
      title: `PUE (${kpis.pue.toFixed(2)}) supera el objetivo de ingeniería (< 1.50)`,
      detail: 'El sobrecoste climático o las pérdidas eléctricas degradan la eficiencia del CPD.',
      recommendation: 'Activa cerramiento CAC, elimina hotspots y migra a Chiller / Free Cooling Indirecto.',
    });
  } else if (kpis.pue > 0) {
    findings.push({
      id: 'audit-pue-ok',
      category: 'Eficiencia Energética',
      severity: 'pass',
      title: `PUE objetivo cumplido (${kpis.pue.toFixed(2)} <= 1.50 · DCiE ${kpis.dciePct.toFixed(1)}%)`,
      detail: 'Rendimiento energético alineado con ISO/IEC 30134-2.',
      recommendation: 'Registrar histórico estacional de PUE.',
    });
  }

  // 8. Physical Inspection Checklist: TIA-607, Leak Detection, EPO Cover
  if (!checklist.tia607Grounding) {
    findings.push({
      id: 'audit-tia607',
      category: 'Inspección Física',
      severity: 'major',
      title: 'Sin verificación de puesta a tierra equipotencial (TIA-607 CBN / Mesh-BN)',
      detail: 'La falta de malla equipotencial bajo suelo técnico expone a corrientes parásitas y fallos de enlace.',
      recommendation: 'Verificar malla de cobre Mesh-BN unida a barra TMGB/TGB y puentes a pedestales.',
    });
  } else {
    findings.push({
      id: 'audit-tia607-ok',
      category: 'Inspección Física',
      severity: 'pass',
      title: 'Puesta a tierra equipotencial CBN / Mesh-BN (TIA-607) verificada',
      detail: 'Racks, bandejas y estructura de suelo técnico enlazados equipotencialmente.',
      recommendation: 'Medir resistencia de tierra periódicamente (< 1 Ω recomendado).',
    });
  }

  if (!checklist.leakDetectionRope) {
    findings.push({
      id: 'audit-leak',
      category: 'Inspección Física',
      severity: 'minor',
      title: 'Falta cable detector de fugas de agua bajo suelo técnico (Leak Detection)',
      detail: 'Un derrame en condensados de CRAC o tuberías pasaría inadvertido en el plenum.',
      recommendation: 'Instalar cordón sensor perimetral conectado al BMS/DCIM alrededor de cada CRAC.',
    });
  } else {
    findings.push({
      id: 'audit-leak-ok',
      category: 'Inspección Física',
      severity: 'pass',
      title: 'Sensores de inundación bajo suelo técnico (Leak Detection Rope) operativos',
      detail: 'Detección temprana de condensados y fugas bajo plenum activa.',
      recommendation: 'Probar alarma de continuidad semestralmente.',
    });
  }

  if (!checklist.epoProtectedCover) {
    findings.push({
      id: 'audit-epo',
      category: 'Inspección Física',
      severity: 'major',
      title: 'Pulsador EPO sin cubeta protectora contra pulsación accidental',
      detail: 'Un golpe fortuito en el botón de parada de emergencia provocaría la caída instantánea del CPD.',
      recommendation: 'Instalar tapa basculante transparente precintada / doble acción en el pulsador EPO.',
    });
  } else {
    findings.push({
      id: 'audit-epo-ok',
      category: 'Inspección Física',
      severity: 'pass',
      title: 'EPO con cubeta protectora anti-pulsación accidental verificado',
      detail: 'Seguridad de corte de emergencia conforme sin riesgo de disparo fortuito.',
      recommendation: 'Incluir prueba en plan anual de mantenimiento.',
    });
  }

  // Silence unused grid parameter warning if needed by checking rack mix cleanly
  void grid;

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const majorCount = findings.filter((f) => f.severity === 'major').length;
  const minorCount = findings.filter((f) => f.severity === 'minor').length;
  const passCount = findings.filter((f) => f.severity === 'pass').length;

  const totalChecks = criticalCount + majorCount + minorCount + passCount;
  const penaltyWeight = criticalCount * 22 + majorCount * 12 + minorCount * 5;
  const scorePct = totalChecks > 0 ? Math.max(0, Math.min(100, 100 - penaltyWeight)) : 0;

  const verdict: AuditReport['verdict'] =
    criticalCount > 0
      ? 'NO CONFORME (RIESGO CRÍTICO)'
      : majorCount > 0 || minorCount > 0
      ? 'APTO CON OBSERVACIONES'
      : 'APTO PARA PRODUCCIÓN';

  return {
    timestamp: new Date().toISOString(),
    findings,
    criticalCount,
    majorCount,
    minorCount,
    passCount,
    scorePct,
    verdict,
  };
}

/**
 * Phase 5: 4 Real-Time Auto-Graded CTF Challenges
 */
export function evaluateCtfMissions(
  grid: GridCell[][],
  kpis: TelemetryKPIs,
  analysis: FloorAnalysis,
  cacEnabled: boolean,
  upsConfig: UpsConfig,
  upsCalc: UpsCalculationResult,
  tiaEval: Tia942EvaluationResult,
  auditReport: AuditReport
): CtfMission[] {
  const noThermalErrors =
    analysis.hotspotCount === 0 && analysis.misplacedPerforatedCount === 0;

  // Check if grid has both standard & high-density racks for Mission 4
  let hasStdRack = false;
  let hasHdRack = false;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      if (grid[r][c].type === 'rack_std') hasStdRack = true;
      if (grid[r][c].type === 'rack_hd') hasHdRack = true;
    }
  }

  // Misión 1: "Horno en el CPD Municipal"
  const m1Objectives = [
    {
      id: 'm1-load',
      label: 'Mantener carga térmica >= 85,000 BTU/h (~22+ kW IT)',
      passed: kpis.totalItKw >= 22 && kpis.totalBtuPerHour >= 85000,
    },
    {
      id: 'm1-aisle',
      label: '0 cortocircuitos térmicos y 0 rejillas en pasillo caliente',
      passed: noThermalErrors,
    },
    {
      id: 'm1-perf',
      label: 'Baldosas perforadas instaladas en pasillo frío (>= 4 uds)',
      passed: kpis.perforatedCount >= 4 && analysis.misplacedPerforatedCount === 0,
    },
    {
      id: 'm1-cool',
      label: 'Capacidad CRAC suficiente y PUE <= 1.55',
      passed: kpis.coolingMarginKw >= 0 && kpis.pue > 0 && kpis.pue <= 1.55,
    },
  ];

  // Misión 2: "Apagón de 20 Minutos"
  const m2Objectives = [
    {
      id: 'm2-load',
      label: 'Carga crítica >= 18.0 kW IT conectada',
      passed: upsCalc.totalCriticalKw >= 18,
    },
    {
      id: 'm2-vfi',
      label: 'SAI On-Line Doble Conversión (VFI) + Margen >= 20%',
      passed: upsConfig.technology === 'vfi' && upsConfig.growthMarginPct >= 20,
    },
    {
      id: 'm2-red',
      label: 'Redundancia SAI >= N+1 y Bus DC de 384V',
      passed: upsConfig.redundancy !== 'N' && upsConfig.dcBusVoltage === 384,
    },
    {
      id: 'm2-runtime',
      label: 'Autonomía real del banco de baterías >= 20.0 min',
      passed: upsCalc.estimatedActualRuntimeMin >= 20 && upsConfig.targetRuntimeMin >= 20,
    },
  ];

  // Misión 3: "El Falso Tier III"
  const m3Objectives = [
    {
      id: 'm3-subsystems',
      label: 'Los 4 subsistemas TIA-942 alcanzan >= Tier III (0 SPOFs)',
      passed: tiaEval.globalTierNum >= 3 && kpis.rackCount > 0,
    },
    {
      id: 'm3-ab',
      label: '100% de racks con doble acometida A+B',
      passed: kpis.rackCount > 0 && kpis.dualPowerRackRatio === 1,
    },
    {
      id: 'm3-pue',
      label: 'Eficiencia energética PUE < 1.45',
      passed: kpis.pue > 0 && kpis.pue < 1.45,
    },
  ];

  // Misión 4: "Arquitecto High-Density IA"
  const m4Objectives = [
    {
      id: 'm4-hd',
      label: 'Carga IT >= 40 kW mezclando Racks Estándar y Alta Densidad',
      passed: kpis.totalItKw >= 40 && hasStdRack && hasHdRack,
    },
    {
      id: 'm4-cac-gas',
      label: 'Cerramiento CAC activo y extinción gas NOVEC/FM-200',
      passed: cacEnabled && kpis.safetyCount >= 1,
    },
    {
      id: 'm4-ups-cool',
      label: 'SAI >= 15 min autonomía y refrigeración CRAC N+1',
      passed:
        upsConfig.technology === 'vfi' &&
        upsCalc.estimatedActualRuntimeMin >= 15 &&
        kpis.cracCount >= 2 &&
        kpis.totalCoolingCapacityKw - 25 >= kpis.totalHeatKw,
    },
    {
      id: 'm4-tier-audit',
      label: 'Nivel Tier III/IV y CERO hallazgos críticos en Auditoría',
      passed:
        (kpis.tier === 'Tier III' || kpis.tier === 'Tier IV') &&
        auditReport.criticalCount === 0,
    },
  ];

  return [
    {
      id: 'ctf-1',
      code: 'CTF-01',
      title: 'Horno en el CPD Municipal',
      subtitle: 'Pasillos y Termodinámica',
      brief:
        'Reorienta los racks en pasillo frío/caliente, deja las baldosas perforadas solo en el pasillo frío y dimensiona las unidades CRAC para >= 85,000 BTU/h con PUE <= 1.55.',
      flag: CTF_FLAGS[0],
      objectives: m1Objectives,
      completed: m1Objectives.every((o) => o.passed),
    },
    {
      id: 'ctf-2',
      code: 'CTF-02',
      title: 'Apagón de 20 Minutos',
      subtitle: 'Ingeniería de SAI',
      brief:
        'Ante cortes frecuentes sobre 18 kW IT (FP 0.9), configura un SAI On-Line VFI con >= 20% de margen, redundancia N+1 y banco de baterías de 384V DC con >= 20 min reales.',
      flag: CTF_FLAGS[1],
      objectives: m2Objectives,
      completed: m2Objectives.every((o) => o.passed),
    },
    {
      id: 'ctf-3',
      code: 'CTF-03',
      title: 'El Falso Tier III',
      subtitle: 'Auditoría TIA-942',
      brief:
        'Detecta y elimina los Puntos Únicos de Fallo (SPOF) ocultos en fibra, anillo hidráulico, combustible o racks hasta lograr un Tier III real en los 4 subsistemas con PUE < 1.45.',
      flag: CTF_FLAGS[2],
      objectives: m3Objectives,
      completed: m3Objectives.every((o) => o.passed),
    },
    {
      id: 'ctf-4',
      code: 'CTF-04',
      title: 'Arquitecto High-Density IA',
      subtitle: 'Diseño Integral',
      brief:
        'Diseña desde cero un CPD >= 40 kW IT combinando racks STD y HD-IA, CAC, NOVEC 1230, SAI >= 15 min, clima N+1, Tier III/IV y 0 hallazgos críticos en la Auditoría Física.',
      flag: CTF_FLAGS[3],
      objectives: m4Objectives,
      completed: m4Objectives.every((o) => o.passed),
    },
  ];
}
