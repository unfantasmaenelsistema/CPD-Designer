import {
  AuditChecklist,
  CatalogItem,
  CtfMissionId,
  GridCell,
  RackOrientation,
  ThermalConfig,
  Tia942Config,
  TileType,
  UpsConfig,
} from '../types';

export const GRID_ROWS = 8;
export const GRID_COLS = 12;
export const TILE_SIZE_CM = 60; // 60x60 cm raised floor tiles
export const ROOM_WIDTH_M = (GRID_COLS * TILE_SIZE_CM) / 100; // 7.2 m
export const ROOM_DEPTH_M = (GRID_ROWS * TILE_SIZE_CM) / 100; // 4.8 m
export const ROOM_AREA_M2 = Number((ROOM_WIDTH_M * ROOM_DEPTH_M).toFixed(2)); // 34.56 m²

export const CATALOG_ITEMS: CatalogItem[] = [
  {
    type: 'rack_std',
    code: 'STD',
    name: 'Rack 42U Baja Densidad',
    shortName: 'Rack Estándar',
    category: 'compute',
    description: 'Armario 42U estándar para servidores enterprise. 3.5 kW IT, FP 0.90.',
    defaultPowerKw: 3.5,
    defaultPowerFactor: 0.9,
    defaultUUsed: 28,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 0,
    isRack: true,
  },
  {
    type: 'rack_hd',
    code: 'HD-AI',
    name: 'Rack Alta Densidad / IA',
    shortName: 'Rack HD / Blade',
    category: 'compute',
    description: 'Bastidor Blade / GPU IA de alta densidad térmica. 12.0 kW IT, FP 0.95.',
    defaultPowerKw: 12.0,
    defaultPowerFactor: 0.95,
    defaultUUsed: 36,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 0,
    isRack: true,
  },
  {
    type: 'rack_net',
    code: 'NET',
    name: 'Rack Core Networking',
    shortName: 'Rack Comms',
    category: 'compute',
    description: 'Armario de comunicaciones, switches Spine/Leaf y patch panels. 1.8 kW, FP 0.85.',
    defaultPowerKw: 1.8,
    defaultPowerFactor: 0.85,
    defaultUUsed: 24,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 0,
    isRack: true,
  },
  {
    type: 'crac',
    code: 'CRAC',
    name: 'Unidad CRAC / InRow',
    shortName: 'CRAC 25 kWt',
    category: 'cooling',
    description: 'Climatizadora de precisión: 25 kW térmicos de extracción, consumo 4.5 kW.',
    defaultPowerKw: 0,
    defaultPowerFactor: 0.92,
    defaultUUsed: 0,
    coolingCapacityKw: 25.0,
    electricalDrawKw: 4.5,
    thermalLossKw: 0,
    isRack: false,
  },
  {
    type: 'perforated',
    code: 'PERF',
    name: 'Baldosa Perforada',
    shortName: 'Rejilla Impulsión',
    category: 'floor',
    description: 'Rejilla de impulsión desde plenum presurizado. Ubicar solo en pasillo frío.',
    defaultPowerKw: 0,
    defaultPowerFactor: 1,
    defaultUUsed: 0,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 0,
    isRack: false,
  },
  {
    type: 'blind',
    code: 'CIEGA',
    name: 'Baldosa Ciega Técnica',
    shortName: 'Baldosa Ciega',
    category: 'floor',
    description: 'Panel de suelo técnico elevado antiestático estándar (60x60 cm).',
    defaultPowerKw: 0,
    defaultPowerFactor: 1,
    defaultUUsed: 0,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 0,
    isRack: false,
  },
  {
    type: 'pdu',
    code: 'SAI/PDU',
    name: 'SAI / Cuadro Eléctrico PDU',
    shortName: 'SAI / PDU Sala',
    category: 'power_safety',
    description: 'Unidad de distribución y respaldo eléctrico. 0 kW IT, disipa 1.5 kW de pérdidas.',
    defaultPowerKw: 0,
    defaultPowerFactor: 0.98,
    defaultUUsed: 0,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 1.5,
    isRack: false,
  },
  {
    type: 'safety',
    code: 'NOVEC',
    name: 'Extinción Gas + Sensor',
    shortName: 'NOVEC / Sensor',
    category: 'power_safety',
    description: 'Cilindro de agente limpio NOVEC 1230 / FM-200 y detector termovelocimétrico.',
    defaultPowerKw: 0,
    defaultPowerFactor: 1,
    defaultUUsed: 0,
    coolingCapacityKw: 0,
    electricalDrawKw: 0,
    thermalLossKw: 0,
    isRack: false,
  },
];

export const CATALOG_MAP: Record<TileType, CatalogItem | undefined> = CATALOG_ITEMS.reduce(
  (acc, item) => {
    acc[item.type] = item;
    return acc;
  },
  {} as Record<TileType, CatalogItem | undefined>
);

export function createCell(
  row: number,
  col: number,
  type: TileType = 'empty',
  orientation: RackOrientation = 'south',
  overrides?: Partial<GridCell>
): GridCell {
  const item = CATALOG_MAP[type];
  return {
    row,
    col,
    type,
    orientation,
    powerKw: item?.defaultPowerKw ?? 0,
    powerFactor: item?.defaultPowerFactor ?? 0.9,
    uUsed: item?.defaultUUsed ?? 0,
    uTotal: 42,
    dualPower: type === 'rack_hd',
    ...overrides,
  };
}

export function createEmptyGrid(): GridCell[][] {
  return Array.from({ length: GRID_ROWS }, (_, r) =>
    Array.from({ length: GRID_COLS }, (_, c) => createCell(r, c, 'empty'))
  );
}

export function createStandardPresetGrid(): GridCell[][] {
  const grid = createEmptyGrid();

  for (let c = 0; c < GRID_COLS; c++) {
    grid[0][c] = createCell(0, c, 'blind');
    grid[4][c] = createCell(4, c, 'blind');
    grid[7][c] = createCell(7, c, 'blind');
  }

  grid[0][1] = createCell(0, 1, 'crac');
  grid[0][10] = createCell(0, 10, 'crac');
  grid[7][1] = createCell(7, 1, 'crac');

  grid[0][0] = createCell(0, 0, 'pdu');
  grid[7][0] = createCell(7, 0, 'pdu');
  grid[0][11] = createCell(0, 11, 'safety');
  grid[7][11] = createCell(7, 11, 'safety');

  const row1Cols = [3, 4, 5, 6, 7, 8];
  row1Cols.forEach((c) => {
    const type: TileType = c === 3 ? 'rack_net' : c === 5 || c === 6 ? 'rack_hd' : 'rack_std';
    grid[1][c] = createCell(1, c, type, 'south', { dualPower: true });
  });

  for (let c = 2; c <= 9; c++) {
    grid[2][c] = createCell(2, c, c >= 3 && c <= 8 ? 'perforated' : 'blind');
  }

  row1Cols.forEach((c) => {
    const type: TileType = c === 8 ? 'rack_net' : c === 4 ? 'rack_hd' : 'rack_std';
    grid[3][c] = createCell(3, c, type, 'north', { dualPower: true });
  });

  [4, 5, 6, 7].forEach((c) => {
    grid[5][c] = createCell(5, c, 'rack_std', 'south', { dualPower: c !== 7 });
  });

  for (let c = 3; c <= 8; c++) {
    grid[6][c] = createCell(6, c, c >= 4 && c <= 7 ? 'perforated' : 'blind');
  }

  return grid;
}

export function createFaultyDemoGrid(): GridCell[][] {
  const grid = createStandardPresetGrid();
  grid[3][5] = createCell(3, 5, 'rack_hd', 'south', { dualPower: false });
  grid[5][6] = createCell(5, 6, 'rack_hd', 'north', { dualPower: false });
  grid[4][4] = createCell(4, 4, 'perforated');
  grid[7][1] = createCell(7, 1, 'blind');
  return grid;
}

export interface CtfScenarioBundle {
  grid: GridCell[][];
  cacEnabled: boolean;
  upsPatch?: Partial<UpsConfig>;
  thermalPatch?: Partial<ThermalConfig>;
  tiaPatch?: Partial<Tia942Config>;
  checklistPatch?: Partial<AuditChecklist>;
  focusCoord: { row: number; col: number } | null;
}

export function createCtfScenario(missionId: CtfMissionId): CtfScenarioBundle {
  if (missionId === 'ctf-1') {
    // Misión 1: "Horno en el CPD Municipal" (~24.5 kW IT -> >85,000 BTU/h, bad orientation, perforated in hot aisle, only 1 CRAC)
    const grid = createEmptyGrid();
    for (let c = 0; c < GRID_COLS; c++) {
      grid[0][c] = createCell(0, c, 'blind');
      grid[4][c] = createCell(4, c, 'blind');
      grid[7][c] = createCell(7, c, 'blind');
    }
    grid[0][0] = createCell(0, 0, 'pdu');
    grid[0][1] = createCell(0, 1, 'crac'); // Only 1 CRAC (25 kWt < ~29 kWt demand!)
    grid[0][11] = createCell(0, 11, 'safety');

    // Row 1 facing South
    [3, 4, 5, 6].forEach((c) => {
      grid[1][c] = createCell(1, c, 'rack_std', 'south', { dualPower: true });
    });
    // Row 2: Cold aisle missing perforated tiles (currently blind)
    [3, 4, 5, 6].forEach((c) => {
      grid[2][c] = createCell(2, c, 'blind');
    });
    // Row 3: Misoriented racks facing South -> blowing hot exhaust North into Row 2!
    [3, 4, 5, 6].forEach((c) => {
      const type: TileType = c === 4 ? 'rack_hd' : 'rack_std'; // 3*3.5 + 12 = 22.5? Wait: row1=14 + row3=22.5 -> 36.5? Let's make 7 std racks = 24.5 kW
      grid[3][c] = createCell(3, c, type === 'rack_hd' ? 'rack_std' : 'rack_std', 'south', {
        powerKw: c === 5 ? 4.0 : 3.5,
        dualPower: true,
      });
    });
    // Row 4: Hot aisle erroneously filled with perforated tiles!
    [3, 4, 5, 6].forEach((c) => {
      grid[4][c] = createCell(4, c, 'perforated');
    });

    return {
      grid,
      cacEnabled: false,
      thermalPatch: { coolingTech: 'dx', supplyTempC: 20 },
      focusCoord: { row: 3, col: 4 },
    };
  }

  if (missionId === 'ctf-2') {
    // Misión 2: "Apagón de 20 Minutos" (18.0 kW IT, FP 0.9, UPS misconfigured)
    const grid = createEmptyGrid();
    for (let c = 0; c < GRID_COLS; c++) {
      grid[0][c] = createCell(0, c, 'blind');
      grid[4][c] = createCell(4, c, 'blind');
      grid[7][c] = createCell(7, c, 'blind');
    }
    grid[0][0] = createCell(0, 0, 'pdu');
    grid[0][1] = createCell(0, 1, 'crac');
    grid[0][10] = createCell(0, 10, 'crac');
    grid[0][11] = createCell(0, 11, 'safety');

    // 5 racks x 3.6 kW (FP 0.9) = 18.0 kW IT (20.0 kVA)
    [4, 5, 6].forEach((c) => {
      grid[1][c] = createCell(1, c, 'rack_std', 'south', {
        powerKw: 3.6,
        powerFactor: 0.9,
        dualPower: true,
      });
      grid[2][c] = createCell(2, c, 'perforated');
    });
    [4, 5].forEach((c) => {
      grid[3][c] = createCell(3, c, 'rack_std', 'north', {
        powerKw: 3.6,
        powerFactor: 0.9,
        dualPower: true,
      });
    });

    return {
      grid,
      cacEnabled: true,
      upsPatch: {
        manualExtraKw: 0,
        technology: 'vfd',
        growthMarginPct: 10,
        redundancy: 'N',
        dcBusVoltage: 240,
        targetRuntimeMin: 10,
      },
      focusCoord: { row: 1, col: 4 },
    };
  }

  if (missionId === 'ctf-3') {
    // Misión 3: "El Falso Tier III" (looks fine, but hidden SPOFs in TIA-942 & 1 rack missing A+B)
    const grid = createStandardPresetGrid();
    return {
      grid,
      cacEnabled: true,
      upsPatch: {
        technology: 'vfi',
        redundancy: 'N+1',
        growthMarginPct: 25,
      },
      thermalPatch: {
        coolingTech: 'chiller',
        supplyTempC: 22,
      },
      tiaPatch: {
        utilityFeeds: 'single',
        dieselRedundancy: 'N+1',
        fuelAutonomyHours: '12h',
        distributionPath: 'dual_ab',
        mechanicalRedundancySource: 'from_floor',
        chilledWaterLoop: 'single_loop',
        fiberEntrances: 'single_entrance',
        coreRedundancy: 'redundant_diverse',
        fireRating: 'RF-120',
        accessControl: 'rfid',
      },
      focusCoord: { row: 5, col: 7 },
    };
  }

  // Misión 4: "Arquitecto High-Density IA" (Design from scratch)
  return {
    grid: createEmptyGrid(),
    cacEnabled: false,
    upsPatch: {
      manualExtraKw: 0,
      technology: 'vfi',
      growthMarginPct: 20,
      redundancy: 'N+1',
      targetRuntimeMin: 15,
    },
    thermalPatch: {
      coolingTech: 'chiller',
      supplyTempC: 22,
      relativeHumidityPct: 48,
    },
    tiaPatch: {
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
    },
    checklistPatch: {
      tia607Grounding: false,
      leakDetectionRope: false,
      epoProtectedCover: false,
      noWetSprinklers: false,
    },
    focusCoord: null,
  };
}

export function isRackType(type: TileType): boolean {
  return type === 'rack_std' || type === 'rack_hd' || type === 'rack_net';
}

export function formatCoord(row: number, col: number): string {
  return `F${String(row + 1).padStart(2, '0')}-C${String(col + 1).padStart(2, '0')}`;
}
