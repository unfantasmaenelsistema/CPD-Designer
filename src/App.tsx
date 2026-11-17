import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';
import { AuditModule } from './components/AuditModule';
import { BrushTool, CatalogSidebar } from './components/CatalogSidebar';
import { FloorGrid } from './components/FloorGrid';
import { HeaderTelemetry } from './components/HeaderTelemetry';
import { InspectorSidebar } from './components/InspectorSidebar';
import { ThermalModule } from './components/ThermalModule';
import { TierModule } from './components/TierModule';
import { UpsModule } from './components/UpsModule';
import {
  createCell,
  createCtfScenario,
  createEmptyGrid,
  createFaultyDemoGrid,
  createStandardPresetGrid,
  GRID_COLS,
  GRID_ROWS,
  isRackType,
} from './data/catalog';
import {
  analyzeFloorGrid,
  calculateTelemetryKPIs,
  calculateUpsEngineering,
  DEFAULT_AUDIT_CHECKLIST,
  DEFAULT_THERMAL_CONFIG,
  DEFAULT_TIA942_CONFIG,
  DEFAULT_UPS_CONFIG,
  evaluateCtfMissions,
  evaluateTia942Subsystems,
  runEngineeringAudit,
} from './engine/dcimEngine';
import {
  AppMode,
  AuditChecklist,
  CtfMissionId,
  GridCell,
  ProjectData,
  RackOrientation,
  TabId,
  ThermalConfig,
  Tia942Config,
  TileType,
  UpsConfig,
} from './types';

const STORAGE_KEY = 'cpd_designer_state_v1';

interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'error';
}

export default function App() {
  const [grid, setGrid] = useState<GridCell[][]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (
          Array.isArray(parsed.grid) &&
          parsed.grid.length === GRID_ROWS &&
          parsed.grid[0]?.length === GRID_COLS
        ) {
          return parsed.grid;
        }
      }
    } catch {
      // Fallback to standard preset
    }
    return createStandardPresetGrid();
  });

  const [cacEnabled, setCacEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (typeof parsed.cacEnabled === 'boolean') return parsed.cacEnabled;
      }
    } catch {
      // Ignore
    }
    return true;
  });

  const [upsConfig, setUpsConfig] = useState<UpsConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (parsed.upsConfig) {
          return { ...DEFAULT_UPS_CONFIG, ...parsed.upsConfig };
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_UPS_CONFIG;
  });

  const [thermalConfig, setThermalConfig] = useState<ThermalConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (parsed.thermalConfig) {
          return { ...DEFAULT_THERMAL_CONFIG, ...parsed.thermalConfig };
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_THERMAL_CONFIG;
  });

  const [tiaConfig, setTiaConfig] = useState<Tia942Config>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (parsed.tia942Config) {
          return { ...DEFAULT_TIA942_CONFIG, ...parsed.tia942Config };
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_TIA942_CONFIG;
  });

  const [auditChecklist, setAuditChecklist] = useState<AuditChecklist>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (parsed.auditChecklist) {
          return { ...DEFAULT_AUDIT_CHECKLIST, ...parsed.auditChecklist };
        }
      }
    } catch {
      // Ignore
    }
    return DEFAULT_AUDIT_CHECKLIST;
  });

  const [unlockedFlags, setUnlockedFlags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<ProjectData>;
        if (Array.isArray(parsed.unlockedFlags)) {
          return parsed.unlockedFlags.filter((f): f is string => typeof f === 'string');
        }
      }
    } catch {
      // Ignore
    }
    return [];
  });

  const [mode, setMode] = useState<AppMode>('free');
  const [activeTab, setActiveTab] = useState<TabId>('floor');
  const [activeTool, setActiveTool] = useState<BrushTool>('inspect');
  const [defaultOrientation, setDefaultOrientation] = useState<RackOrientation>('south');
  const [selectedCoord, setSelectedCoord] = useState<{ row: number; col: number } | null>({
    row: 1,
    col: 5,
  });
  const [activeMissionId, setActiveMissionId] = useState<CtfMissionId>('ctf-1');
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    setToast({ id: Date.now(), text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Persist workspace to localStorage
  useEffect(() => {
    try {
      const payload: ProjectData = {
        version: '5.0',
        name: 'CPD Designer Project',
        exportedAt: new Date().toISOString(),
        cacEnabled,
        mode,
        grid,
        upsConfig,
        thermalConfig,
        tia942Config: tiaConfig,
        auditChecklist,
        unlockedFlags,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota issues
    }
  }, [grid, cacEnabled, mode, upsConfig, thermalConfig, tiaConfig, auditChecklist, unlockedFlags]);

  // Real-time spatial thermal validation, KPIs, UPS, TIA-942, Audit & CTF (synced across Phases 1-5)
  const analysis = useMemo(() => analyzeFloorGrid(grid, cacEnabled), [grid, cacEnabled]);
  const kpis = useMemo(
    () =>
      calculateTelemetryKPIs(
        grid,
        analysis,
        cacEnabled,
        upsConfig,
        thermalConfig,
        tiaConfig
      ),
    [grid, analysis, cacEnabled, upsConfig, thermalConfig, tiaConfig]
  );
  const upsCalc = useMemo(
    () => calculateUpsEngineering(kpis.totalItKw, kpis.totalItKva, upsConfig),
    [kpis.totalItKw, kpis.totalItKva, upsConfig]
  );
  const tiaEval = useMemo(
    () => evaluateTia942Subsystems(kpis, analysis, cacEnabled, upsConfig, tiaConfig),
    [kpis, analysis, cacEnabled, upsConfig, tiaConfig]
  );
  const auditReport = useMemo(
    () =>
      runEngineeringAudit(
        grid,
        kpis,
        analysis,
        cacEnabled,
        upsConfig,
        upsCalc,
        thermalConfig,
        auditChecklist
      ),
    [grid, kpis, analysis, cacEnabled, upsConfig, upsCalc, thermalConfig, auditChecklist]
  );
  const missions = useMemo(
    () =>
      evaluateCtfMissions(
        grid,
        kpis,
        analysis,
        cacEnabled,
        upsConfig,
        upsCalc,
        tiaEval,
        auditReport
      ),
    [grid, kpis, analysis, cacEnabled, upsConfig, upsCalc, tiaEval, auditReport]
  );

  // Auto-unlock CTF flags upon completing mission objectives
  useEffect(() => {
    const newlyUnlocked = missions
      .filter((m) => m.completed && !unlockedFlags.includes(m.flag))
      .map((m) => m.flag);
    if (newlyUnlocked.length > 0) {
      setUnlockedFlags((prev) => Array.from(new Set([...prev, ...newlyUnlocked])));
      showToast(`Flag desbloqueada: ${newlyUnlocked[0]}`, 'success');
    }
  }, [missions, unlockedFlags, showToast]);

  const selectedCell = useMemo(() => {
    if (!selectedCoord) return null;
    return grid[selectedCoord.row]?.[selectedCoord.col] ?? null;
  }, [grid, selectedCoord]);

  const handleUpdateUpsConfig = useCallback((patch: Partial<UpsConfig>) => {
    setUpsConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateThermalConfig = useCallback((patch: Partial<ThermalConfig>) => {
    setThermalConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateTiaConfig = useCallback((patch: Partial<Tia942Config>) => {
    setTiaConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateChecklist = useCallback((patch: Partial<AuditChecklist>) => {
    setAuditChecklist((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleActivateCtfMission = useCallback(
    (id: CtfMissionId) => {
      const scenario = createCtfScenario(id);
      setMode('ctf');
      setActiveMissionId(id);
      setGrid(scenario.grid);
      setCacEnabled(scenario.cacEnabled);
      setUpsConfig({ ...DEFAULT_UPS_CONFIG, ...(scenario.upsPatch ?? {}) });
      setThermalConfig({ ...DEFAULT_THERMAL_CONFIG, ...(scenario.thermalPatch ?? {}) });
      setTiaConfig({ ...DEFAULT_TIA942_CONFIG, ...(scenario.tiaPatch ?? {}) });
      setAuditChecklist({ ...DEFAULT_AUDIT_CHECKLIST, ...(scenario.checklistPatch ?? {}) });
      setSelectedCoord(scenario.focusCoord);

      const targetTab: TabId =
        id === 'ctf-2' ? 'ups' : id === 'ctf-3' ? 'tier' : 'floor';
      setActiveTab(targetTab);
      showToast(`Reto ${id.toUpperCase()} cargado. Resuelve los objetivos en vivo.`, 'info');
    },
    [showToast]
  );

  const handleFactoryReset = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    setGrid(createStandardPresetGrid());
    setCacEnabled(true);
    setUpsConfig(DEFAULT_UPS_CONFIG);
    setThermalConfig(DEFAULT_THERMAL_CONFIG);
    setTiaConfig(DEFAULT_TIA942_CONFIG);
    setAuditChecklist(DEFAULT_AUDIT_CHECKLIST);
    setUnlockedFlags([]);
    setMode('free');
    setActiveMissionId('ctf-1');
    setSelectedCoord({ row: 1, col: 5 });
    setActiveTab('floor');
    showToast('Simulador reiniciado a valores de fábrica.', 'success');
  }, [showToast]);

  const placeItemAt = useCallback(
    (row: number, col: number, type: TileType, orientation: RackOrientation) => {
      setGrid((prev) =>
        prev.map((rCells, r) =>
          r !== row
            ? rCells
            : rCells.map((cell, c) =>
                c !== col ? cell : createCell(row, col, type, orientation)
              )
        )
      );
      setSelectedCoord({ row, col });
    },
    []
  );

  const handleCellClick = useCallback(
    (row: number, col: number) => {
      if (activeTool === 'inspect') {
        setSelectedCoord({ row, col });
        return;
      }
      if (activeTool === 'empty') {
        placeItemAt(row, col, 'empty', defaultOrientation);
        return;
      }
      placeItemAt(row, col, activeTool, defaultOrientation);
    },
    [activeTool, defaultOrientation, placeItemAt]
  );

  const handleMoveCell = useCallback(
    (fromRow: number, fromCol: number, toRow: number, toCol: number) => {
      setGrid((prev) => {
        const source = prev[fromRow]?.[fromCol];
        if (!source || source.type === 'empty') return prev;

        return prev.map((rCells, r) =>
          rCells.map((cell, c) => {
            if (r === toRow && c === toCol) {
              return { ...source, row: toRow, col: toCol };
            }
            if (r === fromRow && c === fromCol) {
              return createCell(fromRow, fromCol, 'empty');
            }
            return cell;
          })
        );
      });
      setSelectedCoord({ row: toRow, col: toCol });
    },
    []
  );

  const handleUpdateCell = useCallback(
    (row: number, col: number, patch: Partial<GridCell>) => {
      setGrid((prev) =>
        prev.map((rCells, r) =>
          r !== row
            ? rCells
            : rCells.map((cell, c) => (c !== col ? cell : { ...cell, ...patch }))
        )
      );
    },
    []
  );

  const handleRotateRack = useCallback((row: number, col: number) => {
    setGrid((prev) =>
      prev.map((rCells, r) =>
        r !== row
          ? rCells
          : rCells.map((cell, c) => {
              if (c !== col || !isRackType(cell.type)) return cell;
              return {
                ...cell,
                orientation: cell.orientation === 'north' ? 'south' : 'north',
              };
            })
      )
    );
  }, []);

  const handleDeleteCell = useCallback((row: number, col: number) => {
    setGrid((prev) =>
      prev.map((rCells, r) =>
        r !== row
          ? rCells
          : rCells.map((cell, c) => (c !== col ? cell : createCell(row, col, 'empty')))
      )
    );
  }, []);

  const handleLoadPreset = useCallback(
    (preset: 'standard' | 'faulty' | 'empty') => {
      if (preset === 'standard') {
        setGrid(createStandardPresetGrid());
        setCacEnabled(true);
        setSelectedCoord({ row: 1, col: 5 });
        showToast('Cargada Sala Tipo con pasillos fríos/calientes optimizados.', 'success');
      } else if (preset === 'faulty') {
        setGrid(createFaultyDemoGrid());
        setCacEnabled(false);
        setSelectedCoord({ row: 3, col: 5 });
        showToast('Cargado escenario con cortocircuitos térmicos para diagnóstico.', 'info');
      } else {
        setGrid(createEmptyGrid());
        setSelectedCoord(null);
        showToast('Suelo técnico vaciado por completo.', 'info');
      }
    },
    [showToast]
  );

  const handleModeChange = useCallback(
    (nextMode: AppMode) => {
      setMode(nextMode);
      if (nextMode === 'ctf') {
        setActiveTab('floor');
        showToast('Modo Misiones CTF activado. Revisa los objetivos sobre el plano.', 'info');
      }
    },
    [showToast]
  );

  const handleExportJson = useCallback(() => {
    const project: ProjectData = {
      version: '5.0',
      name: 'CPD Designer Project',
      exportedAt: new Date().toISOString(),
      cacEnabled,
      mode,
      grid,
      upsConfig,
      thermalConfig,
      tia942Config: tiaConfig,
      auditChecklist,
      unlockedFlags,
    };
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cpd-designer-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Proyecto exportado en formato JSON.', 'success');
  }, [
    cacEnabled,
    mode,
    grid,
    upsConfig,
    thermalConfig,
    tiaConfig,
    auditChecklist,
    unlockedFlags,
    showToast,
  ]);

  const handleImportJson = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as Partial<ProjectData>;
          if (
            !Array.isArray(parsed.grid) ||
            parsed.grid.length !== GRID_ROWS ||
            parsed.grid[0]?.length !== GRID_COLS
          ) {
            showToast('El archivo JSON no contiene una matriz válida 12×8.', 'error');
            return;
          }
          setGrid(parsed.grid);
          if (typeof parsed.cacEnabled === 'boolean') setCacEnabled(parsed.cacEnabled);
          if (parsed.mode === 'free' || parsed.mode === 'ctf') setMode(parsed.mode);
          if (parsed.upsConfig) {
            setUpsConfig({ ...DEFAULT_UPS_CONFIG, ...parsed.upsConfig });
          }
          if (parsed.thermalConfig) {
            setThermalConfig({ ...DEFAULT_THERMAL_CONFIG, ...parsed.thermalConfig });
          }
          if (parsed.tia942Config) {
            setTiaConfig({ ...DEFAULT_TIA942_CONFIG, ...parsed.tia942Config });
          }
          if (parsed.auditChecklist) {
            setAuditChecklist({ ...DEFAULT_AUDIT_CHECKLIST, ...parsed.auditChecklist });
          }
          if (Array.isArray(parsed.unlockedFlags)) {
            setUnlockedFlags(
              parsed.unlockedFlags.filter((f): f is string => typeof f === 'string')
            );
          }
          setSelectedCoord(null);
          showToast('Proyecto importado correctamente.', 'success');
        } catch {
          showToast('Error al leer el archivo JSON del proyecto.', 'error');
        }
      };
      reader.readAsText(file);
    },
    [showToast]
  );

  // Keyboard shortcuts only when on Floor tab
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'floor') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if ((e.key === 'r' || e.key === 'R') && selectedCoord) {
        handleRotateRack(selectedCoord.row, selectedCoord.col);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCoord) {
        handleDeleteCell(selectedCoord.row, selectedCoord.col);
      } else if (e.key === 'Escape') {
        setActiveTool('inspect');
        setSelectedCoord(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, selectedCoord, handleRotateRack, handleDeleteCell]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <HeaderTelemetry
        kpis={kpis}
        analysis={analysis}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        mode={mode}
        onModeChange={handleModeChange}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
      />

      {activeTab === 'floor' ? (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          <CatalogSidebar
            activeTool={activeTool}
            onSelectTool={setActiveTool}
            defaultOrientation={defaultOrientation}
            onOrientationChange={setDefaultOrientation}
            cacEnabled={cacEnabled}
            onToggleCac={() => setCacEnabled((v) => !v)}
            onLoadPreset={handleLoadPreset}
          />

          <FloorGrid
            grid={grid}
            analysis={analysis}
            selectedCoord={selectedCoord}
            activeTool={activeTool}
            cacEnabled={cacEnabled}
            mode={mode}
            missions={missions}
            unlockedFlags={unlockedFlags}
            activeMissionId={activeMissionId}
            onSelectMission={setActiveMissionId}
            onActivateCtfMission={handleActivateCtfMission}
            onCellClick={handleCellClick}
            onDropCatalogItem={placeItemAt}
            onMoveCell={handleMoveCell}
            onQuickRotateRack={handleRotateRack}
          />

          <InspectorSidebar
            selectedCell={selectedCell}
            analysis={analysis}
            kpis={kpis}
            onUpdateCell={handleUpdateCell}
            onRotateRack={handleRotateRack}
            onDeleteCell={handleDeleteCell}
            onConvertPerforatedToBlind={(r, c) =>
              handleUpdateCell(r, c, { type: 'blind' })
            }
          />
        </div>
      ) : activeTab === 'ups' ? (
        <UpsModule
          kpis={kpis}
          upsConfig={upsConfig}
          onUpdateUpsConfig={handleUpdateUpsConfig}
        />
      ) : activeTab === 'thermal' ? (
        <ThermalModule
          kpis={kpis}
          analysis={analysis}
          cacEnabled={cacEnabled}
          onToggleCac={() => setCacEnabled((v) => !v)}
          thermalConfig={thermalConfig}
          onUpdateThermalConfig={handleUpdateThermalConfig}
        />
      ) : activeTab === 'tier' ? (
        <TierModule
          kpis={kpis}
          analysis={analysis}
          cacEnabled={cacEnabled}
          upsConfig={upsConfig}
          tiaConfig={tiaConfig}
          onUpdateTiaConfig={handleUpdateTiaConfig}
        />
      ) : (
        <AuditModule
          kpis={kpis}
          upsCalc={upsCalc}
          tiaEval={tiaEval}
          checklist={auditChecklist}
          onUpdateChecklist={handleUpdateChecklist}
          auditReport={auditReport}
          missions={missions}
          unlockedFlags={unlockedFlags}
          activeMissionId={activeMissionId}
          onActivateCtfMission={handleActivateCtfMission}
          onFactoryReset={handleFactoryReset}
        />
      )}

      {/* Non-blocking Toast Feedback */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs font-medium shadow-lg ${
            toast.tone === 'success'
              ? 'bg-slate-900 border-emerald-500/60 text-emerald-300'
              : toast.tone === 'error'
              ? 'bg-slate-900 border-red-500/60 text-red-300'
              : 'bg-slate-900 border-cyan-500/60 text-cyan-200'
          }`}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <Info className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Cerrar aviso"
            className="ml-1 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
