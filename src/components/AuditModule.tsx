import React, { useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileText,
  Flame,
  Play,
  Printer,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuditChecklist,
  AuditReport,
  AuditSeverity,
  CtfMission,
  CtfMissionId,
  TelemetryKPIs,
  Tia942EvaluationResult,
  UpsCalculationResult,
} from '../types';

interface AuditModuleProps {
  kpis: TelemetryKPIs;
  upsCalc: UpsCalculationResult;
  tiaEval: Tia942EvaluationResult;
  checklist: AuditChecklist;
  onUpdateChecklist: (patch: Partial<AuditChecklist>) => void;
  auditReport: AuditReport;
  missions: CtfMission[];
  unlockedFlags: string[];
  activeMissionId: CtfMissionId;
  onActivateCtfMission: (id: CtfMissionId) => void;
  onFactoryReset: () => void;
}

export const AuditModule: React.FC<AuditModuleProps> = ({
  kpis,
  upsCalc,
  tiaEval,
  checklist,
  onUpdateChecklist,
  auditReport,
  missions,
  unlockedFlags,
  activeMissionId,
  onActivateCtfMission,
  onFactoryReset,
}) => {
  const [lastAuditRunAt, setLastAuditRunAt] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | AuditSeverity>('all');
  const [showReportPreview, setShowReportPreview] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);
  const [copiedFlag, setCopiedFlag] = useState<string | null>(null);

  const handleRunAudit = () => {
    setLastAuditRunAt(new Date().toLocaleTimeString('es-ES'));
  };

  const handleCopyFlag = async (flag: string) => {
    try {
      await navigator.clipboard.writeText(flag);
      setCopiedFlag(flag);
      setTimeout(() => setCopiedFlag(null), 2000);
    } catch {
      // Ignore clipboard failure in restricted iframes
    }
  };

  const filteredFindings =
    severityFilter === 'all'
      ? auditReport.findings
      : auditReport.findings.filter((f) => f.severity === severityFilter);

  const verdictStyle =
    auditReport.criticalCount > 0
      ? 'bg-red-950/35 border-red-500/60 text-red-200'
      : auditReport.majorCount > 0 || auditReport.minorCount > 0
      ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
      : 'bg-emerald-950/30 border-emerald-500/50 text-emerald-200';

  return (
    <main className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* TOP AUDIT VERDICT & CONTROLS */}
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${verdictStyle}`}>
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-slate-400">
                  Auditoría Técnica de Ingeniería &amp; Certificación de Sala
                </div>
                <div className="flex items-baseline gap-3 mt-0.5 flex-wrap">
                  <span className="font-mono text-lg sm:text-xl font-bold text-slate-100">
                    {auditReport.verdict}
                  </span>
                  <span className="font-mono text-xs text-cyan-300">
                    Índice Conformidad: {auditReport.scorePct}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRunAudit}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-cyan-400 text-slate-950 hover:bg-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Ejecutar Auditoría de Ingeniería</span>
              </button>

              <button
                type="button"
                onClick={() => setShowReportPreview(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-950 border border-slate-700 text-slate-100 hover:border-cyan-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Generar Informe de Auditoría</span>
              </button>

              {!confirmFactoryReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmFactoryReset(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-red-300 hover:border-red-500/50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reiniciar Simulador</span>
                </button>
              ) : (
                <div className="inline-flex items-center gap-1.5 p-1 rounded-lg bg-red-950/40 border border-red-500/50">
                  <span className="text-[11px] text-red-200 px-1.5">¿Borrar flags y diseño?</span>
                  <button
                    type="button"
                    onClick={() => {
                      onFactoryReset();
                      setConfirmFactoryReset(false);
                    }}
                    className="px-2 py-1 text-[11px] font-semibold rounded bg-red-600 text-white hover:bg-red-500 cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmFactoryReset(false)}
                    className="px-2 py-1 text-[11px] rounded bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Severity Counter Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() =>
                setSeverityFilter((f) => (f === 'critical' ? 'all' : 'critical'))
              }
              className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                severityFilter === 'critical'
                  ? 'bg-red-950/50 border-red-500'
                  : 'bg-slate-950/70 border-slate-800 hover:border-red-500/40'
              }`}
            >
              <div className="text-[11px] text-slate-400">Hallazgos Críticos</div>
              <div className="font-mono text-lg font-bold text-red-400 mt-0.5">
                {auditReport.criticalCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter((f) => (f === 'major' ? 'all' : 'major'))}
              className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                severityFilter === 'major'
                  ? 'bg-amber-950/50 border-amber-500'
                  : 'bg-slate-950/70 border-slate-800 hover:border-amber-500/40'
              }`}
            >
              <div className="text-[11px] text-slate-400">Hallazgos Graves</div>
              <div className="font-mono text-lg font-bold text-amber-300 mt-0.5">
                {auditReport.majorCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter((f) => (f === 'minor' ? 'all' : 'minor'))}
              className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                severityFilter === 'minor'
                  ? 'bg-sky-950/50 border-sky-500'
                  : 'bg-slate-950/70 border-slate-800 hover:border-sky-500/40'
              }`}
            >
              <div className="text-[11px] text-slate-400">Hallazgos Leves</div>
              <div className="font-mono text-lg font-bold text-sky-300 mt-0.5">
                {auditReport.minorCount}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSeverityFilter((f) => (f === 'pass' ? 'all' : 'pass'))}
              className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                severityFilter === 'pass'
                  ? 'bg-emerald-950/50 border-emerald-500'
                  : 'bg-slate-950/70 border-slate-800 hover:border-emerald-500/40'
              }`}
            >
              <div className="text-[11px] text-slate-400">Puntos Conformes</div>
              <div className="font-mono text-lg font-bold text-emerald-400 mt-0.5">
                {auditReport.passCount}
              </div>
            </button>
          </div>

          {lastAuditRunAt && (
            <div className="text-[11px] font-mono text-cyan-300">
              Auditoría ejecutada y validada a las {lastAuditRunAt} · Mostrando{' '}
              {filteredFindings.length} de {auditReport.findings.length} comprobaciones.
            </div>
          )}
        </div>

        {/* SECTION 1: PHYSICAL CHECKLIST + LIVE AUDIT FINDINGS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT 4 COLS: Physical Site Inspection Checklist */}
          <div className="lg:col-span-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
            <div className="border-b border-slate-800 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">
                Checklist de Inspección Física en Sala
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Verificaciones obligatorias TIA-607, NFPA 75 y seguridad eléctrica.
              </p>
            </div>

            <div className="space-y-2.5">
              {(
                [
                  {
                    key: 'noWetSprinklers',
                    title: 'Sin rociadores húmedos sobre racks',
                    desc: 'Confirmada ausencia de tubería húmeda de agua sobre equipamiento IT (solo gas limpio NOVEC/FM-200).',
                  },
                  {
                    key: 'tia607Grounding',
                    title: 'Puesta a tierra equipotencial TIA-607',
                    desc: 'Malla CBN / Mesh-BN de cobre bajo suelo técnico unida a barra TMGB y racks.',
                  },
                  {
                    key: 'leakDetectionRope',
                    title: 'Sensores de inundación (Leak Rope)',
                    desc: 'Cable detector de fugas bajo suelo técnico en perímetro de CRACs y tuberías.',
                  },
                  {
                    key: 'epoProtectedCover',
                    title: 'EPO con cubeta protectora',
                    desc: 'Pulsador de emergencia (Emergency Power Off) con tapa abatible contra pulsación accidental.',
                  },
                ] as Array<{
                  key: keyof AuditChecklist;
                  title: string;
                  desc: string;
                }>
              ).map((item) => {
                const checked = checklist[item.key];
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        onUpdateChecklist({ [item.key]: e.target.checked })
                      }
                      className="mt-0.5 h-4 w-4 rounded border-slate-600 accent-cyan-400 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-100">
                        {item.title}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {item.desc}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* RIGHT 8 COLS: Live Linter Audit Findings */}
          <div className="lg:col-span-8 p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-100">
                Informe Técnico de Hallazgos (Live Linter)
              </h2>
              {severityFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSeverityFilter('all')}
                  className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Ver todos ({auditReport.findings.length})
                </button>
              )}
            </div>

            <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
              {filteredFindings.map((f) => {
                const boxClass =
                  f.severity === 'critical'
                    ? 'bg-red-950/30 border-red-500/50'
                    : f.severity === 'major'
                    ? 'bg-amber-950/25 border-amber-500/45'
                    : f.severity === 'minor'
                    ? 'bg-sky-950/25 border-sky-500/40'
                    : 'bg-emerald-950/20 border-emerald-500/35';

                const badgeText =
                  f.severity === 'critical'
                    ? 'CRÍTICO'
                    : f.severity === 'major'
                    ? 'GRAVE'
                    : f.severity === 'minor'
                    ? 'LEVE'
                    : 'CONFORME';

                const badgeColor =
                  f.severity === 'critical'
                    ? 'text-red-400'
                    : f.severity === 'major'
                    ? 'text-amber-300'
                    : f.severity === 'minor'
                    ? 'text-sky-300'
                    : 'text-emerald-400';

                return (
                  <div key={f.id} className={`p-3 rounded-lg border ${boxClass}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {f.severity === 'critical' ? (
                          <Flame className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                        ) : f.severity === 'major' || f.severity === 'minor' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100">
                            {f.title}
                          </div>
                          <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                            {f.detail}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            <span className="font-medium text-slate-300">Acción:</span>{' '}
                            {f.recommendation}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-mono text-[10px] font-bold ${badgeColor}`}>
                          {badgeText}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500 mt-0.5">
                          {f.category}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECTION 2: 4 AUTO-GRADED CTF TRAINING CHALLENGES */}
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Modo Entrenamiento: Misiones CTF de Ingeniería Crítica</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Activa un reto para cargar el escenario averiado, resuélvelo entre los módulos del simulador y desbloquea automáticamente su Flag.
              </p>
            </div>
            <div className="font-mono text-xs font-semibold text-emerald-400">
              {unlockedFlags.length} / {missions.length} FLAGS DESBLOQUEADAS
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {missions.map((mission) => {
              const isUnlocked =
                mission.completed || unlockedFlags.includes(mission.flag);
              const isCurrent = activeMissionId === mission.id;

              return (
                <div
                  key={mission.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${
                    isUnlocked
                      ? 'bg-emerald-950/15 border-emerald-500/45'
                      : isCurrent
                      ? 'bg-slate-950 border-amber-500/60'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-amber-300">
                            {mission.code}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-xs text-slate-400">{mission.subtitle}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-100 mt-0.5">
                          {mission.title}
                        </h3>
                      </div>

                      <button
                        type="button"
                        onClick={() => onActivateCtfMission(mission.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Play className="w-3 h-3" />
                        <span>Cargar Reto</span>
                      </button>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{mission.brief}</p>

                    <div className="space-y-1.5 pt-1">
                      {mission.objectives.map((obj) => (
                        <div
                          key={obj.id}
                          className="flex items-center gap-2 text-xs text-slate-300"
                        >
                          {obj.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-600 shrink-0" />
                          )}
                          <span>{obj.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Flag Unlock Status */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {isUnlocked ? (
                      <>
                        <code className="font-mono text-xs font-bold text-emerald-300">
                          {mission.flag}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopyFlag(mission.flag)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-slate-900 border border-slate-700 text-slate-200 hover:border-emerald-400 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{copiedFlag === mission.flag ? 'Copiada' : 'Copiar'}</span>
                        </button>
                      </>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-500">
                        FLAG BLOQUEADA — Completa todos los requisitos en vivo
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PRINTABLE / PREVIEW AUDIT REPORT MODAL */}
      {showReportPreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Informe Técnico de Auditoría CPD Designer"
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white text-slate-900 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-900 text-slate-100 flex items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                <span>Vista Previa de Informe Técnico — CPD Designer</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-400 text-slate-950 hover:bg-cyan-300 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir / Guardar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportPreview(false)}
                  aria-label="Cerrar informe"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 sm:p-8 overflow-y-auto space-y-6 text-sm">
              {/* Report Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-300 pb-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">
                    DICTAMEN TÉCNICO DE AUDITORÍA DE CENTRO DE DATOS (CPD)
                  </h1>
                  <p className="text-xs text-slate-600 mt-1">
                    Generado por CPD Designer · DCIM &amp; ANSI/TIA-942 Engineering Suite
                  </p>
                </div>
                <div className="text-right font-mono text-xs text-slate-600">
                  <div>Fecha: {new Date(auditReport.timestamp).toLocaleString('es-ES')}</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    Veredicto: {auditReport.verdict} ({auditReport.scorePct}%)
                  </div>
                </div>
              </div>

              {/* Executive Telemetry Table */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  1. Resumen de Cálculos Electromecánicos y Climáticos
                </h2>
                <table className="w-full border-collapse border border-slate-300 text-xs">
                  <tbody>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 font-semibold bg-slate-100">Carga IT Total</td>
                      <td className="p-2 font-mono">
                        {kpis.totalItKw.toFixed(2)} kW / {kpis.totalItKva.toFixed(2)} kVA ({kpis.rackCount} racks)
                      </td>
                      <td className="p-2 font-semibold bg-slate-100">Nivel TIA-942</td>
                      <td className="p-2 font-mono">
                        {tiaEval.globalTier} ({tiaEval.availabilityPct})
                      </td>
                    </tr>
                    <tr className="border-b border-slate-300">
                      <td className="p-2 font-semibold bg-slate-100">Carga Térmica Total</td>
                      <td className="p-2 font-mono">
                        {Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')} BTU/h ({kpis.totalHeatKw.toFixed(2)} kWt)
                      </td>
                      <td className="p-2 font-semibold bg-slate-100">PUE / DCiE</td>
                      <td className="p-2 font-mono">
                        {kpis.pue > 0 ? `${kpis.pue.toFixed(2)} (${kpis.dciePct.toFixed(1)}%)` : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td className="p-2 font-semibold bg-slate-100">SAI Recomendado</td>
                      <td className="p-2 font-mono">
                        {upsCalc.recommendedUpsKva.toFixed(1)} kVA · Autonomía {upsCalc.estimatedActualRuntimeMin.toFixed(1)} min
                      </td>
                      <td className="p-2 font-semibold bg-slate-100">Climatización CRAC</td>
                      <td className="p-2 font-mono">
                        {kpis.cracCount} uds ({Math.round(kpis.totalCoolingCapacityBtuH).toLocaleString('es-ES')} BTU/h)
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Findings Table */}
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  2. Hallazgos y No Conformidades Detectadas
                </h2>
                <div className="space-y-2">
                  {auditReport.findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 rounded border border-slate-300 text-xs flex justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          [{f.severity.toUpperCase()}] {f.title}
                        </div>
                        <div className="text-slate-700 mt-0.5">{f.detail}</div>
                        <div className="text-slate-600 mt-0.5">
                          Recomendación: {f.recommendation}
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 shrink-0">
                        {f.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sign-off */}
              <div className="pt-4 border-t border-slate-300 flex justify-between items-end text-xs text-slate-600">
                <div>
                  <div>Ingeniero Auditor / Responsable DCIM</div>
                  <div className="mt-6 w-48 border-b border-slate-400" />
                </div>
                <div className="font-mono">https://www.unfantasmaenelsistema.com/</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
