import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  Cpu,
  Flame,
  Gauge,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  Weight,
  Zap,
} from 'lucide-react';
import { calculateUpsEngineering } from '../engine/dcimEngine';
import {
  BatteryChemistry,
  DcBusVoltage,
  TelemetryKPIs,
  UpsConfig,
  UpsRedundancy,
  UpsTechnology,
} from '../types';

interface UpsModuleProps {
  kpis: TelemetryKPIs;
  upsConfig: UpsConfig;
  onUpdateUpsConfig: (patch: Partial<UpsConfig>) => void;
}

type BlackoutPhase = 'idle' | 'battery' | 'ats_transfer' | 'genset_online' | 'depleted';

interface SimEvent {
  timeLabel: string;
  message: string;
  tone: 'info' | 'warning' | 'success' | 'critical';
}

function getDischargeCurvePoint(
  progress01: number, // 0 to 1 across target runtime
  dcBusVoltage: DcBusVoltage,
  chemistry: BatteryChemistry
): { socPct: number; voltageV: number } {
  const blocks = dcBusVoltage / 12;
  const startVPerBlock = chemistry === 'vrla' ? 12.8 : 13.3;
  const endVPerBlock = chemistry === 'vrla' ? 10.5 : 11.2;

  const p = Math.min(1, Math.max(0, progress01));
  const socPct = Math.max(0, 100 * (1 - p));

  // Realistic electrochemical discharge profile:
  // VRLA has initial coup de fouet + gradual slope + steep knee at >80% DoD
  // LiFePO4 has a very flat plateau until ~88% DoD then steep knee
  let vPerBlock: number;
  if (chemistry === 'vrla') {
    const sag = 0.35 * Math.min(1, p * 12);
    const linearDrop = (startVPerBlock - 0.35 - 11.4) * p;
    const knee = p > 0.78 ? Math.pow((p - 0.78) / 0.22, 2.1) * (11.4 - endVPerBlock) : 0;
    vPerBlock = Math.max(endVPerBlock, startVPerBlock - sag - linearDrop - knee);
  } else {
    const initialDrop = 0.25 * Math.min(1, p * 16);
    const plateauDrop = 0.55 * p;
    const knee = p > 0.86 ? Math.pow((p - 0.86) / 0.14, 2.4) * (12.5 - endVPerBlock) : 0;
    vPerBlock = Math.max(endVPerBlock, startVPerBlock - initialDrop - plateauDrop - knee);
  }

  return {
    socPct,
    voltageV: vPerBlock * blocks,
  };
}

export const UpsModule: React.FC<UpsModuleProps> = ({
  kpis,
  upsConfig,
  onUpdateUpsConfig,
}) => {
  const calc = useMemo(
    () => calculateUpsEngineering(kpis.totalItKw, kpis.totalItKva, upsConfig),
    [kpis.totalItKw, kpis.totalItKva, upsConfig]
  );

  // Blackout Simulation State
  const [simRunning, setSimRunning] = useState(false);
  const [simPhase, setSimPhase] = useState<BlackoutPhase>('idle');
  const [simElapsedMin, setSimElapsedMin] = useState(0); // Simulated minutes on curve
  const [simSecondsReal, setSimSecondsReal] = useState(0); // Simulated initial seconds (0-15s ATS)
  const [simEvents, setSimEvents] = useState<SimEvent[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopSimulation = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setSimRunning(false);
  };

  const resetSimulation = () => {
    stopSimulation();
    setSimPhase('idle');
    setSimElapsedMin(0);
    setSimSecondsReal(0);
    setSimEvents([]);
  };

  // Stop simulation if user modifies key runtime/genset parameters while running
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const startBlackoutSimulation = () => {
    if (calc.totalCriticalKw <= 0) return;
    stopSimulation();

    const initialEvents: SimEvent[] = [
      {
        timeLabel: '00:00.0',
        message: 'Fallo total de acometida eléctrica principal (Red 0 V AC).',
        tone: 'critical',
      },
    ];

    if (upsConfig.technology === 'vfi') {
      initialEvents.push({
        timeLabel: '00:00.0',
        message: 'SAI On-Line VFI mantiene carga IT sin interrupción (0 ms transferencia).',
        tone: 'success',
      });
    } else {
      initialEvents.push({
        timeLabel: '00:00.1',
        message: `ADVERTENCIA: Conmutación ${calc.transferTimeMs} — riesgo de corte en fuentes PFC activas.`,
        tone: 'warning',
      });
    }

    if (upsConfig.hasGeneratorAts) {
      initialEvents.push({
        timeLabel: '00:02.0',
        message: 'Señal de arranque enviada al Grupo Electrógeno Diésel (objetivo ATS: 15 s).',
        tone: 'info',
      });
    } else {
      initialEvents.push({
        timeLabel: '00:01.0',
        message: 'Sin Grupo Electrógeno: descarga continua hasta apagado ordenado SNMP/NUT.',
        tone: 'warning',
      });
    }

    setSimEvents(initialEvents);
    setSimPhase('battery');
    setSimElapsedMin(0);
    setSimSecondsReal(0);
    setSimRunning(true);

    const startTs = performance.now();
    const targetRuntime = Math.max(5, calc.estimatedActualRuntimeMin || upsConfig.targetRuntimeMin);

    let atsLogged = false;
    let snmpLogged = false;
    let depletedLogged = false;

    const step = (now: number) => {
      const realElapsedSec = (now - startTs) / 1000;

      if (upsConfig.hasGeneratorAts) {
        // Accelerated 15s ATS sequence over ~4.5 real animation seconds, then recovery over 2.5s
        const simSec = realElapsedSec * 3.5; // 15 sim seconds = 4.28s animation
        setSimSecondsReal(Math.min(22, simSec));

        if (simSec < 15) {
          setSimPhase('battery');
          setSimElapsedMin(simSec / 60);
          rafRef.current = requestAnimationFrame(step);
        } else if (simSec < 17.5) {
          setSimPhase('ats_transfer');
          if (!atsLogged) {
            atsLogged = true;
            setSimEvents((prev) => [
              ...prev,
              {
                timeLabel: '00:15.0',
                message: 'Grupo Electrógeno estable (400V / 50Hz). Conmutación ATS completada.',
                tone: 'success',
              },
            ]);
          }
          setSimElapsedMin(Math.max(0, (15 / 60) * (1 - (simSec - 15) / 2.5)));
          rafRef.current = requestAnimationFrame(step);
        } else {
          setSimPhase('genset_online');
          setSimElapsedMin(0);
          setSimEvents((prev) => [
            ...prev,
            {
              timeLabel: '00:18.0',
              message: 'SAI en modo On-Line alimentado por Genset. Rectificador recargando baterías.',
              tone: 'success',
            },
          ]);
          setSimRunning(false);
          rafRef.current = null;
        }
      } else {
        // Full accelerated discharge curve over ~7.5 real seconds
        const totalAnimSec = 7.5;
        const progress = Math.min(1, realElapsedSec / totalAnimSec);
        const simMin = progress * targetRuntime;
        setSimElapsedMin(simMin);
        setSimSecondsReal(simMin * 60);

        if (progress >= 0.8 && !snmpLogged) {
          snmpLogged = true;
          setSimEvents((prev) => [
            ...prev,
            {
              timeLabel: `${String(Math.floor(simMin)).padStart(2, '0')}:00`,
              message: 'SoC <= 20%: Daemon NUT/SNMP inicia apagado ordenado de hipervisores y cabinas.',
              tone: 'warning',
            },
          ]);
        }

        if (progress < 1) {
          setSimPhase('battery');
          rafRef.current = requestAnimationFrame(step);
        } else {
          if (!depletedLogged) {
            depletedLogged = true;
            setSimEvents((prev) => [
              ...prev,
              {
                timeLabel: `${String(Math.round(targetRuntime)).padStart(2, '0')}:00`,
                message: 'Corte por Baja Tensión (LVD) alcanzado para proteger la vida útil del banco.',
                tone: 'critical',
              },
            ]);
          }
          setSimPhase('depleted');
          setSimRunning(false);
          rafRef.current = null;
        }
      }
    };

    rafRef.current = requestAnimationFrame(step);
  };

  // Draw Native HTML5 Canvas Discharge Curve
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(480, rect.width || 640);
    const height = 270;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    const padL = 52;
    const padR = 50;
    const padT = 24;
    const padB = 36;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const maxTimeMin = Math.max(
      upsConfig.targetRuntimeMin,
      Math.ceil(calc.estimatedActualRuntimeMin || upsConfig.targetRuntimeMin)
    );

    const blocks = upsConfig.dcBusVoltage / 12;
    const vMax = Math.ceil(blocks * (upsConfig.chemistry === 'vrla' ? 13.5 : 14.0));
    const vMin = Math.floor(blocks * 10.0);

    // Gridlines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padT + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();

      // Left axis: Voltage
      const vLabel = Math.round(vMax - ((vMax - vMin) * i) / 4);
      ctx.fillStyle = '#f59e0b';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${vLabel}V`, padL - 8, y + 4);

      // Right axis: SoC %
      const socLabel = 100 - i * 25;
      ctx.fillStyle = '#22d3ee';
      ctx.textAlign = 'left';
      ctx.fillText(`${socLabel}%`, padL + plotW + 8, y + 4);
    }

    // X-Axis Ticks (Minutes)
    const xTicks = 5;
    for (let i = 0; i <= xTicks; i++) {
      const x = padL + (plotW * i) / xTicks;
      const tVal = Math.round((maxTimeMin * i) / xTicks);
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, padT + plotH);
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${tVal}m`, x, padT + plotH + 18);
    }

    // LVD Cutoff Dashed Line (10.5V/block VRLA, 11.2V/block LiFePO4)
    const lvdV = blocks * (upsConfig.chemistry === 'vrla' ? 10.5 : 11.2);
    const lvdY = padT + plotH * (1 - (lvdV - vMin) / (vMax - vMin));
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(padL, lvdY);
    ctx.lineTo(padL + plotW, lvdY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#f87171';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`LVD ${Math.round(lvdV)}V`, padL + 6, lvdY - 5);

    // Target Runtime Vertical Marker
    const targetX = padL + plotW * (upsConfig.targetRuntimeMin / maxTimeMin);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.beginPath();
    ctx.moveTo(targetX, padT);
    ctx.lineTo(targetX, padT + plotH);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'right';
    ctx.fillText(`Obj ${upsConfig.targetRuntimeMin}m`, targetX - 4, padT + 12);

    // Plot SoC Curve (Cyan)
    const actualRuntime = Math.max(1, calc.estimatedActualRuntimeMin || upsConfig.targetRuntimeMin);
    const steps = 80;

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const tMin = (actualRuntime * i) / steps;
      const x = padL + plotW * Math.min(1, tMin / maxTimeMin);
      const pt = getDischargeCurvePoint(i / steps, upsConfig.dcBusVoltage, upsConfig.chemistry);
      const y = padT + plotH * (1 - pt.socPct / 100);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Plot DC Voltage Curve (Amber)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const tMin = (actualRuntime * i) / steps;
      const x = padL + plotW * Math.min(1, tMin / maxTimeMin);
      const pt = getDischargeCurvePoint(i / steps, upsConfig.dcBusVoltage, upsConfig.chemistry);
      const y = padT + plotH * (1 - (pt.voltageV - vMin) / (vMax - vMin));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Live Playhead during/after Blackout Simulation
    if (simPhase !== 'idle') {
      const simProgress = Math.min(1, simElapsedMin / actualRuntime);
      const playX = padL + plotW * Math.min(1, simElapsedMin / maxTimeMin);
      const pt = getDischargeCurvePoint(simProgress, upsConfig.dcBusVoltage, upsConfig.chemistry);
      const playYV = padT + plotH * (1 - (pt.voltageV - vMin) / (vMax - vMin));
      const playYSoc = padT + plotH * (1 - pt.socPct / 100);

      ctx.strokeStyle = simPhase === 'genset_online' ? '#10b981' : '#f8fafc';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(playX, padT);
      ctx.lineTo(playX, padT + plotH);
      ctx.stroke();

      // Voltage dot
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(playX, playYV, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // SoC dot
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(playX, playYSoc, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [upsConfig, calc.estimatedActualRuntimeMin, simPhase, simElapsedMin]);

  const livePoint = useMemo(() => {
    const actualRuntime = Math.max(1, calc.estimatedActualRuntimeMin || upsConfig.targetRuntimeMin);
    const p = simPhase === 'idle' ? 0 : Math.min(1, simElapsedMin / actualRuntime);
    return getDischargeCurvePoint(p, upsConfig.dcBusVoltage, upsConfig.chemistry);
  }, [calc.estimatedActualRuntimeMin, upsConfig.targetRuntimeMin, upsConfig.dcBusVoltage, upsConfig.chemistry, simPhase, simElapsedMin]);

  const redundancyLabel =
    upsConfig.redundancy === 'N'
      ? `${calc.moduleCountTotal} × ${calc.moduleRatingKva} kVA (Módulo Único N)`
      : upsConfig.redundancy === 'N+1'
      ? `${calc.moduleCountActive}+1 (${calc.moduleCountTotal} × ${calc.moduleRatingKva} kVA)`
      : upsConfig.redundancy === '2N'
      ? `2 Ramas × ${calc.moduleRatingKva} kVA (2N)`
      : `2 Ramas × (${calc.moduleCountActive}+1 × ${calc.moduleRatingKva} kVA)`;

  return (
    <main className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Module Header + Summary KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">Carga Crítica Total (Plano + Manual)</div>
            <div className="font-mono text-lg font-bold text-slate-100 mt-1">
              {calc.totalCriticalKw.toFixed(1)} kW
              <span className="text-slate-500 mx-1.5">/</span>
              <span className="text-cyan-400">{calc.totalCriticalKva.toFixed(1)} kVA</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1">
              Plano 2D: {calc.floorItKw.toFixed(1)} kW · Manual: +{calc.manualExtraKw.toFixed(1)} kW
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">
              SAI Dimensionado (+{upsConfig.growthMarginPct}% Margen)
            </div>
            <div className="font-mono text-lg font-bold text-cyan-300 mt-1">
              {calc.recommendedUpsKva.toFixed(1)} kVA
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1 truncate" title={redundancyLabel}>
              {redundancyLabel}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">Pérdidas Inversor (η {upsConfig.inverterEfficiencyPct}%)</div>
            <div className="font-mono text-lg font-bold text-amber-300 mt-1">
              {calc.upsElectricalLossKw.toFixed(2)} kW
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1">
              +{Math.round(calc.upsThermalLossBtuH).toLocaleString('es-ES')} BTU/h al PUE global
            </div>
          </div>

          <div
            className={`p-3.5 rounded-xl border ${
              calc.isFloorOverloaded
                ? 'bg-red-950/25 border-red-500/50'
                : 'bg-slate-900/70 border-slate-800'
            }`}
          >
            <div className="text-xs text-slate-400">Banco Baterías &amp; Sobrecarga Suelo</div>
            <div className="font-mono text-lg font-bold text-slate-100 mt-1">
              {Math.round(calc.totalBatteryWeightKg).toLocaleString('es-ES')} kg
              <span className="text-slate-500 mx-1.5">·</span>
              <span className={calc.isFloorOverloaded ? 'text-red-400' : 'text-emerald-400'}>
                {Math.round(calc.floorLoadKgM2)} kg/m²
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1">
              {calc.totalBlocks} bloques 12V ({calc.estimatedCabinets} armario/s · límite {upsConfig.floorMaxLoadKgM2} kg/m²)
            </div>
          </div>
        </div>

        {/* Technical Alert when Non-VFI Topology is chosen */}
        {!calc.isTopologySafeForCpds && (
          <div className="p-4 rounded-xl bg-red-950/35 border border-red-500/60 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-red-200">
                Alerta Crítica de Ingeniería Eléctrica: Tecnología {upsConfig.technology === 'vfd' ? 'Off-Line (VFD)' : 'Line-Interactive (VI)'} incompatible con CPD
              </div>
              <p className="text-xs text-red-200/90 leading-relaxed">
                Un SAI {upsConfig.technology === 'vfd' ? 'Off-Line (4–10 ms)' : 'Line-Interactive (2–6 ms)'} introduce un tiempo de conmutación del relé de bypass inaceptable para fuentes conmutadas redundantes de servidores con PFC activo (Active Power Factor Correction). Durante el microcorte, los condensadores de entrada se descargan provocando picos de corriente de irrupción (inrush), desincronización de fase y reinicios abruptos en el clúster. Selecciona <strong>On-Line Doble Conversión (VFI - IEC 62040-3)</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Structural Raised Floor Overload Alert */}
        {calc.isFloorOverloaded && (
          <div className="p-4 rounded-xl bg-amber-950/35 border border-amber-500/50 flex items-start gap-3">
            <Weight className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-semibold text-amber-200">
                Sobrecarga Estructural en Suelo Técnico ({Math.round(calc.floorLoadKgM2)} kg/m² &gt; {upsConfig.floorMaxLoadKgM2} kg/m²)
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                El peso concentrado de los armarios de baterías ({Math.round(calc.totalBatteryWeightKg)} kg en {calc.footprintM2.toFixed(2)} m²) supera la resistencia admisible de los pedestales del suelo técnico elevado. Soluciones recomendadas: migrar química a <strong>LiFePO4</strong> (reduce el peso ~60%), instalar bancadas de reparto de carga en forjado o mover baterías a sala técnica anexa sobre losa de hormigón.
              </p>
            </div>
          </div>
        )}

        {/* Main 2-Column Engineering Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN (5 cols): Interactive UPS & Battery Engineering Controls */}
          <div className="lg:col-span-5 space-y-4">
            {/* Section A: Load & UPS Topology */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span>Parámetros de Ingeniería del SAI</span>
                </h2>
                <span className="font-mono text-[11px] text-slate-400">IEC 62040-3</span>
              </div>

              {/* Manual Extra Load Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ups-manual-kw" className="font-medium text-slate-200">
                    Carga Manual Adicional (Pruebas)
                  </label>
                  <span className="font-mono font-semibold text-cyan-300">
                    +{upsConfig.manualExtraKw.toFixed(0)} kW
                  </span>
                </div>
                <input
                  id="ups-manual-kw"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={upsConfig.manualExtraKw}
                  onChange={(e) =>
                    onUpdateUpsConfig({ manualExtraKw: parseFloat(e.target.value) })
                  }
                  className="w-full dcim-slider"
                />
                <div className="flex justify-between font-mono text-[10px] text-slate-500">
                  <span>0 kW (Solo Plano 2D)</span>
                  <span>50 kW</span>
                  <span>100 kW</span>
                </div>
              </div>

              {/* UPS Technology Selector */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-200">Tecnología del SAI</div>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  {(
                    [
                      { id: 'vfd', label: 'Off-Line (VFD)' },
                      { id: 'vi', label: 'Line-Int (VI)' },
                      { id: 'vfi', label: 'On-Line (VFI)' },
                    ] as Array<{ id: UpsTechnology; label: string }>
                  ).map((tech) => (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => onUpdateUpsConfig({ technology: tech.id })}
                      className={`px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        upsConfig.technology === tech.id
                          ? tech.id === 'vfi'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-500/20 text-red-300 border border-red-500/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {tech.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Growth Margin Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ups-margin" className="font-medium text-slate-200">
                    Margen de Seguridad &amp; Crecimiento
                  </label>
                  <span
                    className={`font-mono font-semibold ${
                      upsConfig.growthMarginPct >= 20 && upsConfig.growthMarginPct <= 30
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {upsConfig.growthMarginPct}%
                  </span>
                </div>
                <input
                  id="ups-margin"
                  type="range"
                  min={0}
                  max={50}
                  step={5}
                  value={upsConfig.growthMarginPct}
                  onChange={(e) =>
                    onUpdateUpsConfig({ growthMarginPct: parseInt(e.target.value, 10) })
                  }
                  className="w-full dcim-slider"
                />
                <div className="flex justify-between font-mono text-[10px] text-slate-500">
                  <span>0%</span>
                  <span className="text-emerald-400/80">20–25% Rec.</span>
                  <span>50%</span>
                </div>
              </div>

              {/* Inverter Efficiency Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ups-eff" className="font-medium text-slate-200">
                    Eficiencia del Inversor (η)
                  </label>
                  <span className="font-mono font-semibold text-cyan-300">
                    {upsConfig.inverterEfficiencyPct.toFixed(1)}%
                  </span>
                </div>
                <input
                  id="ups-eff"
                  type="range"
                  min={90}
                  max={98}
                  step={0.5}
                  value={upsConfig.inverterEfficiencyPct}
                  onChange={(e) =>
                    onUpdateUpsConfig({
                      inverterEfficiencyPct: parseFloat(e.target.value),
                    })
                  }
                  className="w-full dcim-slider"
                />
                <div className="flex justify-between font-mono text-[10px] text-slate-500">
                  <span>90.0%</span>
                  <span>94.0%</span>
                  <span>98.0%</span>
                </div>
              </div>

              {/* Redundancy Architecture */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-200">
                  Configuración de Redundancia
                </div>
                <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                  {(['N', 'N+1', '2N', '2(N+1)'] as UpsRedundancy[]).map((red) => (
                    <button
                      key={red}
                      type="button"
                      onClick={() => onUpdateUpsConfig({ redundancy: red })}
                      className={`px-2 py-1.5 font-mono text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        upsConfig.redundancy === red
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {red}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Section B: Battery Bank & Runtime */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <BatteryCharging className="w-4 h-4 text-emerald-400" />
                  <span>Banco de Baterías &amp; Autonomía</span>
                </h2>
                <span className="font-mono text-[11px] text-slate-400">IEEE 485</span>
              </div>

              {/* Chemistry */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateUpsConfig({ chemistry: 'vrla' })}
                  className={`p-2.5 text-left rounded-lg border transition-colors cursor-pointer ${
                    upsConfig.chemistry === 'vrla'
                      ? 'bg-amber-950/30 border-amber-500/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">VRLA AGM</div>
                  <div className="font-mono text-[10px] opacity-80 mt-0.5">
                    Plomo-Ácido · k=1.22
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateUpsConfig({ chemistry: 'lifepo4' })}
                  className={`p-2.5 text-left rounded-lg border transition-colors cursor-pointer ${
                    upsConfig.chemistry === 'lifepo4'
                      ? 'bg-emerald-950/30 border-emerald-500/60 text-emerald-200'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold">LiFePO4</div>
                  <div className="font-mono text-[10px] opacity-80 mt-0.5">
                    Litio-Ferro · k=1.03
                  </div>
                </button>
              </div>

              {/* Runtime Target Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <label htmlFor="ups-runtime" className="font-medium text-slate-200">
                    Autonomía Objetivo (Runtime)
                  </label>
                  <span className="font-mono font-semibold text-cyan-300">
                    {upsConfig.targetRuntimeMin} min
                  </span>
                </div>
                <input
                  id="ups-runtime"
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={upsConfig.targetRuntimeMin}
                  onChange={(e) =>
                    onUpdateUpsConfig({ targetRuntimeMin: parseInt(e.target.value, 10) })
                  }
                  className="w-full dcim-slider"
                />
                <div className="flex justify-between font-mono text-[10px] text-slate-500">
                  <span>5 min</span>
                  <span>15 min (Genset)</span>
                  <span>120 min</span>
                </div>
              </div>

              {/* DC Bus Voltage & Block Capacity */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-200">Tensión Bus DC</div>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                    {([192, 240, 384, 480] as DcBusVoltage[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onUpdateUpsConfig({ dcBusVoltage: v })}
                        className={`py-1 font-mono text-[11px] font-medium rounded transition-colors cursor-pointer ${
                          upsConfig.dcBusVoltage === v
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {v}V
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-slate-200">Bloque 12V (Ah)</div>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                    {[65, 100, 150, 200].map((ah) => (
                      <button
                        key={ah}
                        type="button"
                        onClick={() => onUpdateUpsConfig({ blockCapacityAh: ah })}
                        className={`py-1 font-mono text-[11px] font-medium rounded transition-colors cursor-pointer ${
                          upsConfig.blockCapacityAh === ah
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {ah}Ah
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Battery Room Temperature & Raised Floor Rating */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <label htmlFor="ups-temp" className="text-slate-300">
                      Temp. Sala Bat.
                    </label>
                    <span
                      className={`font-mono font-semibold ${
                        upsConfig.roomTempC > 25 && upsConfig.chemistry === 'vrla'
                          ? 'text-amber-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {upsConfig.roomTempC}°C
                    </span>
                  </div>
                  <input
                    id="ups-temp"
                    type="range"
                    min={18}
                    max={35}
                    step={1}
                    value={upsConfig.roomTempC}
                    onChange={(e) =>
                      onUpdateUpsConfig({ roomTempC: parseInt(e.target.value, 10) })
                    }
                    className="w-full dcim-slider"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs text-slate-300">Límite Suelo Técnico</div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                    {[1000, 1200, 1500].map((lim) => (
                      <button
                        key={lim}
                        type="button"
                        onClick={() => onUpdateUpsConfig({ floorMaxLoadKgM2: lim })}
                        className={`py-1 font-mono text-[10px] font-medium rounded cursor-pointer ${
                          upsConfig.floorMaxLoadKgM2 === lim
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-400 border border-transparent'
                        }`}
                      >
                        {lim}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {upsConfig.roomTempC > 25 && upsConfig.chemistry === 'vrla' && (
                <p className="text-[11px] text-amber-300/90 leading-snug">
                  Nota Arrhenius: En baterías VRLA AGM, cada +10 °C por encima de 25 °C reduce su vida útil a la mitad.
                </p>
              )}

              {/* Diesel Generator + ATS Switch */}
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Grupo Electrógeno Diésel + ATS (15 s)
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Arranque automático y transferencia de acometida tras corte de red.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={upsConfig.hasGeneratorAts}
                  onClick={() =>
                    onUpdateUpsConfig({ hasGeneratorAts: !upsConfig.hasGeneratorAts })
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${
                    upsConfig.hasGeneratorAts
                      ? 'bg-emerald-500 border-emerald-400'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-slate-950 shadow transform transition-transform ${
                      upsConfig.hasGeneratorAts ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 cols): Step-by-Step Formula Breakdown + Canvas Blackout Simulator */}
          <div className="lg:col-span-7 space-y-5">
            {/* Step-by-Step Educational Engineering Derivation */}
            <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-cyan-400" />
                  <span>Cálculo Paso a Paso del Banco de Baterías (IEEE 485 &amp; Peukert)</span>
                </h2>
                <span className="font-mono text-xs text-emerald-400">
                  Autonomía real estimada: {calc.estimatedActualRuntimeMin.toFixed(1)} min
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Step 1 */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-cyan-400">
                    Paso 1 · Corriente de Descarga DC
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    I_desc = (P_kW × 1000) / (V_DC × η_inv)
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    = ({calc.totalCriticalKw.toFixed(1)} × 1000) / ({upsConfig.dcBusVoltage} ×{' '}
                    {(upsConfig.inverterEfficiencyPct / 100).toFixed(3)})
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-100">
                    I_descarga = {calc.dcDischargeCurrentA.toFixed(1)} A DC
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-cyan-400">
                    Paso 2 · Factores IEEE 485 &amp; Ley de Peukert
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    Ah_base = {calc.dcDischargeCurrentA.toFixed(1)} A × ({upsConfig.targetRuntimeMin} / 60 h) ={' '}
                    <span className="text-slate-100">{calc.rawAhRequired.toFixed(1)} Ah</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    K_env = {calc.agingFactor.toFixed(2)} · K_temp = {calc.tempCorrectionFactor.toFixed(3)} · K_Peukert (k={calc.peukertExponent}) ={' '}
                    <span className="text-amber-300">{calc.peukertMultiplier.toFixed(2)}×</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-amber-300">
                    Ah_corregidos = {calc.correctedAhRequired.toFixed(1)} Ah
                  </div>
                </div>

                {/* Step 3 */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-cyan-400">
                    Paso 3 · Topología de Strings &amp; Bloques 12V
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    Serie: {upsConfig.dcBusVoltage}V / 12V = {calc.blocksPerString} bloques/string
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    Paralelo: ⌈{calc.correctedAhRequired.toFixed(0)} / {upsConfig.blockCapacityAh}Ah⌉
                    {upsConfig.redundancy === '2N' || upsConfig.redundancy === '2(N+1)'
                      ? ' × 2 ramas'
                      : ''}
                  </div>
                  <div className="font-mono text-sm font-bold text-emerald-400">
                    {calc.parallelStrings} string(s) · {calc.totalBlocks} bloques ({calc.installedAhTotal} Ah/rama)
                  </div>
                </div>

                {/* Step 4 */}
                <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                  <div className="text-[11px] font-semibold text-cyan-400">
                    Paso 4 · Masa Total y Carga en Suelo Técnico
                  </div>
                  <div className="font-mono text-xs text-slate-300">
                    {calc.totalBlocks} × {calc.weightPerBlockKg.toFixed(1)} kg + {calc.estimatedCabinets} armario(s)
                  </div>
                  <div className="font-mono text-xs text-slate-400">
                    Superficie ocupada: {calc.footprintM2.toFixed(2)} m² (Régimen {calc.cRate.toFixed(2)}C)
                  </div>
                  <div
                    className={`font-mono text-sm font-bold ${
                      calc.isFloorOverloaded ? 'text-red-400' : 'text-slate-100'
                    }`}
                  >
                    {Math.round(calc.totalBatteryWeightKg).toLocaleString('es-ES')} kg ·{' '}
                    {Math.round(calc.floorLoadKgM2)} kg/m²{' '}
                    {calc.isFloorOverloaded ? '(EXCEDE LÍMITE)' : '(ADMISIBLE)'}
                  </div>
                </div>
              </div>
            </div>

            {/* HTML5 Canvas Discharge Curve + Blackout Simulator */}
            <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-amber-400" />
                    <span>Curva de Descarga &amp; Simulador de Apagón (Blackout Test)</span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-amber-400 inline-block" />
                      <span>Tensión Bus DC (V)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
                      <span>Estado de Carga SoC (%)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-3 h-0.5 border-t border-dashed border-red-400 inline-block" />
                      <span>Corte LVD</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={startBlackoutSimulation}
                    disabled={calc.totalCriticalKw <= 0}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {simRunning ? 'Reiniciar Apagón' : 'Simular Apagón de Red (Blackout)'}
                    </span>
                  </button>
                  {simPhase !== 'idle' && (
                    <button
                      type="button"
                      onClick={resetSimulation}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-950 border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Blackout Telemetry Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">Estado Sistema</div>
                  <div
                    className={`font-mono font-semibold mt-0.5 ${
                      simPhase === 'idle' || simPhase === 'genset_online'
                        ? 'text-emerald-400'
                        : simPhase === 'ats_transfer'
                        ? 'text-cyan-300'
                        : simPhase === 'depleted'
                        ? 'text-red-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {simPhase === 'idle' && 'NORMAL (RED AC)'}
                    {simPhase === 'battery' && 'MODO BATERÍAS'}
                    {simPhase === 'ats_transfer' && 'CONMUTANDO ATS'}
                    {simPhase === 'genset_online' && 'GENSET ONLINE'}
                    {simPhase === 'depleted' && 'CORTE LVD'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Tiempo Transcurrido</div>
                  <div className="font-mono font-semibold text-slate-100 mt-0.5">
                    {simSecondsReal < 60
                      ? `${simSecondsReal.toFixed(1)} s`
                      : `${simElapsedMin.toFixed(1)} min`}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Tensión Bus DC</div>
                  <div className="font-mono font-semibold text-amber-300 mt-0.5">
                    {livePoint.voltageV.toFixed(1)} V
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">Carga Restante (SoC)</div>
                  <div className="font-mono font-semibold text-cyan-300 mt-0.5">
                    {livePoint.socPct.toFixed(1)} %
                  </div>
                </div>
              </div>

              {/* Native HTML5 Canvas */}
              <div className="w-full rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                <canvas
                  ref={canvasRef}
                  className="w-full h-[270px] block"
                  aria-label="Curva de descarga de baterías y tensión DC en el tiempo"
                />
              </div>

              {/* Blackout Simulation Event Log */}
              {simEvents.length > 0 ? (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                  {simEvents.map((ev, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-xs ${
                        ev.tone === 'critical'
                          ? 'bg-red-950/30 border-red-500/40 text-red-200'
                          : ev.tone === 'warning'
                          ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                          : ev.tone === 'success'
                          ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      {ev.tone === 'critical' ? (
                        <Flame className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      ) : ev.tone === 'warning' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      ) : ev.tone === 'success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                      )}
                      <span className="font-mono text-[11px] opacity-80 shrink-0">
                        [{ev.timeLabel}]
                      </span>
                      <span>{ev.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-400">
                  Pulsa <strong>Simular Apagón de Red (Blackout)</strong> para observar el comportamiento de conmutación del SAI, la caída de tensión DC y el arranque del Grupo Electrógeno + ATS a los 15 segundos.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
