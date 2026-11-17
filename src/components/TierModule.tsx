import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Network,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { evaluateTia942Subsystems } from '../engine/dcimEngine';
import {
  FloorAnalysis,
  TelemetryKPIs,
  Tia942Config,
  UpsConfig,
} from '../types';

interface TierModuleProps {
  kpis: TelemetryKPIs;
  analysis: FloorAnalysis;
  cacEnabled: boolean;
  upsConfig: UpsConfig;
  tiaConfig: Tia942Config;
  onUpdateTiaConfig: (patch: Partial<Tia942Config>) => void;
}

type FaultNodeId =
  | 'util_a'
  | 'ups_a'
  | 'pdu_a'
  | 'crac_1'
  | 'pipe_a'
  | 'fiber_1'
  | 'core_a';

export const TierModule: React.FC<TierModuleProps> = ({
  kpis,
  analysis,
  cacEnabled,
  upsConfig,
  tiaConfig,
  onUpdateTiaConfig,
}) => {
  const evalResult = useMemo(
    () => evaluateTia942Subsystems(kpis, analysis, cacEnabled, upsConfig, tiaConfig),
    [kpis, analysis, cacEnabled, upsConfig, tiaConfig]
  );

  // Interactive SVG Fault / Concurrent Maintenance Simulation State
  const [faultedNodes, setFaultedNodes] = useState<Record<FaultNodeId, boolean>>({
    util_a: false,
    ups_a: false,
    pdu_a: false,
    crac_1: false,
    pipe_a: false,
    fiber_1: false,
    core_a: false,
  });

  const toggleNodeFault = (id: FaultNodeId) => {
    setFaultedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetFaults = () => {
    setFaultedNodes({
      util_a: false,
      ups_a: false,
      pdu_a: false,
      crac_1: false,
      pipe_a: false,
      fiber_1: false,
      core_a: false,
    });
  };

  const injectScenario = (scenario: 'branch_a' | 'crac_1' | 'pipe_a' | 'fiber_1') => {
    resetFaults();
    if (scenario === 'branch_a') {
      setFaultedNodes((p) => ({ ...p, ups_a: true, pdu_a: true }));
    } else if (scenario === 'crac_1') {
      setFaultedNodes((p) => ({ ...p, crac_1: true }));
    } else if (scenario === 'pipe_a') {
      setFaultedNodes((p) => ({ ...p, pipe_a: true }));
    } else if (scenario === 'fiber_1') {
      setFaultedNodes((p) => ({ ...p, fiber_1: true }));
    }
  };

  // Evaluate Live Single-Line Continuity under injected faults
  const simOutcome = useMemo(() => {
    const hasPathB =
      tiaConfig.distributionPath === 'dual_ab' &&
      (kpis.rackCount === 0 || kpis.dualPowerRackRatio === 1);
    const hasUpsB =
      upsConfig.redundancy === 'N+1' ||
      upsConfig.redundancy === '2N' ||
      upsConfig.redundancy === '2(N+1)';
    const hasDieselBackup = tiaConfig.dieselRedundancy !== 'none';
    const hasSecondUtility = tiaConfig.utilityFeeds === 'dual_substation';

    // Electrical Path A status
    const utilAFailed = faultedNodes.util_a;
    const branchADownByUtil = utilAFailed && !hasSecondUtility && !hasDieselBackup;
    const branchADownByEquip = faultedNodes.ups_a || faultedNodes.pdu_a;
    const powerPathAAlive = !branchADownByUtil && !branchADownByEquip;

    // Electrical Path B status
    const powerPathBAlive =
      hasPathB &&
      hasUpsB &&
      (!utilAFailed || hasSecondUtility || hasDieselBackup);

    const serversPowered = powerPathAAlive || powerPathBAlive;

    // Cooling status
    const mechRedundant =
      evalResult.effectiveMechanicalRedundancy === 'N+1' ||
      evalResult.effectiveMechanicalRedundancy === '2(N+1)';
    const pipeDual = tiaConfig.chilledWaterLoop === 'dual_loop_isolated';

    const coolingAliveFromCrac = !faultedNodes.crac_1 || mechRedundant;
    const coolingAliveFromPipe = !faultedNodes.pipe_a || pipeDual;
    const serversCooled = coolingAliveFromCrac && coolingAliveFromPipe;

    // Telecom status
    const fiberDual = tiaConfig.fiberEntrances === 'dual_20m';
    const coreDual = tiaConfig.coreRedundancy === 'redundant_diverse';
    const fiberAlive = !faultedNodes.fiber_1 || fiberDual;
    const coreAlive = !faultedNodes.core_a || coreDual;
    const serversConnected = fiberAlive && coreAlive;

    const anyFaultActive = Object.values(faultedNodes).some(Boolean);
    const totalOutage = !serversPowered || !serversCooled || !serversConnected;

    const failureMessages: string[] = [];
    if (!serversPowered) {
      if (branchADownByUtil) {
        failureMessages.push(
          'Corte de acometida única sin segunda subestación ni grupo electrógeno diésel (SPOF eléctrico).'
        );
      } else {
        failureMessages.push(
          'Corte/fallo en Rama Eléctrica A sin camino redundante B activo hacia el 100% de los racks (SPOF).'
        );
      }
    }
    if (!serversCooled) {
      if (faultedNodes.pipe_a && !pipeDual) {
        failureMessages.push(
          'Intervención en anillo hidráulico simple detiene todas las unidades CRAC (SPOF mecánico).'
        );
      }
      if (faultedNodes.crac_1 && !mechRedundant) {
        failureMessages.push(
          'Avería de CRAC #1 en topología sin redundancia N+1 provoca sobrecalentamiento crítico.'
        );
      }
    }
    if (!serversConnected) {
      if (faultedNodes.fiber_1 && !fiberDual) {
        failureMessages.push(
          'Corte en acometida única de fibra óptica deja al CPD incomunicado (SPOF telecom).'
        );
      }
      if (faultedNodes.core_a && !coreDual) {
        failureMessages.push(
          'Fallo de Core Switch único interrumpe el tráfico del centro de datos (SPOF telecom).'
        );
      }
    }

    return {
      anyFaultActive,
      totalOutage,
      serversPowered,
      serversCooled,
      serversConnected,
      powerPathAAlive,
      powerPathBAlive,
      hasPathB,
      hasUpsB,
      hasDieselBackup,
      hasSecondUtility,
      mechRedundant,
      pipeDual,
      fiberDual,
      coreDual,
      failureMessages,
    };
  }, [faultedNodes, tiaConfig, upsConfig, kpis, evalResult]);

  const tierBadgeColor = (tierNum: 1 | 2 | 3 | 4) =>
    tierNum === 4
      ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/30'
      : tierNum === 3
      ? 'text-cyan-300 border-cyan-500/50 bg-cyan-950/30'
      : tierNum === 2
      ? 'text-amber-300 border-amber-500/50 bg-amber-950/30'
      : 'text-red-300 border-red-500/50 bg-red-950/30';

  return (
    <main className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* TOP WEAKEST LINK EVALUATION BANNER */}
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${tierBadgeColor(evalResult.globalTierNum)}`}>
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-slate-400">
                  Certificación Global ANSI/TIA-942 (Regla del Eslabón Más Débil)
                </div>
                <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
                  <span className="font-mono text-2xl font-bold text-slate-100">
                    {evalResult.globalTier}
                  </span>
                  <span className="font-mono text-xs text-cyan-300">
                    Disponibilidad: {evalResult.availabilityPct}
                  </span>
                  <span className="font-mono text-xs text-amber-300">
                    Downtime máx.: {evalResult.annualDowntimeHours}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 max-w-xl bg-slate-950/80 border border-slate-800 rounded-lg p-3">
              <span className="font-semibold text-amber-300">Diagnóstico Eslabón Más Débil: </span>
              {evalResult.weakestLinkExplanation}
            </div>
          </div>

          {/* 4 Subsystem Scorecards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {evalResult.subsystems.map((sub) => {
              const isWeakest = sub.id === evalResult.weakestSubsystem.id;
              return (
                <div
                  key={sub.id}
                  className={`p-3.5 rounded-lg border ${
                    isWeakest
                      ? 'bg-slate-950 border-amber-500/60'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-200">{sub.name}</span>
                    <span
                      className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${tierBadgeColor(
                        sub.tierNum
                      )}`}
                    >
                      {sub.tier}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400 mt-1.5">{sub.summary}</div>
                  <p className="text-[11px] text-slate-300 mt-2 leading-snug">
                    {sub.bottleneckReason}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 4 SUBSYSTEMS CONFIGURATOR GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 1. Electrical Subsystem */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>1. Subsistema Eléctrico (Electrical)</span>
              </h2>
              <span className="font-mono text-xs font-semibold text-cyan-300">
                {evalResult.subsystems[0].tier}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs text-slate-300">Acometidas Compañía Eléctrica</div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onUpdateTiaConfig({ utilityFeeds: 'single' })}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer ${
                      tiaConfig.utilityFeeds === 'single'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    1 Simple
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateTiaConfig({ utilityFeeds: 'dual_substation' })}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer ${
                      tiaConfig.utilityFeeds === 'dual_substation'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    2 Subestaciones
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-300">Topología Distribución a Racks</div>
                <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  <button
                    type="button"
                    onClick={() => onUpdateTiaConfig({ distributionPath: 'single' })}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer ${
                      tiaConfig.distributionPath === 'single'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    Camino Único
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateTiaConfig({ distributionPath: 'dual_ab' })}
                    className={`py-1.5 text-[11px] font-medium rounded cursor-pointer ${
                      tiaConfig.distributionPath === 'dual_ab'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    Doble A+B
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="text-xs text-slate-300">Grupos Electrógenos Diésel</div>
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  {(['none', 'N', 'N+1', '2N'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => onUpdateTiaConfig({ dieselRedundancy: g })}
                      className={`py-1.5 font-mono text-[11px] font-medium rounded cursor-pointer ${
                        tiaConfig.dieselRedundancy === g
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 border border-transparent'
                      }`}
                    >
                      {g === 'none' ? 'Sin' : g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-300">Autonomía Combustible Diésel</div>
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  {(['12h', '24h', '72h'] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => onUpdateTiaConfig({ fuelAutonomyHours: h })}
                      className={`py-1.5 font-mono text-[11px] font-medium rounded cursor-pointer ${
                        tiaConfig.fuelAutonomyHours === h
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 border border-transparent'
                      }`}
                    >
                      {h}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80 flex flex-wrap justify-between gap-2">
              <span>
                SAI (Fase 2): {upsConfig.technology.toUpperCase()} / {upsConfig.redundancy}
              </span>
              <span>
                Plano 2D: {Math.round(kpis.dualPowerRackRatio * 100)}% racks A+B · {kpis.pduCount} PDU(s)
              </span>
            </div>
          </div>

          {/* 2. Mechanical / Cooling Subsystem */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Snowflake className="w-4 h-4 text-cyan-400" />
                <span>2. Subsistema Mecánico / Clima (Mechanical)</span>
              </h2>
              <span className="font-mono text-xs font-semibold text-cyan-300">
                {evalResult.subsystems[1].tier}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">
                Redundancia Unidades CRAC (Lectura del Plano 2D o Simulación)
              </div>
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                {(
                  [
                    { id: 'from_floor', label: 'Plano 2D' },
                    { id: 'N', label: 'N' },
                    { id: 'N+1', label: 'N+1' },
                    { id: '2(N+1)', label: '2(N+1)' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateTiaConfig({ mechanicalRedundancySource: opt.id })
                    }
                    className={`py-1.5 font-mono text-[11px] font-medium rounded cursor-pointer ${
                      tiaConfig.mechanicalRedundancySource === opt.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">
                Distribución Hidráulica / Agua Helada
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateTiaConfig({ chilledWaterLoop: 'single_loop' })}
                  className={`py-1.5 px-2 text-[11px] font-medium rounded cursor-pointer ${
                    tiaConfig.chilledWaterLoop === 'single_loop'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  Anillo Simple (Sin aislamiento)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateTiaConfig({ chilledWaterLoop: 'dual_loop_isolated' })
                  }
                  className={`py-1.5 px-2 text-[11px] font-medium rounded cursor-pointer ${
                    tiaConfig.chilledWaterLoop === 'dual_loop_isolated'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  Doble Anillo + Válvulas Secc.
                </button>
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80 flex flex-wrap justify-between gap-2">
              <span>CRACs en Plano: {kpis.cracCount} uds ({kpis.totalCoolingCapacityKw} kWt)</span>
              <span>
                Hotspots: {analysis.hotspotCount} · CAC: {cacEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          {/* 3. Telecom Subsystem */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Network className="w-4 h-4 text-emerald-400" />
                <span>3. Subsistema Telecomunicaciones (Telecom)</span>
              </h2>
              <span className="font-mono text-xs font-semibold text-cyan-300">
                {evalResult.subsystems[2].tier}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">
                Acometidas de Fibra Óptica / Entrance Rooms
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateTiaConfig({ fiberEntrances: 'single_entrance' })}
                  className={`py-1.5 px-2 text-[11px] font-medium rounded cursor-pointer ${
                    tiaConfig.fiberEntrances === 'single_entrance'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  1 Entrada Simple (SPOF)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateTiaConfig({ fiberEntrances: 'dual_20m' })}
                  className={`py-1.5 px-2 text-[11px] font-medium rounded cursor-pointer ${
                    tiaConfig.fiberEntrances === 'dual_20m'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  2 Entradas separadas ≥20 m
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">
                Core Routers / Switches de Distribución &amp; Bandejas
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                <button
                  type="button"
                  onClick={() => onUpdateTiaConfig({ coreRedundancy: 'single' })}
                  className={`py-1.5 px-2 text-[11px] font-medium rounded cursor-pointer ${
                    tiaConfig.coreRedundancy === 'single'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  Simple (Bandeja Única)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateTiaConfig({ coreRedundancy: 'redundant_diverse' })}
                  className={`py-1.5 px-2 text-[11px] font-medium rounded cursor-pointer ${
                    tiaConfig.coreRedundancy === 'redundant_diverse'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 border border-transparent'
                  }`}
                >
                  Redundante (Bandejas Opuestas)
                </button>
              </div>
            </div>
          </div>

          {/* 4. Architectural & Physical Subsystem */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-300" />
                <span>4. Subsistema Arquitectónico y Físico</span>
              </h2>
              <span className="font-mono text-xs font-semibold text-cyan-300">
                {evalResult.subsystems[3].tier}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">
                Sectorización y Resistencia al Fuego (Muros y Puertas)
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                {(['RF-60', 'RF-120'] as const).map((rf) => (
                  <button
                    key={rf}
                    type="button"
                    onClick={() => onUpdateTiaConfig({ fireRating: rf })}
                    className={`py-1.5 font-mono text-xs font-medium rounded cursor-pointer ${
                      tiaConfig.fireRating === rf
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    {rf} ({rf === 'RF-60' ? '60 min' : '120 min'})
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs text-slate-300">Control de Acceso Físico</div>
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                {(
                  [
                    { id: 'key', label: 'Llave Física' },
                    { id: 'rfid', label: 'Tarjeta RFID' },
                    { id: 'mantrap_biometric', label: 'Man-Trap Biom.' },
                  ] as const
                ).map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => onUpdateTiaConfig({ accessControl: acc.id })}
                    className={`py-1.5 px-1.5 text-[11px] font-medium rounded cursor-pointer ${
                      tiaConfig.accessControl === acc.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 border border-transparent'
                    }`}
                  >
                    {acc.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/80 flex justify-between">
              <span>Extinción NOVEC/FM-200 (Plano 2D): {kpis.safetyCount} ud(s)</span>
              <span>{kpis.safetyCount > 0 ? 'Protegido' : 'Sin gas inerte'}</span>
            </div>
          </div>
        </div>

        {/* INTERACTIVE SVG SINGLE-LINE CONCURRENT MAINTENANCE & SPOF SIMULATOR */}
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-cyan-400" />
                <span>Simulador Unifilar de Mantenimiento Concurrente &amp; Tolerancia a Fallos (SPOF)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Haz clic sobre cualquier nodo del diagrama (o usa los accesos rápidos) para simular un corte por mantenimiento o avería crítica.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => injectScenario('branch_a')}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-slate-950 border border-slate-800 text-amber-300 hover:border-amber-500/50 cursor-pointer"
              >
                Cortar Rama A
              </button>
              <button
                type="button"
                onClick={() => injectScenario('crac_1')}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-slate-950 border border-slate-800 text-cyan-300 hover:border-cyan-500/50 cursor-pointer"
              >
                Avería CRAC #1
              </button>
              <button
                type="button"
                onClick={() => injectScenario('pipe_a')}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-slate-950 border border-slate-800 text-cyan-300 hover:border-cyan-500/50 cursor-pointer"
              >
                Mant. Anillo Agua
              </button>
              <button
                type="button"
                onClick={() => injectScenario('fiber_1')}
                className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-slate-950 border border-slate-800 text-emerald-300 hover:border-emerald-500/50 cursor-pointer"
              >
                Corte Fibra 1
              </button>
              <button
                type="button"
                onClick={resetFaults}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restablecer</span>
              </button>
            </div>
          </div>

          {/* Simulation Verdict Banner */}
          {simOutcome.anyFaultActive ? (
            simOutcome.totalOutage ? (
              <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/60 flex items-start gap-3 text-xs text-red-200">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-semibold text-red-300">
                    CAÍDA CRÍTICA DEL CPD — Punto Único de Fallo (SPOF) Detectado
                  </div>
                  <ul className="space-y-0.5 list-disc list-inside">
                    {simOutcome.failureMessages.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-emerald-950/30 border border-emerald-500/50 flex items-center gap-3 text-xs text-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <span className="font-semibold text-emerald-300">
                    MANTENIMIENTO CONCURRENTE SUPERADO:
                  </span>{' '}
                  Las ramas redundantes absorben el 100% de la carga sin interrumpir los servidores IT.
                </div>
              </div>
            )
          ) : (
            <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-400">
              Sistema en operación nominal. Pulsa sobre cualquier equipo del unifilar inferior para inyectar un fallo o corte de mantenimiento.
            </div>
          )}

          {/* Interactive SVG Single-Line Diagram */}
          <div className="w-full overflow-x-auto rounded-lg bg-slate-950 border border-slate-800 p-2">
            <svg viewBox="0 0 920 340" className="w-full min-w-[760px] h-auto select-none">
              {/* Section Labels */}
              <text x="16" y="22" fill="#f59e0b" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                ENERGÍA (RAMA A &amp; RAMA B)
              </text>
              <text x="16" y="198" fill="#22d3ee" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                CLIMATIZACIÓN (CRAC &amp; ANILLO)
              </text>
              <text x="16" y="276" fill="#10b981" fontSize="11" fontWeight="600" fontFamily="Plus Jakarta Sans, sans-serif">
                TELECOMUNICACIONES (FIBRA &amp; CORE)
              </text>

              {/* ELECTRICAL LINES */}
              {/* Branch A flow */}
              <line
                x1="150"
                y1="56"
                x2="730"
                y2="56"
                stroke={simOutcome.powerPathAAlive ? '#f59e0b' : '#ef4444'}
                strokeWidth="2.5"
                strokeDasharray={simOutcome.powerPathAAlive ? undefined : '6 4'}
              />
              {/* Branch A drop to Racks */}
              <path
                d="M 690 56 L 730 56 L 730 140 L 765 140"
                fill="none"
                stroke={simOutcome.powerPathAAlive ? '#f59e0b' : '#ef4444'}
                strokeWidth="2.5"
                strokeDasharray={simOutcome.powerPathAAlive ? undefined : '6 4'}
              />

              {/* Branch B flow */}
              <line
                x1="150"
                y1="122"
                x2="730"
                y2="122"
                stroke={
                  !simOutcome.hasPathB
                    ? '#334155'
                    : simOutcome.powerPathBAlive
                    ? '#10b981'
                    : '#ef4444'
                }
                strokeWidth="2.5"
                strokeDasharray={!simOutcome.hasPathB ? '4 4' : undefined}
              />
              <path
                d="M 690 122 L 730 122 L 730 160 L 765 160"
                fill="none"
                stroke={
                  !simOutcome.hasPathB
                    ? '#334155'
                    : simOutcome.powerPathBAlive
                    ? '#10b981'
                    : '#ef4444'
                }
                strokeWidth="2.5"
                strokeDasharray={!simOutcome.hasPathB ? '4 4' : undefined}
              />

              {/* COOLING LINES */}
              <path
                d="M 210 225 L 730 225 L 730 185 L 765 185"
                fill="none"
                stroke={simOutcome.serversCooled ? '#22d3ee' : '#ef4444'}
                strokeWidth="2.5"
                strokeDasharray={simOutcome.serversCooled ? undefined : '6 4'}
              />

              {/* TELECOM LINES */}
              <path
                d="M 210 305 L 730 305 L 730 210 L 765 210"
                fill="none"
                stroke={simOutcome.serversConnected ? '#10b981' : '#ef4444'}
                strokeWidth="2.5"
                strokeDasharray={simOutcome.serversConnected ? undefined : '6 4'}
              />

              {/* CLICKABLE NODES: ELECTRICAL BRANCH A */}
              {/* Utility A */}
              <g
                onClick={() => toggleNodeFault('util_a')}
                className="cursor-pointer"
              >
                <rect
                  x="20"
                  y="36"
                  width="135"
                  height="40"
                  rx="6"
                  fill={faultedNodes.util_a ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.util_a ? '#ef4444' : '#f59e0b'}
                  strokeWidth="1.5"
                />
                <text x="87" y="53" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  Acometida A
                </text>
                <text x="87" y="68" textAnchor="middle" fill={faultedNodes.util_a ? '#fca5a5' : '#fbbf24'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.util_a ? 'CORTADA (CLIC)' : '20kV ACTIVA'}
                </text>
              </g>

              {/* Genset Indicator (auto responds to util_a) */}
              <g>
                <rect
                  x="185"
                  y="36"
                  width="135"
                  height="40"
                  rx="6"
                  fill="#0f172a"
                  stroke={
                    !simOutcome.hasDieselBackup
                      ? '#475569'
                      : faultedNodes.util_a
                      ? '#10b981'
                      : '#64748b'
                  }
                  strokeWidth="1.5"
                />
                <text x="252" y="53" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  Genset ({tiaConfig.dieselRedundancy === 'none' ? 'Sin' : tiaConfig.dieselRedundancy})
                </text>
                <text x="252" y="68" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {!simOutcome.hasDieselBackup
                    ? 'NO INSTALADO'
                    : faultedNodes.util_a
                    ? 'ARRANCADO ATS'
                    : `STANDBY (${tiaConfig.fuelAutonomyHours})`}
                </text>
              </g>

              {/* SAI / UPS A */}
              <g onClick={() => toggleNodeFault('ups_a')} className="cursor-pointer">
                <rect
                  x="355"
                  y="36"
                  width="145"
                  height="40"
                  rx="6"
                  fill={faultedNodes.ups_a ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.ups_a ? '#ef4444' : '#f59e0b'}
                  strokeWidth="1.5"
                />
                <text x="427" y="53" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  SAI / UPS Rama A
                </text>
                <text x="427" y="68" textAnchor="middle" fill={faultedNodes.ups_a ? '#fca5a5' : '#fbbf24'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.ups_a ? 'EN MANTENIMIENTO' : `${upsConfig.technology.toUpperCase()} ACTIVO`}
                </text>
              </g>

              {/* PDU A */}
              <g onClick={() => toggleNodeFault('pdu_a')} className="cursor-pointer">
                <rect
                  x="535"
                  y="36"
                  width="145"
                  height="40"
                  rx="6"
                  fill={faultedNodes.pdu_a ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.pdu_a ? '#ef4444' : '#f59e0b'}
                  strokeWidth="1.5"
                />
                <text x="607" y="53" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  PDU Rama A
                </text>
                <text x="607" y="68" textAnchor="middle" fill={faultedNodes.pdu_a ? '#fca5a5' : '#fbbf24'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.pdu_a ? 'INTERRUPTOR OFF' : 'VÍA A ONLINE'}
                </text>
              </g>

              {/* ELECTRICAL BRANCH B (Redundant) */}
              <g opacity={simOutcome.hasPathB ? 1 : 0.45}>
                <rect x="20" y="102" width="135" height="40" rx="6" fill="#0f172a" stroke={simOutcome.hasSecondUtility ? '#10b981' : '#475569'} strokeWidth="1.5" />
                <text x="87" y="119" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  {simOutcome.hasSecondUtility ? 'Subestación B' : 'Sin Subestación B'}
                </text>
                <text x="87" y="134" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {simOutcome.hasSecondUtility ? 'DIVERSA ACTIVA' : 'ACOMETIDA ÚNICA'}
                </text>

                <rect x="355" y="102" width="145" height="40" rx="6" fill="#0f172a" stroke={simOutcome.hasUpsB ? '#10b981' : '#475569'} strokeWidth="1.5" />
                <text x="427" y="119" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  SAI Redundante B
                </text>
                <text x="427" y="134" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {simOutcome.hasUpsB ? upsConfig.redundancy : 'NO DISPONIBLE'}
                </text>

                <rect x="535" y="102" width="145" height="40" rx="6" fill="#0f172a" stroke={simOutcome.hasPathB ? '#10b981' : '#475569'} strokeWidth="1.5" />
                <text x="607" y="119" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  PDU Rama B
                </text>
                <text x="607" y="134" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {simOutcome.hasPathB ? 'VÍA B ACTIVA' : 'CAMINO ÚNICO'}
                </text>
              </g>

              {/* COOLING NODES */}
              <g onClick={() => toggleNodeFault('crac_1')} className="cursor-pointer">
                <rect
                  x="20"
                  y="205"
                  width="195"
                  height="40"
                  rx="6"
                  fill={faultedNodes.crac_1 ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.crac_1 ? '#ef4444' : '#22d3ee'}
                  strokeWidth="1.5"
                />
                <text x="117" y="222" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  CRAC #1 ({evalResult.effectiveMechanicalRedundancy})
                </text>
                <text x="117" y="237" textAnchor="middle" fill={faultedNodes.crac_1 ? '#fca5a5' : '#67e8f9'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.crac_1 ? 'AVERÍA / PARADA' : '25 kWt OPERATIVA'}
                </text>
              </g>

              <g onClick={() => toggleNodeFault('pipe_a')} className="cursor-pointer">
                <rect
                  x="265"
                  y="205"
                  width="265"
                  height="40"
                  rx="6"
                  fill={faultedNodes.pipe_a ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.pipe_a ? '#ef4444' : '#22d3ee'}
                  strokeWidth="1.5"
                />
                <text x="397" y="222" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  {simOutcome.pipeDual ? 'Doble Anillo Hidráulico (Secc.)' : 'Anillo Hidráulico Simple'}
                </text>
                <text x="397" y="237" textAnchor="middle" fill={faultedNodes.pipe_a ? '#fca5a5' : '#67e8f9'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.pipe_a
                    ? simOutcome.pipeDual
                      ? 'ANILLO A SECCIONADO · B ACTIVO'
                      : 'ANILLO ÚNICO CORTADO (SPOF)'
                    : 'FLUJO NOMINAL'}
                </text>
              </g>

              {/* TELECOM NODES */}
              <g onClick={() => toggleNodeFault('fiber_1')} className="cursor-pointer">
                <rect
                  x="20"
                  y="285"
                  width="195"
                  height="40"
                  rx="6"
                  fill={faultedNodes.fiber_1 ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.fiber_1 ? '#ef4444' : '#10b981'}
                  strokeWidth="1.5"
                />
                <text x="117" y="302" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  Acometida Fibra Carrier 1
                </text>
                <text x="117" y="317" textAnchor="middle" fill={faultedNodes.fiber_1 ? '#fca5a5' : '#34d399'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.fiber_1
                    ? simOutcome.fiberDual
                      ? 'CORTADA · BACKUP ≥20m OK'
                      : 'FIBRA ÚNICA CORTADA (SPOF)'
                    : simOutcome.fiberDual
                    ? '2 ENTRADAS ≥20m'
                    : 'ENTRADA ÚNICA'}
                </text>
              </g>

              <g onClick={() => toggleNodeFault('core_a')} className="cursor-pointer">
                <rect
                  x="265"
                  y="285"
                  width="265"
                  height="40"
                  rx="6"
                  fill={faultedNodes.core_a ? '#450a0a' : '#0f172a'}
                  stroke={faultedNodes.core_a ? '#ef4444' : '#10b981'}
                  strokeWidth="1.5"
                />
                <text x="397" y="302" textAnchor="middle" fill="#f8fafc" fontSize="11" fontWeight="600">
                  Core Switching ({simOutcome.coreDual ? 'A + B Diverso' : 'Core Único'})
                </text>
                <text x="397" y="317" textAnchor="middle" fill={faultedNodes.core_a ? '#fca5a5' : '#34d399'} fontSize="9.5" fontFamily="JetBrains Mono, monospace">
                  {faultedNodes.core_a
                    ? simOutcome.coreDual
                      ? 'CORE A OFF · CORE B ACTIVO'
                      : 'CORE CAÍDO (SPOF)'
                    : 'ENLACE 100GbE ACTIVO'}
                </text>
              </g>

              {/* TARGET: RACKS IT LOAD */}
              <g>
                <rect
                  x="765"
                  y="108"
                  width="135"
                  height="132"
                  rx="8"
                  fill={simOutcome.totalOutage ? '#450a0a' : '#064e3b'}
                  stroke={simOutcome.totalOutage ? '#ef4444' : '#10b981'}
                  strokeWidth="2"
                />
                <text x="832" y="136" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="700">
                  RACKS IT
                </text>
                <text x="832" y="156" textAnchor="middle" fill="#cbd5e1" fontSize="10.5" fontFamily="JetBrains Mono, monospace">
                  {kpis.totalItKw.toFixed(1)} kW ({kpis.rackCount} uds)
                </text>
                <text
                  x="832"
                  y="182"
                  textAnchor="middle"
                  fill={simOutcome.serversPowered ? '#34d399' : '#fca5a5'}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  PWR: {simOutcome.serversPowered ? 'ONLINE' : 'CAÍDA'}
                </text>
                <text
                  x="832"
                  y="200"
                  textAnchor="middle"
                  fill={simOutcome.serversCooled ? '#67e8f9' : '#fca5a5'}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  CLIMA: {simOutcome.serversCooled ? 'OK' : 'HOTSPOT'}
                </text>
                <text
                  x="832"
                  y="218"
                  textAnchor="middle"
                  fill={simOutcome.serversConnected ? '#34d399' : '#fca5a5'}
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  RED: {simOutcome.serversConnected ? 'ONLINE' : 'AISLADO'}
                </text>
              </g>
            </svg>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Para alcanzar Mantenimiento Concurrente real (Tier III), cada subsistema debe tolerar el corte de cualquier componente sin caída de los Racks IT.
              </span>
            </span>
            <span className="font-mono inline-flex items-center gap-1">
              {simOutcome.totalOutage ? (
                <XCircle className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>{simOutcome.totalOutage ? 'SPOF ACTIVO' : 'CONTINUIDAD OK'}</span>
            </span>
          </div>
        </div>
      </div>
    </main>
  );
};
