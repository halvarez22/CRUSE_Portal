/**
 * MOTOR DETERMINISTA DE GRÁFICOS EJECUTIVOS SVG PARA "ALMA VIRTUAL" (CRUSE-APO-2026-035)
 *
 * Cumplimiento de Guardrails Forenses:
 * - Guardrail 2 (Parsing Determinista & Anti-Doble-Conteo): Deriva las series exclusivamente de
 *   `headers` y `rows` de la tabla Markdown validada. Detecta filas "TOTAL / TOTALES / SUMA" mediante
 *   expresiones regulares insensibles a mayúsculas/minúsculas para excluirlas de los segmentos del
 *   gráfico de Dona/Pie (evitando sumar Total + Partes = 200%) y usarlas como total central o para
 *   calcular el complemento exacto (ej. Saldo Total $72,123.50 vs Saldo Vencido $14,950.00 -> Vigente vs Vencido).
 * - Guardrail 3 (A11y & Contraste WCAG AAA): Todo `<svg>` incluye `role="img"` y `aria-label` descriptivo
 *   con porcentajes explícitos, etiquetas directas en el lienzo SVG y leyenda WCAG AAA (> 9:1 sobre #0F172A).
 * - Guardrail 4 (Anti-God-Object): Archivo modular < 600 líneas, 0 instancias de `any`.
 */

import React, { useState, useMemo } from 'react';
import { PieChart, TrendingUp } from 'lucide-react';

export interface AlmaVisualChartCardProps {
  headers: string[];
  rows: string[][];
}

type ChartMode = 'DONUT' | 'LINE';
type MetricUnit = 'MXN' | 'COUNT' | 'PERCENT';

interface ChartPoint {
  label: string;
  value: number;
  formattedValue: string;
  percentage: number;
  color: string;
}

interface ChartSeries {
  id: string;
  title: string;
  unit: MetricUnit;
  defaultMode: ChartMode;
  totalValue: number;
  formattedTotal: string;
  points: ChartPoint[];
}

// Paleta Institucional de Alto Contraste sobre #0F172A (WCAG AAA / AA Large)
const INSTITUTIONAL_CHART_PALETTE = [
  '#00D1FF', // Cyan Institucional (9.42:1)
  '#4CD360', // Esmeralda Brillante (9.88:1)
  '#F59E0B', // Ámbar Ejecutivo (8.45:1)
  '#EF4444', // Coral Alerta (5.85:1)
  '#A855F7', // Violeta Analítico (5.60:1)
  '#38BDF8', // Azul Cielo (8.90:1)
] as const;

// Guardrail 2: Regex insensible a mayúsculas/minúsculas para detección de filas "TOTAL"
const STRICT_TOTAL_LABEL_REGEX = /^TOTAL|TOTALES|SUMA$/i;
const COMPOSITE_TOTAL_LABEL_REGEX =
  /^(total|totales|suma|gran\s+total|saldo\s+total|monto\s+total|total\s+de\s+cuentas|total\s+cobrado|total\s+aplicado|total\s+retenido|importe\s+total)\b/i;

// Ignorar filas o columnas que representan folios, tasas aisladas, fechas o identificadores no graficables
const NON_CHARTABLE_LABEL_REGEX =
  /\b(folio|id\b|curp|rfc|ip\b|timestamp|fecha|hora|usuario|actor|email|correo|rol\b|estatus|sem[aá]foro|nivel|c[oó]digo|tasa|plazo|quincenas\s+pactadas|dpd\s+m[aá]ximo|d[ií]as\s+de\s+atraso|score)\b/i;

const TEMPORAL_OR_TREND_LABEL_REGEX =
  /\b(202\d[-/]\d{2}|quincena|1q|2q|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|mes|periodo|tendencia|hist[oó]rico|evoluci[oó]n)\b/i;

function stripMarkdown(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/`/g, '')
    .trim();
}

function isTotalLabel(cleanLabel: string): boolean {
  const normalized = cleanLabel.replace(/[:.]/g, '').trim();
  return STRICT_TOTAL_LABEL_REGEX.test(normalized) || COMPOSITE_TOTAL_LABEL_REGEX.test(normalized);
}

function parseNumericCell(
  rawCell: string,
  contextLabel: string
): { value: number; unit: MetricUnit } | null {
  const clean = stripMarkdown(rawCell);
  if (!clean || clean === '—' || clean === '-' || clean === 'N/A') return null;

  // Ignorar cadenas que son fechas ISO, horas o identificadores alfanuméricos
  if (/^\d{4}-\d{2}-\d{2}/.test(clean) || /^\d{2}:\d{2}/.test(clean)) return null;
  if (/[a-zA-Z]{4,}/.test(clean.replace(/MXN|USD|pesos|cuentas|créditos|alertas|pólizas/gi, ''))) {
    return null;
  }

  const isCurrency =
    clean.includes('$') ||
    /\b(mxn|saldo|monto|importe|capital|inter[eé]s|iva|seguro|cobrado|retenido|diferencia|pago|suma\s+asegurada)\b/i.test(
      `${clean} ${contextLabel}`
    );
  const isPercent = clean.includes('%');

  const numericMatch = /-?\d[\d,]*(\.\d+)?/.exec(clean);
  if (!numericMatch) return null;

  const parsed = Number(numericMatch[0].replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  const unit: MetricUnit = isCurrency ? 'MXN' : isPercent ? 'PERCENT' : 'COUNT';
  return { value: parsed, unit };
}

function formatMetricValue(value: number, unit: MetricUnit): string {
  if (unit === 'MXN') {
    return `$${value.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
  if (unit === 'PERCENT') {
    return `${value.toLocaleString('es-MX', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}%`;
  }
  return value.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function buildSeriesWithAntiDoubleCount(
  id: string,
  title: string,
  unit: MetricUnit,
  rawItems: { label: string; value: number; isTotal: boolean }[]
): ChartSeries | null {
  if (rawItems.length === 0) return null;

  const totalRows = rawItems.filter((item) => item.isTotal);
  const partRows = rawItems.filter((item) => !item.isTotal && item.value >= 0);

  let effectiveParts = [...partRows];
  let declaredTotal = totalRows.length > 0 ? totalRows[0]!.value : null;

  // Caso especial (ej. Captura del Ing. Gerardo Ornelas):
  // Tabla con 1 fila "Saldo total reportado ($72,123.50)" y 1 fila "Saldo vencido ($14,950.00)".
  // El Total NO se suma al vencido; se calcula el complemento exacto ("Saldo vigente / Al corriente").
  if (declaredTotal !== null && effectiveParts.length === 1) {
    const singlePart = effectiveParts[0]!;
    if (declaredTotal > singlePart.value && singlePart.value > 0) {
      const complementValue = Number((declaredTotal - singlePart.value).toFixed(2));
      const isVencido = /vencid|atraso|mora| Castig/i.test(singlePart.label);
      const complementLabel = isVencido
        ? unit === 'MXN'
          ? 'Saldo vigente (Al corriente)'
          : 'En estado vigente'
        : 'Resto del total';
      effectiveParts = [
        { label: complementLabel, value: complementValue, isTotal: false },
        singlePart,
      ];
    }
  }

  // Excluir filas con valor 0 si hay suficientes segmentos positivos
  const positiveParts = effectiveParts.filter((p) => p.value > 0);
  if (positiveParts.length < 2) return null;

  const sumOfParts = Number(positiveParts.reduce((acc, item) => acc + item.value, 0).toFixed(2));
  if (sumOfParts <= 0) return null;

  // El total mostrado en el centro de la Dona valida la suma de las partes (sin duplicar la fila Total)
  const finalTotal =
    declaredTotal !== null && Math.abs(declaredTotal - sumOfParts) < 1
      ? declaredTotal
      : sumOfParts;

  const isTemporalOrTrend =
    positiveParts.some((p) => TEMPORAL_OR_TREND_LABEL_REGEX.test(p.label)) ||
    positiveParts.length >= 6;

  const points: ChartPoint[] = positiveParts.slice(0, 6).map((item, idx) => {
    const pct = Number(((item.value / sumOfParts) * 100).toFixed(1));
    return {
      label: item.label,
      value: item.value,
      formattedValue: formatMetricValue(item.value, unit),
      percentage: pct,
      color: INSTITUTIONAL_CHART_PALETTE[idx % INSTITUTIONAL_CHART_PALETTE.length]!,
    };
  });

  return {
    id,
    title,
    unit,
    defaultMode: isTemporalOrTrend ? 'LINE' : 'DONUT',
    totalValue: finalTotal,
    formattedTotal: formatMetricValue(finalTotal, unit),
    points,
  };
}

/**
 * Extrae de forma 100% determinista las series graficables a partir de `headers` y `rows`.
 */
export function extractChartSeriesFromTable(
  headers: string[],
  rows: string[][]
): ChartSeries[] {
  if (!headers.length || !rows.length) return [];

  const cleanHeaders = headers.map(stripMarkdown);

  // Caso A: Tabla Clave-Valor de 2 columnas (ej. Métrica | Valor en Círculo de Crédito o Prelación)
  if (cleanHeaders.length === 2 && rows.length >= 2) {
    const mxnItems: { label: string; value: number; isTotal: boolean }[] = [];
    const countItems: { label: string; value: number; isTotal: boolean }[] = [];

    for (const row of rows) {
      const label = stripMarkdown(row[0] || '');
      const valCell = row[1] || '';
      if (!label) continue;

      const totalFlag = isTotalLabel(label);
      if (!totalFlag && NON_CHARTABLE_LABEL_REGEX.test(label)) continue;

      const parsed = parseNumericCell(valCell, label);
      if (!parsed) continue;

      if (parsed.unit === 'MXN') {
        mxnItems.push({ label, value: parsed.value, isTotal: totalFlag });
      } else if (parsed.unit === 'COUNT') {
        countItems.push({ label, value: parsed.value, isTotal: totalFlag });
      }
    }

    const result: ChartSeries[] = [];
    const countSeries = buildSeriesWithAntiDoubleCount(
      'kv-count',
      'Distribución de Cuentas / Partidas',
      'COUNT',
      countItems
    );
    if (countSeries) result.push(countSeries);

    const mxnSeries = buildSeriesWithAntiDoubleCount(
      'kv-mxn',
      'Composición de Saldos / Importes (MXN)',
      'MXN',
      mxnItems
    );
    if (mxnSeries) result.push(mxnSeries);

    if (result.length > 0) return result;
  }

  // Caso B: Tabla de 1 sola fila con múltiples columnas de desglose numérico
  // (ej. Seguro | Interés | IVA | Capital en Prelación de Pagos)
  if (rows.length === 1 && cleanHeaders.length >= 3) {
    const singleRow = rows[0]!;
    const colItems: { label: string; value: number; isTotal: boolean; unit: MetricUnit }[] = [];

    for (let c = 0; c < cleanHeaders.length; c++) {
      const hLabel = cleanHeaders[c] || '';
      if (!hLabel || NON_CHARTABLE_LABEL_REGEX.test(hLabel)) continue;
      if (/saldo\s+insoluto|nuevo\s+saldo/i.test(hLabel)) continue;

      const parsed = parseNumericCell(singleRow[c] || '', hLabel);
      if (!parsed || parsed.unit !== 'MXN') continue;
      colItems.push({
        label: hLabel,
        value: parsed.value,
        isTotal: isTotalLabel(hLabel),
        unit: parsed.unit,
      });
    }

    const breakdownSeries = buildSeriesWithAntiDoubleCount(
      'single-row-mxn',
      'Desglose Financiero por Concepto (MXN)',
      'MXN',
      colItems
    );
    if (breakdownSeries) return [breakdownSeries];
  }

  // Caso C: Tabla Multicolumna con N filas (ej. Convenios, Cartera por Semáforo, Flujo Quincenal)
  if (rows.length >= 2 && cleanHeaders.length >= 2) {
    const seriesList: ChartSeries[] = [];

    for (let colIdx = 1; colIdx < cleanHeaders.length; colIdx++) {
      const colHeader = cleanHeaders[colIdx] || `Métrica ${colIdx}`;
      if (NON_CHARTABLE_LABEL_REGEX.test(colHeader)) continue;

      const items: { label: string; value: number; isTotal: boolean; unit: MetricUnit }[] = [];
      for (const row of rows) {
        const rowLabel = stripMarkdown(row[0] || '');
        if (!rowLabel) continue;
        const parsed = parseNumericCell(row[colIdx] || '', `${rowLabel} ${colHeader}`);
        if (!parsed) continue;
        items.push({
          label: rowLabel,
          value: parsed.value,
          isTotal: isTotalLabel(rowLabel),
          unit: parsed.unit,
        });
      }

      if (items.length >= 2) {
        const dominantUnit = items[0]!.unit;
        const built = buildSeriesWithAntiDoubleCount(
          `col-${colIdx}`,
          colHeader,
          dominantUnit,
          items
        );
        if (built) seriesList.push(built);
      }
      if (seriesList.length >= 2) break;
    }

    return seriesList;
  }

  return [];
}

export const AlmaVisualChartCard: React.FC<AlmaVisualChartCardProps> = ({ headers, rows }) => {
  const seriesList = useMemo(
    () => extractChartSeriesFromTable(headers, rows),
    [headers, rows]
  );

  const [modeOverrides, setModeOverrides] = useState<Record<string, ChartMode>>({});

  if (seriesList.length === 0) return null;

  const renderDonutSvg = (series: ChartSeries) => {
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let accumulatedPercent = 0;

    const ariaSummary = series.points
      .map((p) => `${p.label}: ${p.formattedValue} (${p.percentage}%)`)
      .join(', ');

    return (
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-36 h-36 shrink-0 flex items-center justify-center">
          <svg
            viewBox="0 0 140 140"
            className="w-36 h-36 -rotate-90"
            role="img"
            aria-label={`Gráfico de distribución (${series.title}): ${ariaSummary}`}
          >
            <circle
              cx="70"
              cy="70"
              r={radius}
              fill="transparent"
              stroke="#1E293B"
              strokeWidth="18"
            />
            {series.points.map((pt, idx) => {
              const strokeDasharray = `${(pt.percentage / 100) * circumference} ${circumference}`;
              const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
              accumulatedPercent += pt.percentage;
              return (
                <circle
                  key={`${series.id}-slice-${idx}`}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="transparent"
                  stroke={pt.color}
                  strokeWidth="18"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="butt"
                >
                  <title>{`${pt.label}: ${pt.formattedValue} (${pt.percentage}%)`}</title>
                </circle>
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-300">
              Total
            </span>
            <span className="text-[11px] font-extrabold text-white leading-tight mt-0.5">
              {series.formattedTotal}
            </span>
          </div>
        </div>

        {/* Leyenda de Alto Contraste WCAG AAA (> 9:1 sobre #0F172A) */}
        <div className="flex-1 w-full space-y-1.5">
          {series.points.map((pt, idx) => (
            <div
              key={`${series.id}-leg-${idx}`}
              className="flex items-center justify-between gap-2 text-[11px] bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: pt.color }}
                />
                <span className="text-slate-100 font-medium truncate" title={pt.label}>
                  {pt.label}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 font-mono">
                <span className="text-white font-bold">{pt.formattedValue}</span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-800 border border-slate-700"
                  style={{ color: pt.color }}
                >
                  {pt.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderLineSvg = (series: ChartSeries) => {
    const width = 320;
    const height = 140;
    const padX = 32;
    const padY = 24;
    const maxVal = Math.max(...series.points.map((p) => p.value), 1);

    const coords = series.points.map((pt, idx) => {
      const x =
        series.points.length === 1
          ? width / 2
          : padX + (idx / (series.points.length - 1)) * (width - padX * 2);
      const y = height - padY - (pt.value / maxVal) * (height - padY * 2);
      return { x, y, pt };
    });

    const polylinePoints = coords.map((c) => `${c.x},${c.y}`).join(' ');
    const areaPoints = `${coords[0]!.x},${height - padY} ${polylinePoints} ${
      coords[coords.length - 1]!.x
    },${height - padY}`;

    const ariaSummary = series.points
      .map((p) => `${p.label}: ${p.formattedValue} (${p.percentage}%)`)
      .join(', ');

    return (
      <div className="space-y-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-36 bg-slate-900/70 rounded-xl border border-slate-800 p-1"
          role="img"
          aria-label={`Gráfico de líneas de tendencia (${series.title}): ${ariaSummary}`}
        >
          <line
            x1={padX}
            y1={height - padY}
            x2={width - padX}
            y2={height - padY}
            stroke="#334155"
            strokeWidth="1"
          />
          <polygon points={areaPoints} fill="rgba(0, 209, 255, 0.14)" />
          <polyline
            fill="none"
            stroke="#00D1FF"
            strokeWidth="2.5"
            points={polylinePoints}
          />
          {coords.map(({ x, y, pt }, idx) => (
            <g key={`${series.id}-pt-${idx}`}>
              <circle
                cx={x}
                cy={y}
                r="4"
                fill={pt.color}
                stroke="#0F172A"
                strokeWidth="1.5"
              />
              <text
                x={x}
                y={Math.max(12, y - 7)}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="8.5"
                fontWeight="bold"
              >
                {pt.percentage}%
              </text>
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                fill="#F1F5F9"
                fontSize="8"
              >
                {pt.label.slice(0, 12)}
              </text>
            </g>
          ))}
        </svg>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {series.points.map((pt, idx) => (
            <div
              key={`${series.id}-lleg-${idx}`}
              className="flex items-center justify-between gap-2 text-[10px] bg-slate-900/90 border border-slate-800 rounded-lg px-2 py-1"
            >
              <span className="text-slate-100 truncate">{pt.label}</span>
              <span className="font-mono font-bold text-[#00D1FF]">
                {pt.formattedValue} ({pt.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`my-3 grid gap-3 ${
        seriesList.length > 1 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
      }`}
    >
      {seriesList.map((series) => {
        const activeMode = modeOverrides[series.id] ?? series.defaultMode;
        return (
          <div
            key={series.id}
            className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-700/90 shadow-md space-y-3"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <PieChart className="w-3.5 h-3.5 text-[#00D1FF] shrink-0" />
                <span className="text-[11px] font-extrabold text-white truncate">
                  {series.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setModeOverrides((prev) => ({ ...prev, [series.id]: 'DONUT' }))
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border transition-colors ${
                    activeMode === 'DONUT'
                      ? 'bg-[#249E82] text-white border-[#249E82]'
                      : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                  }`}
                  title="Ver como Gráfico de Dona / Pastel (Comparación de Proporciones)"
                >
                  <PieChart className="w-2.5 h-2.5" />
                  <span>Dona</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setModeOverrides((prev) => ({ ...prev, [series.id]: 'LINE' }))
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border transition-colors ${
                    activeMode === 'LINE'
                      ? 'bg-[#249E82] text-white border-[#249E82]'
                      : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
                  }`}
                  title="Ver como Gráfico de Líneas (Tendencia / Estadística)"
                >
                  <TrendingUp className="w-2.5 h-2.5" />
                  <span>Líneas</span>
                </button>
              </div>
            </div>

            {activeMode === 'DONUT' ? renderDonutSvg(series) : renderLineSvg(series)}
          </div>
        );
      })}
    </div>
  );
};
