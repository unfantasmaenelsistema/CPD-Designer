import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  Euro,
  Flame,
  Gauge,
  Leaf,
  Snowflake,
  Thermometer,
  Users,
  Wind,
  XCircle,
} from 'lucide-react';
import { ROOM_AREA_M2 } from '../data/catalog';
import {
  BTU_PER_KW,
  BTU_PER_PERSON,
  BTU_PER_TR,
  FRIGORIAS_PER_BTU,
  LIGHTING_W_PER_M2,
} from '../engine/dcimEngine';
import {
  CoolingTechnology,
  FloorAnalysis,
  TelemetryKPIs,
  ThermalConfig,
} from '../types';

interface ThermalModuleProps {
  kpis: TelemetryKPIs;
  analysis: FloorAnalysis;
  cacEnabled: boolean;
  onToggleCac: () => void;
  thermalConfig: ThermalConfig;
  onUpdateThermalConfig: (patch: Partial<ThermalConfig>) => void;
}

const CO2_KG_PER_KWH = 0.21; // Average EU/ES grid carbon intensity (0.21 kg CO2/kWh)

export const ThermalModule: React.FC<ThermalModuleProps> = ({
  kpis,
  analysis,
  cacEnabled,
  onToggleCac,
  thermalConfig,
  onUpdateThermalConfig,
}) => {
  const itBtu = kpis.totalItKw * BTU_PER_KW;
  const electricalLossKw = kpis.upsLossKw + kpis.jouleLossKw + kpis.pduLossKw;
  const electricalLossBtu = electricalLossKw * BTU_PER_KW;
  const lightingBtu = kpis.lightingEnvelopeKw * BTU_PER_KW;
  const peopleBtu = kpis.peopleHeatKw * BTU_PER_KW;

  const cracUnitsNeededN = Math.ceil(kpis.totalHeatKw / 25);
  const cracUnitsNeededNPlus1 = cracUnitsNeededN > 0 ? cracUnitsNeededN + 1 : 0;
  const hasNPlus1Cooling =
    kpis.cracCount >= 2 && kpis.totalCoolingCapacityKw - 25 >= kpis.totalHeatKw;
  const hasNCooling =
    kpis.cracCount >= 1 && kpis.totalCoolingCapacityKw >= kpis.totalHeatKw;

  // ASHRAE TC 9.9 Environmental Validation
  const tempTooLow = thermalConfig.supplyTempC < 18;
  const tempTooHigh = thermalConfig.supplyTempC > 27;
  const rhEsdRisk = thermalConfig.relativeHumidityPct < 35;
  const rhCorrosionRisk = thermalConfig.relativeHumidityPct > 65;
  const rhMarginal =
    !rhEsdRisk &&
    !rhCorrosionRisk &&
    (thermalConfig.relativeHumidityPct < 40 || thermalConfig.relativeHumidityPct > 60);

  // Annual Energy, Cost & Carbon Footprint
  const annualKwh = kpis.totalFacilityKw * 24 * 365;
  const annualItKwh = kpis.totalItKw * 24 * 365;
  const annualCostEur = annualKwh * Math.max(0, thermalConfig.energyPriceEurKwh);
  const annualOverheadCostEur =
    Math.max(0, annualKwh - annualItKwh) * Math.max(0, thermalConfig.energyPriceEurKwh);
  const annualCo2Tonnes = (annualKwh * CO2_KG_PER_KWH) / 1000;

  // PUE Speedometer Needle Angle (-90 deg = 1.00, +90 deg = 2.50)
  const clampedPue = kpis.pue > 0 ? Math.min(2.5, Math.max(1.0, kpis.pue)) : 1.0;
  const needleAngleDeg = -90 + ((clampedPue - 1.0) / 1.5) * 180;

  // ASHRAE Psychrometric Envelope Plot Coordinates
  // X: Temp 14..32 -> 24..276 (width 252), Y: RH 20..80 -> 146..18 (height 128)
  const mapTempX = (t: number) => 24 + ((t - 14) / (32 - 14)) * 252;
  const mapRhY = (rh: number) => 146 - ((rh - 20) / (80 - 20)) * 128;

  const boxX1 = mapTempX(18);
  const boxX2 = mapTempX(27);
  const boxY1 = mapRhY(60);
  const boxY2 = mapRhY(40);
  const curX = mapTempX(thermalConfig.supplyTempC);
  const curY = mapRhY(thermalConfig.relativeHumidityPct);

  const handleSelectCoolingTech = (tech: CoolingTechnology) => {
    onUpdateThermalConfig({ coolingTech: tech });
    if (tech === 'freecooling' && !cacEnabled) {
      onToggleCac();
    }
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-950 p-4 lg:p-6">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top 4 KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">Carga Térmica Total de Sala</div>
            <div className="font-mono text-lg font-bold text-amber-300 mt-1">
              {Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')} BTU/h
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1">
              {kpis.totalHeatKw.toFixed(2)} kWt · {kpis.totalCoolingTons.toFixed(2)} TR ·{' '}
              {Math.round(kpis.totalFrigoriasPerHour).toLocaleString('es-ES')} Frig/h
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">
              Climatización Instalada ({kpis.cracCount} CRAC)
            </div>
            <div className="font-mono text-lg font-bold text-cyan-300 mt-1">
              {Math.round(kpis.totalCoolingCapacityBtuH).toLocaleString('es-ES')} BTU/h
            </div>
            <div
              className={`font-mono text-[11px] mt-1 ${
                hasNPlus1Cooling
                  ? 'text-emerald-400'
                  : hasNCooling
                  ? 'text-amber-300'
                  : 'text-red-400'
              }`}
            >
              {hasNPlus1Cooling
                ? 'Cumple redundancia N+1'
                : hasNCooling
                ? `Cubre N (faltan ${Math.max(0, cracUnitsNeededNPlus1 - kpis.cracCount)} CRAC para N+1)`
                : `Déficit: faltan ${Math.max(1, cracUnitsNeededN - kpis.cracCount)} CRAC`}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">PUE &amp; DCiE (ISO/IEC 30134-2)</div>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`font-mono text-lg font-bold ${
                  kpis.pueStatus === 'optimal'
                    ? 'text-emerald-400'
                    : kpis.pueStatus === 'moderate'
                    ? 'text-amber-400'
                    : kpis.pueStatus === 'critical'
                    ? 'text-red-400'
                    : 'text-slate-400'
                }`}
              >
                {kpis.pue > 0 ? kpis.pue.toFixed(2) : '—'}
              </span>
              <span className="font-mono text-xs text-cyan-300">
                DCiE {kpis.dciePct > 0 ? `${kpis.dciePct.toFixed(1)}%` : '—'}
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1">
              COP efectivo: {kpis.effectiveCop.toFixed(2)} · Clima: {kpis.cracElectricalKw.toFixed(1)} kW
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
            <div className="text-xs text-slate-400">Consumo, Coste &amp; Huella Anual</div>
            <div className="font-mono text-lg font-bold text-slate-100 mt-1">
              {Math.round(annualCostEur).toLocaleString('es-ES')} €/año
            </div>
            <div className="font-mono text-[11px] text-slate-400 mt-1">
              {(annualKwh / 1000).toFixed(1)} MWh/año · {annualCo2Tonnes.toFixed(1)} tCO₂/año
            </div>
          </div>
        </div>

        {/* ASHRAE TC 9.9 Critical / Warning Alerts */}
        {(tempTooLow || tempTooHigh || rhEsdRisk || rhCorrosionRisk || rhMarginal) && (
          <div className="space-y-2">
            {tempTooLow && (
              <div className="p-3.5 rounded-xl bg-amber-950/35 border border-amber-500/50 flex items-start gap-3 text-xs text-amber-200">
                <Thermometer className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    Temperatura de impulsión baja ({thermalConfig.supplyTempC} °C &lt; 18 °C ASHRAE):
                  </span>{' '}
                  Sobrecoste energético innecesario en compresores y riesgo de condensación superficial al abrir puertas de racks.
                </div>
              </div>
            )}
            {tempTooHigh && (
              <div className="p-3.5 rounded-xl bg-red-950/35 border border-red-500/60 flex items-start gap-3 text-xs text-red-200">
                <Flame className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    Temperatura de impulsión excesiva ({thermalConfig.supplyTempC} °C &gt; 27 °C ASHRAE):
                  </span>{' '}
                  Throttling térmico en CPUs/GPUs, incremento agresivo de ventiladores de servidor y fallo prematuro de discos y condensadores.
                </div>
              </div>
            )}
            {rhEsdRisk && (
              <div className="p-3.5 rounded-xl bg-red-950/35 border border-red-500/60 flex items-start gap-3 text-xs text-red-200">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    Alerta Crítica de Descarga Electrostática (ESD) — Humedad {thermalConfig.relativeHumidityPct}% (&lt; 35%):
                  </span>{' '}
                  El aire excesivamente seco facilita la acumulación de carga estática capaz de dañar tarjetas de red, memorias y backplanes durante intervenciones.
                </div>
              </div>
            )}
            {rhCorrosionRisk && (
              <div className="p-3.5 rounded-xl bg-red-950/35 border border-red-500/60 flex items-start gap-3 text-xs text-red-200">
                <Droplets className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">
                    Alerta Crítica de Corrosión y Condensación en PCB — Humedad {thermalConfig.relativeHumidityPct}% (&gt; 65%):
                  </span>{' '}
                  Riesgo alto de migración electroquímica, corrosión por filamentos conductivos y punto de rocío sobre baterías y electrónica fría.
                </div>
              </div>
            )}
            {rhMarginal && (
              <div className="p-3 rounded-xl bg-amber-950/25 border border-amber-500/40 flex items-center gap-2.5 text-xs text-amber-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Humedad fuera de la banda recomendada ASHRAE TC 9.9 (40% – 60%). Ajusta humidificación/deshumidificación para máxima fiabilidad.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Section 1: Detailed Thermal Load Engineering Breakdown Table */}
        <div className="p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-100">
                1. Desglose de Carga Térmica de Sala Técnica
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sincronizada en tiempo real con los {kpis.rackCount} racks del Plano 2D y las pérdidas del SAI (Fase 2).
              </p>
            </div>

            {/* Technicians in room selector */}
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800">
              <Users className="w-4 h-4 text-cyan-400 shrink-0" />
              <label htmlFor="tech-count" className="text-xs text-slate-300 whitespace-nowrap">
                Técnicos en sala:
              </label>
              <input
                id="tech-count"
                type="range"
                min={0}
                max={10}
                step={1}
                value={thermalConfig.techniciansCount}
                onChange={(e) =>
                  onUpdateThermalConfig({ techniciansCount: parseInt(e.target.value, 10) })
                }
                className="w-24 dcim-slider"
              />
              <span className="font-mono text-xs font-semibold text-cyan-300 w-8 text-right">
                {thermalConfig.techniciansCount} p.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-medium">
                  <th className="py-2.5 pr-4">Componente Térmico</th>
                  <th className="py-2.5 px-3">Fórmula Aplicada</th>
                  <th className="py-2.5 px-3 text-right">kW Térmicos</th>
                  <th className="py-2.5 px-3 text-right">BTU/h</th>
                  <th className="py-2.5 px-3 text-right">Frigorías/h</th>
                  <th className="py-2.5 pl-3 text-right">% Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                <tr className="hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4 font-medium text-slate-100">
                    Equipamiento IT (Racks Plano 2D)
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                    {kpis.totalItKw.toFixed(2)} kW × 3,412.14
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-100">
                    {kpis.totalItKw.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                    {Math.round(itBtu).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {Math.round(itBtu * FRIGORIAS_PER_BTU).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono text-cyan-300">
                    {kpis.totalHeatKw > 0
                      ? ((kpis.totalItKw / kpis.totalHeatKw) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                </tr>

                <tr className="hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4 font-medium text-slate-100">
                    SAI (Fase 2) + 2% Joule + PDUs ({kpis.pduCount})
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                    ({kpis.upsLossKw.toFixed(2)} + {kpis.jouleLossKw.toFixed(2)} +{' '}
                    {kpis.pduLossKw.toFixed(1)}) kW × 3,412.14
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-100">
                    {electricalLossKw.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                    {Math.round(electricalLossBtu).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {Math.round(electricalLossBtu * FRIGORIAS_PER_BTU).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono text-cyan-300">
                    {kpis.totalHeatKw > 0
                      ? ((electricalLossKw / kpis.totalHeatKw) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                </tr>

                <tr className="hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4 font-medium text-slate-100">
                    Iluminación LED &amp; Envolvente Térmica
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                    {ROOM_AREA_M2} m² × {LIGHTING_W_PER_M2} W/m²
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-100">
                    {kpis.lightingEnvelopeKw.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                    {Math.round(lightingBtu).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {Math.round(lightingBtu * FRIGORIAS_PER_BTU).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono text-cyan-300">
                    {kpis.totalHeatKw > 0
                      ? ((kpis.lightingEnvelopeKw / kpis.totalHeatKw) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                </tr>

                <tr className="hover:bg-slate-900/40">
                  <td className="py-2.5 pr-4 font-medium text-slate-100">
                    Carga Sensible/Latente Personal ({thermalConfig.techniciansCount} pers.)
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                    {thermalConfig.techniciansCount} × {BTU_PER_PERSON} BTU/h
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-100">
                    {kpis.peopleHeatKw.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                    {Math.round(peopleBtu).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {Math.round(peopleBtu * FRIGORIAS_PER_BTU).toLocaleString('es-ES')}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono text-cyan-300">
                    {kpis.totalHeatKw > 0
                      ? ((kpis.peopleHeatKw / kpis.totalHeatKw) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-700 bg-slate-950/70 font-semibold">
                  <td className="py-3 pr-4 text-slate-100">
                    TOTAL CARGA TÉRMICA DE SALA
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-emerald-400">
                    Equiv. {kpis.totalCoolingTons.toFixed(2)} Toneladas Refrig. (TR)
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-100">
                    {kpis.totalHeatKw.toFixed(2)} kWt
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-amber-300">
                    {Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-cyan-300">
                    {Math.round(kpis.totalFrigoriasPerHour).toLocaleString('es-ES')}
                  </td>
                  <td className="py-3 pl-3 text-right font-mono text-slate-200">100.0%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 2 & 3 Split: Precision Cooling + ASHRAE TC 9.9 (Left) & PUE Analyzer (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* LEFT 7 COLS: Precision Cooling & ASHRAE TC 9.9 */}
          <div className="lg:col-span-7 p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-5 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Snowflake className="w-4 h-4 text-cyan-400" />
                  <span>2. Climatización de Precisión &amp; Envolvente ASHRAE TC 9.9</span>
                </h2>
                <span className="font-mono text-[11px] text-slate-400">
                  1 TR = {BTU_PER_TR.toLocaleString('es-ES')} BTU/h
                </span>
              </div>

              {/* Cooling Technology Selector */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-200">
                  Tecnología de Planta Frigorífica (Impacta en EER/COP y PUE)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      {
                        id: 'dx',
                        title: 'Expansión Directa (DX)',
                        sub: 'COP base 2.95 · Tradicional',
                      },
                      {
                        id: 'chiller',
                        title: 'Agua Helada (Chiller)',
                        sub: 'COP base 4.10 · CRAH',
                      },
                      {
                        id: 'freecooling',
                        title: 'Free Cooling + CAC',
                        sub: 'COP base 6.10 · Alta efic.',
                      },
                    ] as Array<{ id: CoolingTechnology; title: string; sub: string }>
                  ).map((tech) => (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => handleSelectCoolingTech(tech.id)}
                      className={`p-2.5 text-left rounded-lg border transition-colors cursor-pointer ${
                        thermalConfig.coolingTech === tech.id
                          ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-200'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold">{tech.title}</div>
                      <div className="font-mono text-[10px] opacity-80 mt-0.5">{tech.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Sync CAC Toggle directly inside Phase 3 */}
              <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Wind className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      Cerramiento de Pasillo Frío (CAC) — Sincronizado con Plano 2D
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Evita mezcla térmica y reduce el consumo de ventilación CRAC en un 18%.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cacEnabled}
                  onClick={onToggleCac}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${
                    cacEnabled
                      ? 'bg-cyan-500 border-cyan-400'
                      : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-slate-950 shadow transform transition-transform ${
                      cacEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* CRAC Capacity vs Thermal Demand Bar */}
              <div className="p-3.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-200">
                    Capacidad CRAC Instalada vs Demanda Térmica
                  </span>
                  <span className="font-mono text-slate-300">
                    {Math.round(kpis.totalCoolingCapacityBtuH).toLocaleString('es-ES')} /{' '}
                    {Math.round(kpis.totalBtuPerHour).toLocaleString('es-ES')} BTU/h
                  </span>
                </div>

                <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      !hasNCooling
                        ? 'bg-red-500'
                        : !hasNPlus1Cooling
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{
                      width: `${
                        kpis.totalCoolingCapacityKw > 0
                          ? Math.min(100, (kpis.totalHeatKw / kpis.totalCoolingCapacityKw) * 100)
                          : 100
                      }%`,
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                  <span className="text-slate-400">
                    CRACs necesarios (N): {cracUnitsNeededN} · Para N+1: {cracUnitsNeededNPlus1}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      hasNPlus1Cooling
                        ? 'text-emerald-400'
                        : hasNCooling
                        ? 'text-amber-300'
                        : 'text-red-400'
                    }`}
                  >
                    {hasNPlus1Cooling ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {hasNPlus1Cooling
                        ? `N+1 OK (Margen +${kpis.coolingMarginKw.toFixed(1)} kWt)`
                        : hasNCooling
                        ? `Solo N (Sin redundancia N+1)`
                        : `Déficit ${Math.abs(kpis.coolingMarginKw).toFixed(1)} kWt`}
                    </span>
                  </span>
                </div>
              </div>

              {/* ASHRAE TC 9.9 Sliders + Psychrometric Envelope Map */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center pt-1">
                <div className="space-y-4">
                  {/* Cold Aisle Supply Temp */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <label htmlFor="ashrae-temp" className="font-medium text-slate-200">
                        Temp. Impulsión Pasillo Frío
                      </label>
                      <span
                        className={`font-mono font-semibold ${
                          tempTooLow || tempTooHigh ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {thermalConfig.supplyTempC} °C
                      </span>
                    </div>
                    <input
                      id="ashrae-temp"
                      type="range"
                      min={14}
                      max={32}
                      step={1}
                      value={thermalConfig.supplyTempC}
                      onChange={(e) =>
                        onUpdateThermalConfig({ supplyTempC: parseInt(e.target.value, 10) })
                      }
                      className="w-full dcim-slider"
                    />
                    <div className="flex justify-between font-mono text-[10px] text-slate-500">
                      <span>14 °C</span>
                      <span className="text-emerald-400/80">18–27 °C ASHRAE</span>
                      <span>32 °C</span>
                    </div>
                  </div>

                  {/* Relative Humidity */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <label htmlFor="ashrae-rh" className="font-medium text-slate-200">
                        Humedad Relativa de Sala
                      </label>
                      <span
                        className={`font-mono font-semibold ${
                          rhEsdRisk || rhCorrosionRisk
                            ? 'text-red-400'
                            : rhMarginal
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                        }`}
                      >
                        {thermalConfig.relativeHumidityPct}% HR
                      </span>
                    </div>
                    <input
                      id="ashrae-rh"
                      type="range"
                      min={20}
                      max={80}
                      step={1}
                      value={thermalConfig.relativeHumidityPct}
                      onChange={(e) =>
                        onUpdateThermalConfig({
                          relativeHumidityPct: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full dcim-slider"
                    />
                    <div className="flex justify-between font-mono text-[10px] text-slate-500">
                      <span>20% (ESD)</span>
                      <span className="text-emerald-400/80">40–60% Rec.</span>
                      <span>80%</span>
                    </div>
                  </div>
                </div>

                {/* ASHRAE TC 9.9 Envelope Mini SVG Plot */}
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400 mb-1 flex justify-between">
                    <span>Zona ASHRAE TC 9.9</span>
                    <span>
                      ({thermalConfig.supplyTempC}°C, {thermalConfig.relativeHumidityPct}%)
                    </span>
                  </div>
                  <svg viewBox="0 0 296 168" className="w-full h-auto block">
                    {/* Background Grid */}
                    <rect x="24" y="18" width="252" height="128" fill="#020617" stroke="#1e293b" />
                    {/* ESD Zone (<35% RH) */}
                    <rect
                      x="24"
                      y={mapRhY(35)}
                      width="252"
                      height={146 - mapRhY(35)}
                      fill="rgba(239, 68, 68, 0.08)"
                    />
                    {/* Corrosion Zone (>65% RH) */}
                    <rect
                      x="24"
                      y="18"
                      width="252"
                      height={mapRhY(65) - 18}
                      fill="rgba(239, 68, 68, 0.08)"
                    />
                    {/* Recommended ASHRAE TC 9.9 Box (18-27°C, 40-60% RH) */}
                    <rect
                      x={boxX1}
                      y={boxY1}
                      width={boxX2 - boxX1}
                      height={boxY2 - boxY1}
                      fill="rgba(16, 185, 129, 0.16)"
                      stroke="#10b981"
                      strokeWidth="1.5"
                    />
                    <text
                      x={(boxX1 + boxX2) / 2}
                      y={(boxY1 + boxY2) / 2 + 3}
                      textAnchor="middle"
                      fill="#34d399"
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      ÓPTIMO TC 9.9
                    </text>

                    {/* Axis labels */}
                    <text x="24" y="160" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">
                      14°C
                    </text>
                    <text x={boxX1} y="160" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                      18°C
                    </text>
                    <text x={boxX2} y="160" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                      27°C
                    </text>
                    <text x="276" y="160" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="end">
                      32°C
                    </text>

                    <text x="20" y="22" fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace" textAnchor="end">
                      80%
                    </text>
                    <text x="20" y="146" fill="#64748b" fontSize="8" fontFamily="JetBrains Mono, monospace" textAnchor="end">
                      20%
                    </text>

                    {/* Current Operating Point Crosshair */}
                    <line x1={curX} y1="18" x2={curX} y2="146" stroke="rgba(34,211,238,0.35)" strokeDasharray="3 3" />
                    <line x1="24" y1={curY} x2="276" y2={curY} stroke="rgba(34,211,238,0.35)" strokeDasharray="3 3" />
                    <circle
                      cx={curX}
                      cy={curY}
                      r="5"
                      fill={
                        tempTooLow || tempTooHigh || rhEsdRisk || rhCorrosionRisk
                          ? '#ef4444'
                          : rhMarginal
                          ? '#f59e0b'
                          : '#22d3ee'
                      }
                      stroke="#020617"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
              </div>
            </div>

            {analysis.hotspotCount > 0 && (
              <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-500/40 text-[11px] text-red-200 flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-400 shrink-0" />
                <span>
                  Nota del Plano 2D: {analysis.hotspotCount} hotspot(s) activos están añadiendo +{kpis.thermalPenaltyKw.toFixed(2)} kW de penalización al consumo climático.
                </span>
              </div>
            )}
          </div>

          {/* RIGHT 5 COLS: PUE Visual Analyzer (ISO/IEC 30134-2) */}
          <div className="lg:col-span-5 p-4 sm:p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span>3. Analizador Visual de PUE &amp; DCiE</span>
                </h2>
                <span className="font-mono text-[11px] text-slate-400">ISO/IEC 30134-2</span>
              </div>

              {/* Semicircular Speedometer SVG Gauge */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center">
                <svg viewBox="0 0 260 150" className="w-full max-w-[260px] h-auto">
                  {/* Track Background */}
                  <path
                    d="M 30 125 A 100 100 0 0 1 230 125"
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="16"
                    strokeLinecap="round"
                  />
                  {/* Zone 1: Optimal (<1.40 => 0 to 40 deg from left, i.e. 26.7% of 180 deg = 48 deg) */}
                  <path
                    d="M 30 125 A 100 100 0 0 1 63.1 50.7"
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="16"
                    strokeLinecap="butt"
                  />
                  {/* Zone 2: Moderate (1.40 - 1.80 => 48 deg to 96 deg) */}
                  <path
                    d="M 63.1 50.7 A 100 100 0 0 1 140.5 25.5"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="16"
                    strokeLinecap="butt"
                  />
                  {/* Zone 3: Critical (>1.80 => 96 deg to 180 deg) */}
                  <path
                    d="M 140.5 25.5 A 100 100 0 0 1 230 125"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="16"
                    strokeLinecap="butt"
                  />

                  {/* Scale Labels */}
                  <text x="24" y="142" fill="#94a3b8" fontSize="10" fontFamily="JetBrains Mono, monospace">
                    1.00
                  </text>
                  <text x="54" y="42" fill="#10b981" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="end">
                    1.40
                  </text>
                  <text x="145" y="16" fill="#f59e0b" fontSize="9" fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                    1.80
                  </text>
                  <text x="236" y="142" fill="#94a3b8" fontSize="10" fontFamily="JetBrains Mono, monospace" textAnchor="end">
                    2.50+
                  </text>

                  {/* Rotating Needle */}
                  <g transform={`translate(130, 125) rotate(${needleAngleDeg})`}>
                    <polygon points="-3.5,0 0,-86 3.5,0" fill="#f8fafc" />
                    <circle cx="0" cy="0" r="7" fill="#22d3ee" stroke="#020617" strokeWidth="2" />
                  </g>
                </svg>

                <div className="flex items-baseline gap-4 -mt-1">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400">PUE</div>
                    <div
                      className={`font-mono text-2xl font-bold ${
                        kpis.pueStatus === 'optimal'
                          ? 'text-emerald-400'
                          : kpis.pueStatus === 'moderate'
                          ? 'text-amber-400'
                          : kpis.pueStatus === 'critical'
                          ? 'text-red-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {kpis.pue > 0 ? kpis.pue.toFixed(2) : '—'}
                    </div>
                  </div>
                  <div className="h-7 w-px bg-slate-800" />
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400">DCiE (1 / PUE)</div>
                    <div className="font-mono text-xl font-bold text-cyan-300">
                      {kpis.dciePct > 0 ? `${kpis.dciePct.toFixed(1)}%` : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Live PUE Equation */}
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1.5">
                <div className="text-[11px] font-semibold text-cyan-400">
                  Ecuación ISO/IEC 30134-2 en Vivo
                </div>
                <div className="font-mono text-[11px] text-slate-300 leading-relaxed">
                  PUE = ({kpis.totalItKw.toFixed(1)} IT +{' '}
                  {(kpis.cracElectricalKw + kpis.thermalPenaltyKw).toFixed(1)} Clima +{' '}
                  {electricalLossKw.toFixed(1)} SAI/PDU +{' '}
                  {kpis.lightingEnvelopeKw.toFixed(2)} Ilum) / {kpis.totalItKw.toFixed(1)}
                </div>
                <div className="font-mono text-xs font-bold text-slate-100">
                  = {kpis.totalFacilityKw.toFixed(2)} kW totales / {kpis.totalItKw.toFixed(2)} kW IT ={' '}
                  <span className="text-cyan-300">{kpis.pue > 0 ? kpis.pue.toFixed(3) : '—'}</span>
                </div>
              </div>
            </div>

            {/* Annual Energy, Cost in EUR & CO2 Footprint */}
            <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="energy-price-eur"
                  className="text-xs font-medium text-slate-300 flex items-center gap-1.5"
                >
                  <Euro className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tarifa Eléctrica (€/kWh):</span>
                </label>
                <input
                  id="energy-price-eur"
                  type="number"
                  min={0.01}
                  max={2}
                  step={0.01}
                  value={thermalConfig.energyPriceEurKwh}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    onUpdateThermalConfig({
                      energyPriceEurKwh: Number.isFinite(v) ? Math.max(0, v) : 0.16,
                    });
                  }}
                  className="w-24 px-2 py-1 text-right font-mono text-xs bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-xs">
                <div>
                  <div className="text-[10px] text-slate-400">Energía Anual</div>
                  <div className="font-mono font-semibold text-slate-100 mt-0.5">
                    {Math.round(annualKwh).toLocaleString('es-ES')} kWh
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400">Coste Anual</div>
                  <div className="font-mono font-semibold text-amber-300 mt-0.5">
                    {Math.round(annualCostEur).toLocaleString('es-ES')} €
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Leaf className="w-3 h-3 text-emerald-400" />
                    <span>Huella CO₂</span>
                  </div>
                  <div className="font-mono font-semibold text-emerald-400 mt-0.5">
                    {annualCo2Tonnes.toFixed(1)} t/año
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 font-mono">
                Sobrecoste de infraestructura (no-IT):{' '}
                <span className="text-amber-300">
                  {Math.round(annualOverheadCostEur).toLocaleString('es-ES')} €/año
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
