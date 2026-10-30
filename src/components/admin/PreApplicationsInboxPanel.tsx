import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Mail,
  MailOpen,
  CheckCircle2,
  RefreshCw,
  Search,
  FileSpreadsheet,
  Eye,
  MessageSquare,
  Phone,
  Clock,
  X,
  ShieldCheck,
} from 'lucide-react';
import {
  PreApplicationDecryptedDetail,
  PreApplicationInboxStatus,
  PreApplicationSummaryItem,
  PreApplicationsInboxCounts,
} from '../../types';
import {
  exportPreApplicationsToExcelCsv,
  formatExactMxn,
} from '../../utils/preApplicationsExcelExport';

interface PreApplicationsInboxPanelProps {
  token: string;
  onUnreadCountChange?: (unreadCount: number) => void;
}

export const PreApplicationsInboxPanel: React.FC<PreApplicationsInboxPanelProps> = ({
  token,
  onUnreadCountChange,
}) => {
  const [items, setItems] = useState<PreApplicationSummaryItem[]>([]);
  const [counts, setCounts] = useState<PreApplicationsInboxCounts>({
    total: 0,
    unreadCount: 0,
    readCount: 0,
    attendedCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | PreApplicationInboxStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedDetail, setSelectedDetail] = useState<PreApplicationDecryptedDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pre-applications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.items) setItems(data.items);
      if (data.counts) {
        setCounts(data.counts);
        onUnreadCountChange?.(data.counts.unreadCount ?? 0);
      }
    } catch (err) {
      console.error('Error cargando buzón de pre-solicitudes:', err);
    } finally {
      setLoading(false);
    }
  }, [token, onUnreadCountChange]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter !== 'ALL' && item.inboxStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        item.folio.toLowerCase().includes(q) ||
        item.applicantNameMasked.toLowerCase().includes(q) ||
        item.convenio.toLowerCase().includes(q) ||
        item.phoneMasked.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q)
      );
    });
  }, [items, statusFilter, searchQuery]);

  const handleOpenDetail = async (id: string) => {
    setDetailLoading(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/pre-applications/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.detail) {
        const d = data.detail as PreApplicationDecryptedDetail;
        setSelectedDetail(d);
        setNotesDraft(d.promoterNotes || '');
        void loadInbox();
      }
    } catch (err) {
      console.error('Error al abrir detalle de pre-solicitud:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: PreApplicationInboxStatus) => {
    if (!selectedDetail || savingStatus) return;
    setSavingStatus(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(
        `/api/pre-applications/${encodeURIComponent(selectedDetail.id)}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            inboxStatus: newStatus,
            promoterNotes: notesDraft.trim(),
          }),
        }
      );
      if (res.ok) {
        setSelectedDetail({
          ...selectedDetail,
          inboxStatus: newStatus,
          promoterNotes: notesDraft.trim() || null,
        });
        setFeedbackMsg(`Estatus actualizado a ${newStatus.replace('_', ' ')} y sellado en WORM.`);
        void loadInbox();
      }
    } catch (err) {
      console.error('Error al actualizar estatus:', err);
    } finally {
      setSavingStatus(false);
    }
  };

  const renderStatusBadge = (status: PreApplicationInboxStatus) => {
    if (status === 'NO_LEIDO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-cyan-500/20 text-[#00D1FF] border border-cyan-400/40">
          <Mail className="w-3 h-3" />
          NO LEÍDO
        </span>
      );
    }
    if (status === 'ATENDIDO') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          <CheckCircle2 className="w-3 h-3" />
          ATENDIDO
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <MailOpen className="w-3 h-3" />
        LEÍDO
      </span>
    );
  };

  return (
    <div translate="no" className="space-y-4">
      {/* Tarjetas de Resumen estilo Buzón */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 border-[#00D1FF] ring-1 ring-[#00D1FF]/40'
              : 'bg-slate-900/60 border-white/10 hover:border-white/25'
          }`}
        >
          <span className="text-xs text-slate-400 block">Total Pre-Solicitudes</span>
          <strong className="text-2xl font-black text-white font-mono">{counts.total}</strong>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('NO_LEIDO')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'NO_LEIDO'
              ? 'bg-cyan-950/50 border-[#00D1FF] ring-1 ring-[#00D1FF]/40'
              : 'bg-slate-900/60 border-white/10 hover:border-cyan-500/40'
          }`}
        >
          <span className="text-xs text-[#00D1FF] font-bold block">🔵 No Leídos (Nuevos)</span>
          <strong className="text-2xl font-black text-[#00D1FF] font-mono">
            {counts.unreadCount}
          </strong>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('LEIDO')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'LEIDO'
              ? 'bg-amber-950/40 border-amber-400 ring-1 ring-amber-400/40'
              : 'bg-slate-900/60 border-white/10 hover:border-amber-500/40'
          }`}
        >
          <span className="text-xs text-amber-300 font-bold block">🟡 Leídos (En Revisión)</span>
          <strong className="text-2xl font-black text-amber-300 font-mono">
            {counts.readCount}
          </strong>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('ATENDIDO')}
          className={`p-4 rounded-2xl border text-left transition-all ${
            statusFilter === 'ATENDIDO'
              ? 'bg-emerald-950/40 border-emerald-400 ring-1 ring-emerald-400/40'
              : 'bg-slate-900/60 border-white/10 hover:border-emerald-500/40'
          }`}
        >
          <span className="text-xs text-emerald-400 font-bold block">🟢 Atendidos (Cita Agendada)</span>
          <strong className="text-2xl font-black text-emerald-400 font-mono">
            {counts.attendedCount}
          </strong>
        </button>
      </div>

      {/* Barra de Herramientas y Exportación Excel */}
      <div className="p-4 rounded-2xl glass-card border border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#00D1FF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por Folio (CRUSE-PRE-...), Nombre, Dependencia..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00D1FF]"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => exportPreApplicationsToExcelCsv(filteredItems, statusFilter)}
            disabled={filteredItems.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 border border-emerald-500/40 text-xs font-bold text-emerald-300 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel ({filteredItems.length})</span>
          </button>
          <button
            type="button"
            onClick={() => void loadInbox()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Actualizar buzón"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tabla del Buzón de Pre-Solicitudes */}
      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-cyan-400 uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
              <tr>
                <th className="py-3.5 px-4">Estatus</th>
                <th className="py-3.5 px-4">Folio & Fecha</th>
                <th className="py-3.5 px-4">Solicitante (Zero-PII)</th>
                <th className="py-3.5 px-4">Dependencia / Convenio</th>
                <th className="py-3.5 px-4">Producto & Plazo</th>
                <th className="py-3.5 px-4">Monto & Cuota</th>
                <th className="py-3.5 px-4 text-right">Acción</th>
              </tr>
            </thead>
            <tbody
              key={`${statusFilter}|${searchQuery.trim()}|${filteredItems.length}`}
              className="divide-y divide-white/5"
            >
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    No hay pre-solicitudes en este filtro del buzón.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const isUnread = item.inboxStatus === 'NO_LEIDO';
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isUnread
                          ? 'bg-cyan-500/[0.06] hover:bg-cyan-500/10 font-bold text-white'
                          : 'hover:bg-white/[0.03] text-slate-300'
                      }`}
                    >
                      <td className="py-3.5 px-4">{renderStatusBadge(item.inboxStatus)}</td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-[#00D1FF] font-bold">{item.folio}</div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {item.createdAt.replace('T', ' ').slice(0, 16)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div>{item.applicantNameMasked}</div>
                        <div className="text-[10px] font-mono text-emerald-400">
                          Tel: {item.phoneMasked} · {item.emailMasked}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 max-w-[200px] truncate" title={item.convenio}>
                        {item.convenio}
                      </td>
                      <td className="py-3.5 px-4">
                        <div>{item.productName}</div>
                        <div className="text-[10px] text-slate-400">
                          {item.termFortnights} quincenas · CAT {formatExactMxn(item.catPercent)}%
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono">
                        <div className="text-white font-bold">
                          ${formatExactMxn(item.requestedAmountMxn)}
                        </div>
                        <div className="text-[10px] text-teal-300">
                          Qna: ${formatExactMxn(item.fortnightlyPaymentMxn)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => void handleOpenDetail(item.id)}
                          disabled={detailLoading}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-xs font-bold text-[#00D1FF] transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isUnread ? 'Abrir y Marcar Leído' : 'Ver Detalle'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle Desencriptado y Gestión de Cita con Promotor */}
      {selectedDetail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
          onClick={() => setSelectedDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-white/15 rounded-3xl p-6 max-w-xl w-full shadow-2xl space-y-4 relative"
          >
            <button
              type="button"
              onClick={() => setSelectedDetail(null)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between gap-2 pr-8">
              <div>
                <span className="text-xs font-mono text-[#00D1FF] font-bold block">
                  {selectedDetail.folio}
                </span>
                <h3 className="text-lg font-black text-white">
                  Ficha Confidencial del Solicitante y Crédito Pretendido
                </h3>
              </div>
              {renderStatusBadge(selectedDetail.inboxStatus)}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950/90 border border-white/10 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px]">Nombre Desencriptado:</span>
                <strong className="text-white text-sm">{selectedDetail.fullName}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Teléfono Celular Directo:</span>
                <strong className="text-emerald-400 font-mono text-sm flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {selectedDetail.phone}
                </strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Correo Electrónico:</span>
                <strong className="text-cyan-300 font-mono">{selectedDetail.email}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">Dependencia / Convenio:</span>
                <strong className="text-white">{selectedDetail.convenio}</strong>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-white/10">
                <span className="text-slate-400 block text-[10px]">
                  Horario / Sede para Visita Presencial del Promotor:
                </span>
                <strong className="text-amber-300">{selectedDetail.preferredSchedule}</strong>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Producto y Plazo</span>
                <strong className="text-white">
                  {selectedDetail.productName} ({selectedDetail.termFortnights} qnas)
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Monto Solicitado</span>
                <strong className="text-emerald-400 font-mono text-sm">
                  ${formatExactMxn(selectedDetail.requestedAmountMxn)} MXN
                </strong>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Descuento Quincenal</span>
                <strong className="text-[#00D1FF] font-mono text-sm">
                  ${formatExactMxn(selectedDetail.fortnightlyPaymentMxn)} MXN
                </strong>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Notas de Seguimiento / Cita con Promotor en Campo:
              </label>
              <textarea
                rows={2}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Ej. Cita confirmada por Srita. Alma para visita de promotor en oficina sindical..."
                className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/15 text-xs text-white focus:outline-none focus:border-[#00D1FF]"
              />
            </div>

            {feedbackMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{feedbackMsg}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={savingStatus}
                  onClick={() => void handleUpdateStatus('ATENDIDO')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors"
                >
                  Marcar como ATENDIDO
                </button>
                <button
                  type="button"
                  disabled={savingStatus}
                  onClick={() => void handleUpdateStatus('LEIDO')}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-colors"
                >
                  Guardar como LEÍDO
                </button>
                <button
                  type="button"
                  disabled={savingStatus}
                  onClick={() => void handleUpdateStatus('NO_LEIDO')}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Marcar NO LEÍDO
                </button>
              </div>

              <a
                href={`https://wa.me/52${selectedDetail.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                  `Hola ${selectedDetail.fullName}, te contactamos de Microfinanciera Cruse respecto a tu Pre-Solicitud con folio ${selectedDetail.folio} para coordinar la visita de tu promotor.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#249E82] hover:opacity-95 text-white text-xs font-black transition-all"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp al Solicitante</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
