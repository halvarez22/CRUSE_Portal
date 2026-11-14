import React, { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  FileCode2,
  ShieldCheck,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Network,
  Lock,
} from 'lucide-react';
import {
  AuthSession,
  LayoutFormatType,
  OperationsHubRegionFilter,
  OperationsIntegrationHubOverview,
} from '../../types';

interface OperationsAndIntegrationHubViewProps {
  session: AuthSession;
}

const HUB_FILTERS: ReadonlyArray<{ id: OperationsHubRegionFilter; label: string }> = [
  { id: 'ALL', label: 'Nacional (3 Hubs)' },
  { id: 'CHIHUAHUA', label: 'Hub CHIHUAHUA' },
  { id: 'LEON', label: 'Hub LEON' },
  { id: 'CANCUN', label: 'Hub CANCUN' },
];

export const OperationsAndIntegrationHubView: React.FC<OperationsAndIntegrationHubViewProps> = ({
  session,
}) => {
  const [selectedHub, setSelectedHub] = useState<OperationsHubRegionFilter>('ALL');
  const [overview, setOverview] = useState<OperationsIntegrationHubOverview | null>(null);
  const [loading, setLoading] = useState(false);

  const [connectorCode, setConnectorCode] = useState('CONN-STJ-CHIH');
  const [layoutFormat, setLayoutFormat] = useState<LayoutFormatType>('FIXED_WIDTH_TXT');
  const [periodCode, setPeriodCode] = useState('2026-Q22');
  const [inboundContent, setInboundContent] = useState('');
  const [declaredTotalMxn, setDeclaredTotalMxn] = useState('5312.51');
  const [lastGeneratedTxt, setLastGeneratedTxt] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const fetchOverview = useCallback(
    async (hub: OperationsHubRegionFilter) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/integration-hub/overview?hub=${hub}`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOverview(data as OperationsIntegrationHubOverview);
          if (!inboundContent && data.sampleInbound60CharTxt) {
            setInboundContent(String(data.sampleInbound60CharTxt));
            setDeclaredTotalMxn(String(data.sampleInboundDeclaredTotalMxn || '5312.51'));
          }
        }
      } catch {
        setFeedback({ type: 'err', text: 'Error al consultar el Tablero Web de Operaciones.' });
      } finally {
        setLoading(false);
      }
    },
    [inboundContent, session.token]
  );

  useEffect(() => {
    void fetchOverview(selectedHub);
  }, [fetchOverview, selectedHub]);

  const handleGenerateOutbound = async () => {
    setFeedback(null);
    try {
      const res = await fetch('/api/integration-hub/generate-outbound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ connectorCode, layoutFormat, periodCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Error al generar layout.' });
        return;
      }
      if (data.overview) setOverview(data.overview as OperationsIntegrationHubOverview);
      if (data.exchange?.generatedLayoutContent) {
        setLastGeneratedTxt(String(data.exchange.generatedLayoutContent));
      }
      setFeedback({
        type: 'ok',
        text: `✅ Layout saliente ${data.exchange?.batchFolio} (${layoutFormat}) generado y sellado ($${data.exchange?.verifiedTotalMxn} MXN).`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Fallo de red al generar layout institucional.' });
    }
  };

  const handleIngestInbound = async () => {
    setFeedback(null);
    try {
      const res = await fetch('/api/integration-hub/ingest-inbound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          connectorCode,
          layoutFormat,
          periodCode,
          rawLayoutContent: inboundContent,
          declaredTotalMxn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'err', text: data.error || 'Error al validar layout entrante.' });
        return;
      }
      if (data.overview) setOverview(data.overview as OperationsIntegrationHubOverview);
      const ex = data.exchange;
      setFeedback({
        type: ex?.status === 'ABORTED_DISCREPANCY' ? 'err' : 'ok',
        text: `📥 Lote ${ex?.batchFolio} (${ex?.status}): ${ex?.validRowsCount} filas válidas procesadas ($${ex?.verifiedTotalMxn} MXN) y ${ex?.rejectedRowsCount} línea(s) truncada(s) aislada(s) sin derribar el sistema.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Fallo al validar layout entrante.' });
    }
  };

  const handleTestConnector = async (code: string, simulateTamperedHmac: boolean) => {
    setFeedback(null);
    try {
      const res = await fetch('/api/integration-hub/test-connector', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ connectorCode: code, simulateTamperedHmac }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({
          type: 'err',
          text: `🛡️ Defensa Zero-Trust Activa: ${data.error}`,
        });
        return;
      }
      if (data.overview) setOverview(data.overview as OperationsIntegrationHubOverview);
      setFeedback({
        type: 'ok',
        text: `✅ Conector ${code} sincronizado con certificado mTLS + firma HMAC-SHA256 válida dentro de la ventana de 300s.`,
      });
    } catch {
      setFeedback({ type: 'err', text: 'Error probando conector Zero-Trust.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabecera Single Pane of Glass + Filtro por Hub Nacional */}
      <div className="p-5 rounded-3xl glass-panel border border-white/10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-cyan-500/20 border border-[#00D1FF]/40 text-[#00D1FF]">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white">
              Tablero Web de Operaciones Unificado (Single Pane of Glass) y Hub de Layouts (Fase 3.4)
            </h2>
            <p className="text-xs text-slate-300">
              Supervisión consolidada de Fases 1, 2 y 3 por Hub Nacional e intercambio de layouts con el Supremo Tribunal y Patrones.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {HUB_FILTERS.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setSelectedHub(h.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                selectedHub === h.id
                  ? 'bg-[#249E82] text-white shadow-lg shadow-[#249E82]/30'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 3 Megatarjetas Single Pane of Glass (Fase 1, Fase 2 y Fase 3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl glass-card border border-emerald-500/30 space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
            Fase 1 · Cartera y Colocación ({selectedHub})
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-slate-400 block">Créditos Activos</span>
              <span className="text-lg font-black text-white">{overview?.phase1.activeLoansCount ?? 0}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Índice Congelados</span>
              <span className="text-lg font-black text-amber-300">
                {overview?.phase1.frozenRatioPercent ?? '0.00'}%
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Capital Original</span>
              <span className="font-mono font-bold text-slate-200">
                ${overview?.phase1.totalOriginalPrincipalMxn ?? '0.00'}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Saldo Vivo Actual</span>
              <span className="font-mono font-bold text-emerald-400">
                ${overview?.phase1.totalLiveBalanceMxn ?? '0.00'}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-[#00D1FF]/30 space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#00D1FF]">
            Fase 2 · Cumplimiento PLD/FT, OCR & Buzón
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-slate-400 block">Pre-Solicitudes (No leídas)</span>
              <span className="text-lg font-black text-white">
                {overview?.phase2.totalPreApplicationsCount ?? 0}{' '}
                <span className="text-xs text-[#00D1FF]">
                  ({overview?.phase2.unreadPreApplicationsCount ?? 0} nuevas)
                </span>
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Alertas PLD Pendientes</span>
              <span className="text-lg font-black text-amber-300">
                {overview?.phase2.pendingPldAlertsCount ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Bloqueos UIF / 69-B</span>
              <span className="font-mono font-bold text-rose-400">
                {overview?.phase2.confirmedPldBlocksCount ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Evaluaciones Scoring IA</span>
              <span className="font-mono font-bold text-emerald-400">
                {overview?.phase2.aiScoringEvaluationsCount ?? 0}
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-card border border-[#D4AF37]/30 space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#D4AF37]">
            Fase 3 · Ecosistema Fintech Digital
          </span>
          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div>
              <span className="text-slate-400 block">Expedientes App Cruse</span>
              <span className="text-lg font-black text-white">
                {overview?.phase3.selfServiceExpedientesCount ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Contratos Firmados NOM-151</span>
              <span className="text-lg font-black text-emerald-400">
                {overview?.phase3.nom151SignedContractsCount ?? 0}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Cartera Migrada Nube</span>
              <span className="font-mono font-bold text-[#00D1FF]">
                {overview?.phase3.cloudMigratedContractsCount ?? 0} contratos
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Lotes Layouts Sellados</span>
              <span className="font-mono font-bold text-amber-300">
                {overview?.phase3.layoutExchangesCount ?? 0} lotes
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hub de Integración por Layouts Institucionales (.TXT 60 chars / .CSV Pipe) */}
      <div className="p-5 rounded-3xl glass-panel border border-white/10 space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <FileCode2 className="w-5 h-5 text-[#00D1FF]" />
            <h3 className="text-sm font-extrabold text-white">
              Hub de Integración por Layouts (Supremo Tribunal y Patrones de Nómina)
            </h3>
          </div>
          {loading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="block font-bold text-slate-300 mb-1">Conector Institucional</label>
            <select
              value={connectorCode}
              onChange={(e) => setConnectorCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              <option value="CONN-STJ-CHIH">CONN-STJ-CHIH — Supremo Tribunal Chihuahua</option>
              <option value="CONN-STSGECH-NOM">CONN-STSGECH-NOM — Sindicato STSGECH</option>
              <option value="CONN-PJ-GTO-LEON">CONN-PJ-GTO-LEON — Poder Judicial Guanajuato</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-300 mb-1">Formato de Archivo</label>
            <select
              value={layoutFormat}
              onChange={(e) => setLayoutFormat(e.target.value as LayoutFormatType)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white"
            >
              <option value="FIXED_WIDTH_TXT">FIXED_WIDTH_TXT (Ancho Fijo 60 chars)</option>
              <option value="CSV_PIPE">CSV_PIPE (Delimitado por |)</option>
            </select>
          </div>
          <div>
            <label className="block font-bold text-slate-300 mb-1">Periodo Quincenal</label>
            <input
              type="text"
              value={periodCode}
              onChange={(e) => setPeriodCode(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void handleGenerateOutbound()}
              className="w-full px-4 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white font-extrabold flex items-center justify-center gap-1.5 shadow transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Generar Layout Saliente</span>
            </button>
          </div>
        </div>

        {lastGeneratedTxt && (
          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/30 font-mono text-[11px] text-emerald-300 whitespace-pre overflow-x-auto">
            {lastGeneratedTxt}
          </div>
        )}

        {/* Ingesta Entrante con Aislamiento de Líneas Truncadas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2 border-t border-white/10">
          <div className="lg:col-span-2">
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Contenido del Layout Entrante de Respuesta (Incluye fila #3 truncada de prueba para verificar aislamiento resiliente):
            </label>
            <textarea
              rows={4}
              value={inboundContent}
              onChange={(e) => setInboundContent(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-200"
            />
          </div>
          <div className="flex flex-col justify-between space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Total Control Declarado (MXN)
              </label>
              <input
                type="text"
                value={declaredTotalMxn}
                onChange={(e) => setDeclaredTotalMxn(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-emerald-400 font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleIngestInbound()}
              className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#396CAE] to-[#249E82] hover:opacity-95 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all"
            >
              <Upload className="w-4 h-4" />
              <span>Ingestar y Validar Layout Entrante</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Conectores Internos y Bus Zero-Trust */}
      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center gap-2">
          <Network className="w-4 h-4 text-emerald-400" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-white">
            Conectores Internos y Bus de Integración Zero-Trust (mTLS + HMAC-SHA256 + Ventana 300s)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 border-b border-white/10 text-slate-400 text-[10px] uppercase font-mono">
              <tr>
                <th className="py-3 px-4">Conector / Institución</th>
                <th className="py-3 px-4">Hub</th>
                <th className="py-3 px-4">Formato / Transporte</th>
                <th className="py-3 px-4">Sincronizaciones</th>
                <th className="py-3 px-4 text-right">Pruebas de Defensa Zero-Trust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(overview?.connectors ?? []).map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4">
                    <div className="font-mono font-bold text-[#00D1FF]">{c.connectorCode}</div>
                    <div className="text-slate-200 font-semibold">{c.displayName}</div>
                  </td>
                  <td className="py-3 px-4 font-bold text-emerald-300">{c.hubRegion}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-300">
                    {c.defaultLayoutFormat} · {c.transportMode}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-white">
                    {c.totalExchangesCount}
                  </td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => void handleTestConnector(c.connectorCode, false)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Sync HMAC Válido</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleTestConnector(c.connectorCode, true)}
                      className="px-3 py-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-[11px] font-bold inline-flex items-center gap-1"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Simular Firma Alterada</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
