import React, { useState } from 'react';
import {
  Lock,
  Upload,
  Download,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  FileSpreadsheet,
  SlidersHorizontal,
} from 'lucide-react';
import { AuthSession, PldListType } from '../../types';
import {
  ALLOWED_PLD_COLUMN_ROLES,
  CanonicalPldColumnRole,
  PldColumnMappingOverride,
  SmartPldFileAnalysisResult,
} from '../../types/pldSmartIngestion';
import { PLD_COLUMN_ROLE_LABELS } from '../../data/cruseData';
import {
  downloadOfficialPldTemplateCsv,
  downloadOfficialPldTemplateXlsx,
  PreparedClientWatchlistPayload,
  prepareUploadedWatchlistBrowserFile,
  XlsxDynamicImportError,
} from '../../utils/pldWatchlistClientHelper';

interface PldWatchlistIngestionCardProps {
  session: AuthSession;
  listTypeLabels: Record<PldListType, string>;
  onIngestionCompleted: () => Promise<void>;
  onFeedback: (fb: { type: 'success' | 'error'; message: string } | null) => void;
}

export const PldWatchlistIngestionCard: React.FC<PldWatchlistIngestionCardProps> = ({
  session,
  listTypeLabels,
  onIngestionCompleted,
  onFeedback,
}) => {
  const [selectedListType, setSelectedListType] = useState<PldListType>('UIF_PERSONAS_BLOQUEADAS');
  const [officialReference, setOfficialReference] = useState('ACUERDO-UIF-LPB-2026');
  const [csvContent, setCsvContent] = useState('');
  const [preparedFile, setPreparedFile] = useState<PreparedClientWatchlistPayload | null>(null);
  const [analysis, setAnalysis] = useState<SmartPldFileAnalysisResult | null>(null);
  const [mappingOverride, setMappingOverride] = useState<Record<number, CanonicalPldColumnRole>>({});
  const [analyzing, setAnalyzing] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [jurisdictionIso2, setJurisdictionIso2] = useState('KP');
  const [jurisdictionName, setJurisdictionName] = useState('REPUBLICA POPULAR DEMOCRATICA DE COREA');
  const [sourceUrl, setSourceUrl] = useState('https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html');
  const [officialPubDate, setOfficialPubDate] = useState('2026-10-25');

  const isJurisdictionList =
    selectedListType === 'GAFI_HIGH_RISK_JURISDICTIONS' ||
    selectedListType === 'SHCP_REFIPRES_TAX_HAVENS';

  const buildMultipartOrJsonRequest = (
    targetCsv: string,
    fileMeta: PreparedClientWatchlistPayload | null,
    overrideObj: PldColumnMappingOverride
  ): { headers: Record<string, string>; body: FormData | string } => {
    if (fileMeta) {
      const form = new FormData();
      form.append(
        'file',
        new Blob([fileMeta.rawArrayBuffer], { type: 'application/octet-stream' }),
        fileMeta.fileName
      );
      form.append('originalFileSha256', fileMeta.originalFileSha256);
      form.append('csvContent', targetCsv);
      form.append('defaultListType', selectedListType);
      form.append('defaultOfficialReference', officialReference);
      form.append('fileExtensionHint', fileMeta.fileExtension);
      if (Object.keys(overrideObj).length > 0) {
        form.append('columnMappingOverride', JSON.stringify(overrideObj));
      }
      return {
        headers: { Authorization: `Bearer ${session.token}` },
        body: form,
      };
    }

    return {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        csvContent: targetCsv,
        defaultListType: selectedListType,
        defaultOfficialReference: officialReference,
        columnMappingOverride: Object.keys(overrideObj).length > 0 ? overrideObj : undefined,
      }),
    };
  };

  const runSmartAnalysis = async (
    targetCsv: string,
    fileMeta: PreparedClientWatchlistPayload | null,
    overrideObj: Record<number, CanonicalPldColumnRole>
  ) => {
    if (!targetCsv.trim()) {
      onFeedback({
        type: 'error',
        message: 'Selecciona o suelta un archivo (.xlsx, .csv, .txt, .xml, .json) o pega registros para analizar.',
      });
      return;
    }
    setAnalyzing(true);
    onFeedback(null);
    try {
      const reqInit = buildMultipartOrJsonRequest(targetCsv, fileMeta, overrideObj);
      const res = await fetch('/api/pld/lists/analyze', {
        method: 'POST',
        headers: reqInit.headers,
        body: reqInit.body,
      });
      const data = (await res.json()) as { analysis?: SmartPldFileAnalysisResult; error?: string };
      if (!res.ok || !data.analysis) {
        throw new Error(data.error || 'Error ejecutando análisis inteligente de layout');
      }
      setAnalysis(data.analysis);
    } catch (err: unknown) {
      setAnalysis(null);
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error analizando estructura de lista PLD/FT',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const processSelectedBrowserFile = async (file: File) => {
    onFeedback(null);
    setAnalyzing(true);
    try {
      const rawBuffer = await file.arrayBuffer();
      const prepared = await prepareUploadedWatchlistBrowserFile(file.name, rawBuffer);
      setPreparedFile(prepared);
      setCsvContent(prepared.normalizedCsvContent);
      setMappingOverride({});
      await runSmartAnalysis(prepared.normalizedCsvContent, prepared, {});
    } catch (err: unknown) {
      setAnalyzing(false);
      if (err instanceof XlsxDynamicImportError) {
        void fetch('/api/pld/lists/client-fault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ reason: err.diagnosticReason, fileName: file.name }),
        });
      }
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error leyendo archivo seleccionado',
      });
    }
  };

  const handleColumnRoleChange = async (colIdx: number, newRole: CanonicalPldColumnRole) => {
    const nextOverride = { ...mappingOverride, [colIdx]: newRole };
    setMappingOverride(nextOverride);
    await runSmartAnalysis(csvContent, preparedFile, nextOverride);
  };

  const handleIngestConfirmed = async () => {
    if (isJurisdictionList && !csvContent.trim()) {
      setIngestLoading(true);
      onFeedback(null);
      try {
        const res = await fetch('/api/pld/gafi-refipres', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({
            listType: selectedListType,
            jurisdictionIso3166Alpha2: jurisdictionIso2,
            jurisdictionName,
            sourceUrl,
            officialPublicationDate: officialPubDate,
            riskClassificationNote: `Alta Oficial ${selectedListType} (${officialReference})`,
          }),
        });
        const data = (await res.json()) as {
          item?: { jurisdictionIso3166Alpha2: string; recordSha256Hash: string; officialPublicationDate: string };
          error?: string;
        };
        if (!res.ok || !data.item) throw new Error(data.error || 'Error al ingerir jurisdicción GAFI/ReFiPres');
        onFeedback({
          type: 'success',
          message: `Jurisdicción ${data.item.jurisdictionIso3166Alpha2} ingerida en ${selectedListType} (Pub: ${data.item.officialPublicationDate}). Folio de Integridad: ${data.item.recordSha256Hash.slice(0, 16)}...`,
        });
        await onIngestionCompleted();
      } catch (err: unknown) {
        onFeedback({
          type: 'error',
          message: err instanceof Error ? err.message : 'Error registrando jurisdicción GAFI/ReFiPres',
        });
      } finally {
        setIngestLoading(false);
      }
      return;
    }

    if (!csvContent.trim()) {
      onFeedback({ type: 'error', message: 'Carga un archivo o ingresa registros antes de sellar en Registro Inmutable.' });
      return;
    }

    setIngestLoading(true);
    onFeedback(null);
    try {
      const reqInit = buildMultipartOrJsonRequest(csvContent, preparedFile, mappingOverride);
      const res = await fetch('/api/pld/lists/ingest', {
        method: 'POST',
        headers: reqInit.headers,
        body: reqInit.body,
      });
      const data = (await res.json()) as {
        sourceFileHash?: string;
        insertedCount?: number;
        skippedDuplicatesCount?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Error al sellar lista PLD/FT');
      onFeedback({
        type: 'success',
        message: `Lista oficial sellada en Registro Inmutable con Búsqueda Protegida (sin exponer datos) Zero-PII. Folio de Integridad Original: ${data.sourceFileHash?.slice(0, 16)}... | Nuevos: ${data.insertedCount ?? 0} | Omitidos idempotentes: ${data.skippedDuplicatesCount ?? 0}`,
      });
      setCsvContent('');
      setPreparedFile(null);
      setAnalysis(null);
      setMappingOverride({});
      await onIngestionCompleted();
    } catch (err: unknown) {
      onFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error validando o sellando lista PLD/FT',
      });
    } finally {
      setIngestLoading(false);
    }
  };

  return (
    <div className="p-6 rounded-3xl glass-panel border border-white/10 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-[#249E82]" />
          <h3 className="text-sm font-bold text-white">
            Ingesta Inteligente Universal de Listas Oficiales (LPB UIF / SAT 69-B / OFAC / PEPs)
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-[#00D1FF]/15 border border-[#00D1FF]/30 text-[#00D1FF] text-[10px] font-bold flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Auto-Descubrimiento IA Zero-PII
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadOfficialPldTemplateCsv(selectedListType)}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[11px] text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#00D1FF]" />
            <span>Plantilla .CSV</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              try {
                await downloadOfficialPldTemplateXlsx(selectedListType);
              } catch (err: unknown) {
                onFeedback({
                  type: 'error',
                  message: err instanceof Error ? err.message : 'Error generando plantilla Excel',
                });
              }
            }}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-[11px] text-slate-200 flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Plantilla .XLSX</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs text-slate-300 mb-1 font-semibold">Tipo de Lista Oficial</label>
          <select
            value={selectedListType}
            onChange={(e) => setSelectedListType(e.target.value as PldListType)}
            className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100 focus:outline-none"
          >
            {Object.entries(listTypeLabels).map(([k, label]) => (
              <option key={k} value={k} className="bg-slate-900 text-slate-100">{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-300 mb-1 font-semibold">Oficio / Acuerdo / Publicación DOF</label>
          <input
            type="text"
            value={officialReference}
            onChange={(e) => setOfficialReference(e.target.value)}
            className="w-full px-3 py-2 rounded-xl glass-input text-xs text-slate-100 focus:outline-none"
            placeholder="Ej. ACUERDO-UIF-LPB-2026 o DOF-SAT-69B"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-300 mb-1 font-semibold">
            Suelta Cualquier Archivo Oficial (Sin Importar Layout)
          </label>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void processSelectedBrowserFile(f);
            }}
            className={`w-full px-3 py-2 rounded-xl border text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
              dragActive
                ? 'bg-[#00D1FF]/15 border-[#00D1FF] text-white'
                : 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4 text-[#00D1FF]" />
            <span className="truncate">
              {preparedFile
                ? `${preparedFile.fileName}${preparedFile.selectedSheetName ? ` (${preparedFile.selectedSheetName})` : ''}`
                : 'Subir .XLSX, .CSV, .TXT, .XML o .JSON...'}
            </span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls,.xml,.json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void processSelectedBrowserFile(f);
              }}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {isJurisdictionList && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-2xl bg-slate-900/80 border border-[#00D1FF]/30 text-xs">
          <div>
            <label className="block text-[11px] text-[#00D1FF] mb-1 font-semibold">ISO 3166-1 Alpha-2</label>
            <input type="text" maxLength={2} value={jurisdictionIso2} onChange={(e) => setJurisdictionIso2(e.target.value.toUpperCase())} className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-white font-mono" />
          </div>
          <div>
            <label className="block text-[11px] text-[#00D1FF] mb-1 font-semibold">Jurisdicción / País</label>
            <input type="text" value={jurisdictionName} onChange={(e) => setJurisdictionName(e.target.value)} className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="block text-[11px] text-[#00D1FF] mb-1 font-semibold">URL Fuente Oficial (GAFI / DOF)</label>
            <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-white font-mono" />
          </div>
          <div>
            <label className="block text-[11px] text-[#00D1FF] mb-1 font-semibold">Fecha Publicación Oficial</label>
            <input type="date" value={officialPubDate} onChange={(e) => setOfficialPubDate(e.target.value)} className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-white/15 text-white font-mono" />
          </div>
        </div>
      )}

      <textarea
        rows={3}
        value={csvContent}
        onChange={(e) => {
          setCsvContent(e.target.value);
          setPreparedFile(null);
        }}
        placeholder={'Pega registros en cualquier orden o sube tu Excel/CSV/TXT/XML oficial de SITI o SAT sin editarlo...'}
        className="w-full p-3 rounded-xl glass-input text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none"
      />

      {analyzing && (
        <div className="p-4 rounded-2xl bg-[#00D1FF]/10 border border-[#00D1FF]/30 flex items-center gap-3 text-xs text-[#00D1FF]">
          <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
          <span>Escaneando estructura documental, patrones RENAPO/SAT e inferencia semántica Zero-PII...</span>
        </div>
      )}

      {analysis && !analyzing && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-500/30 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">Radiografía Inteligente del Archivo</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-mono">
                Confianza: {analysis.overallConfidencePct}%
              </span>
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-slate-300 text-[10px] font-mono">
                Folio de Integridad: {analysis.sourceFileHash.slice(0, 16)}...
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#00D1FF]" />
              Puedes ajustar cualquier columna antes de sellar
            </span>
          </div>

          <p className="text-xs text-slate-200 leading-relaxed">{analysis.humanFriendlyExplanation}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {analysis.columns.map((col) => (
              <div key={col.columnIndex} className="p-2.5 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-white truncate max-w-[170px]" title={col.rawHeaderLabel}>
                    {col.rawHeaderLabel}
                  </span>
                  <span className="font-mono text-[10px] text-emerald-400">{col.confidencePct}%</span>
                </div>
                <select
                  value={col.assignedRole}
                  onChange={(e) => void handleColumnRoleChange(col.columnIndex, e.target.value as CanonicalPldColumnRole)}
                  className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-white/15 text-[11px] text-[#00D1FF] font-semibold focus:outline-none"
                >
                  {ALLOWED_PLD_COLUMN_ROLES.map((role) => (
                    <option key={role} value={role} className="bg-slate-900 text-slate-100">
                      {PLD_COLUMN_ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] font-mono text-slate-400 truncate">
                  Muestra protegida: {col.maskedSampleValue}
                </div>
              </div>
            ))}
          </div>

          {analysis.maskedPreviewRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-white/5 text-slate-400 font-mono text-[10px]">
                  <tr>
                    <th className="py-1.5 px-3">Fila</th>
                    <th className="py-1.5 px-3">Tipo ID</th>
                    <th className="py-1.5 px-3">ID Enmascarado</th>
                    <th className="py-1.5 px-3">Sujeto (Zero-PII)</th>
                    <th className="py-1.5 px-3">Lista & Oficio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono text-slate-200">
                  {analysis.maskedPreviewRows.map((r) => (
                    <tr key={`${r.rowNumber}-${r.blindIndexPrefix}`}>
                      <td className="py-1.5 px-3 text-slate-400">#{r.rowNumber}</td>
                      <td className="py-1.5 px-3 text-[#00D1FF] font-bold">{r.identifierType}</td>
                      <td className="py-1.5 px-3">{r.identifierMasked}</td>
                      <td className="py-1.5 px-3">{r.subjectMaskedName}</td>
                      <td className="py-1.5 px-3 text-slate-400">{r.resolvedListType} · {r.officialReference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={analyzing}
          onClick={() => void runSmartAnalysis(csvContent, preparedFile, mappingOverride)}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 transition-all disabled:opacity-50"
        >
          {analyzing ? 'Analizando...' : 'Analizar y Previsualizar Estructura'}
        </button>
        <button
          type="button"
          onClick={() => void handleIngestConfirmed()}
          disabled={ingestLoading || analyzing}
          className="px-5 py-2 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold shadow-lg flex items-center gap-2 transition-all disabled:opacity-50"
        >
          {ingestLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          <span>Confirmar Mapeo y Sellar en Base Registro Inmutable</span>
        </button>
      </div>
    </div>
  );
};
