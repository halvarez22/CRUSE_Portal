import React, { useState, useMemo } from 'react';
import { Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, Download, RotateCcw, Eye } from 'lucide-react';
import { ExpedienteItem } from '../../types';
import { ExpedientDetails } from '../../types/dashboard';
import { ExpedientDetailModal } from '../dashboard/ExpedientDetailModal';
import { CibBatchControlPanel } from './CibBatchControlPanel';

interface ExpedientesTableViewProps {
  expedientes: ExpedienteItem[];
  token: string;
}

type SortField = 'id' | 'convenio' | 'fullName' | 'curp' | 'requestedAmount' | 'fortnightlyPayment' | 'termFortnights' | 'status';
type SortDirection = 'asc' | 'desc';

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

export const ExpedientesTableView: React.FC<ExpedientesTableViewProps> = ({ expedientes, token }) => {
  // Condición 2 (CRUSE-APO-2026-015): Buscador global único + Filtros facetados (dropdowns) + Ordenamiento ↑↓
  const [searchQuery, setSearchQuery] = useState('');
  const [convenioFilter, setConvenioFilter] = useState('ALL');
  const [termFilter, setTermFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [promotorFilter, setPromotorFilter] = useState('ALL');

  const [sortField, setSortField] = useState<SortField>('fullName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [selectedExpedientId, setSelectedExpedientId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Catálogos dinámicos extraídos de los expedientes reales (Cero Hardcoding - Regla 2 HRU)
  const convenioOptions = useMemo(
    () => Array.from(new Set(expedientes.map((e) => e.convenio || 'STSGECH'))).sort(),
    [expedientes]
  );

  const termOptions = useMemo(
    () => Array.from(new Set(expedientes.map((e) => e.termFortnights))).sort((a, b) => a - b),
    [expedientes]
  );

  const promotorOptions = useMemo(
    () => Array.from(new Set(expedientes.map((e) => e.promotorEmail))).sort(),
    [expedientes]
  );

  const statusOptions = useMemo(
    () => Array.from(new Set(expedientes.map((e) => e.status))).sort(),
    [expedientes]
  );

  // Filtrado y Ordenamiento en memoria sobre datos desencriptados para el Administrador
  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = expedientes.filter((exp) => {
      const displayCurp = (exp.curp || exp.curpMasked || '').toLowerCase();
      const matchesSearch =
        !q ||
        exp.id.toLowerCase().includes(q) ||
        exp.fullName.toLowerCase().includes(q) ||
        displayCurp.includes(q) ||
        (exp.convenio || '').toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (convenioFilter !== 'ALL' && (exp.convenio || 'STSGECH') !== convenioFilter) return false;
      if (termFilter !== 'ALL' && String(exp.termFortnights) !== termFilter) return false;
      if (statusFilter !== 'ALL' && exp.status !== statusFilter) return false;
      if (promotorFilter !== 'ALL' && exp.promotorEmail !== promotorFilter) return false;

      return true;
    });

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'id':
          cmp = a.id.localeCompare(b.id);
          break;
        case 'convenio':
          cmp = (a.convenio || '').localeCompare(b.convenio || '');
          break;
        case 'fullName':
          cmp = a.fullName.localeCompare(b.fullName, 'es');
          break;
        case 'curp':
          cmp = (a.curp || a.curpMasked).localeCompare(b.curp || b.curpMasked);
          break;
        case 'requestedAmount':
          cmp = a.requestedAmount - b.requestedAmount;
          break;
        case 'fortnightlyPayment':
          cmp = (a.fortnightlyPayment || 0) - (b.fortnightlyPayment || 0);
          break;
        case 'termFortnights':
          cmp = a.termFortnights - b.termFortnights;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [expedientes, searchQuery, convenioFilter, termFilter, statusFilter, promotorFilter, sortField, sortDirection]);

  // Totales dinámicos del subconjunto filtrado
  const dynamicTotals = useMemo(() => {
    return filteredAndSorted.reduce(
      (acc, item) => {
        acc.totalPrincipal += item.requestedAmount || 0;
        acc.totalQuota += item.fortnightlyPayment || 0;
        return acc;
      },
      { totalPrincipal: 0, totalQuota: 0 }
    );
  }, [filteredAndSorted]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />;
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#00D1FF]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#00D1FF]" />
    );
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    convenioFilter !== 'ALL' ||
    termFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    promotorFilter !== 'ALL';

  const handleResetFilters = () => {
    setSearchQuery('');
    setConvenioFilter('ALL');
    setTermFilter('ALL');
    setStatusFilter('ALL');
    setPromotorFilter('ALL');
  };

  // Descarga de Layout SIF / CIB sobre los registros filtrados y sin valores quemados (Regla 2 HRU)
  const handleDownloadFilteredLayout = () => {
    const header = 'CONVENIO,ID_EMPLEADO_CURP,NOMBRE,IMPORTE_PRESTAMO,PLAZO_QUINCENAS,CUOTA_QUINCENAL,FECHA_REGISTRO\n';
    const rows = filteredAndSorted
      .map((exp) => {
        const convenio = exp.convenio || 'STSGECH';
        const identifier = exp.curp || exp.curpMasked;
        const quota = (exp.fortnightlyPayment ?? 0).toFixed(2);
        const dateStr = (exp.createdAt || '').slice(0, 10);
        return `${convenio},${identifier},"${exp.fullName}",${exp.requestedAmount},${exp.termFortnights},${quota},${dateStr}`;
      })
      .join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `CRUSE_LAYOUT_SIF_CIB_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fetchExpedientDetails = async (id: string): Promise<ExpedientDetails> => {
    const res = await fetch(`/api/dashboard/expedientes/${id}/details`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      throw new Error(`Error al consultar detalle (${res.status})`);
    }
    return res.json();
  };

  return (
    <div className="space-y-4">
      <CibBatchControlPanel token={token} />

      {/* Barra de Búsqueda Global y Filtros Facetados (Condición 2 CRUSE-APO-2026-015) */}
      <div className="p-4 rounded-2xl glass-card border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Buscador Global Único */}
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 text-[#00D1FF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por Nombre completo, ID de Empleado / CURP, Folio o Convenio..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00D1FF]"
            />
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpiar filtros</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadFilteredLayout}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#396CAE] to-[#249E82] hover:opacity-90 text-white text-xs font-semibold shadow-lg shadow-[#396CAE]/20 flex items-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>Descargar Layout SIF / CIB ({filteredAndSorted.length})</span>
            </button>
          </div>
        </div>

        {/* Selectores Facetados (Dropdowns) */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/10 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-semibold">
            <Filter className="w-3.5 h-3.5 text-[#249E82]" />
            <span>Filtros por columna:</span>
          </div>

          <select
            aria-label="Filtrar por Convenio"
            value={convenioFilter}
            onChange={(e) => setConvenioFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 text-slate-200 focus:outline-none focus:border-[#00D1FF]"
          >
            <option value="ALL">Convenio: Todos ({convenioOptions.length})</option>
            {convenioOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por Plazo"
            value={termFilter}
            onChange={(e) => setTermFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 text-slate-200 focus:outline-none focus:border-[#00D1FF]"
          >
            <option value="ALL">Plazo: Todos</option>
            {termOptions.map((t) => (
              <option key={t} value={String(t)}>
                {t} quincenas
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por Estatus"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 text-slate-200 focus:outline-none focus:border-[#00D1FF]"
          >
            <option value="ALL">Estatus: Todos</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por Promotor u Origen"
            value={promotorFilter}
            onChange={(e) => setPromotorFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-900 border border-white/15 text-slate-200 focus:outline-none focus:border-[#00D1FF]"
          >
            <option value="ALL">Origen / Promotor: Todos</option>
            {promotorOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Barra de Resumen Dinámico */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs text-slate-300">
          <div>
            Mostrando <span className="font-bold text-[#00D1FF]">{filteredAndSorted.length}</span> de{' '}
            <span className="font-bold text-white">{expedientes.length}</span> expedientes
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Capital Filtrado:{' '}
              <strong className="text-emerald-400 font-mono">{formatCurrency(dynamicTotals.totalPrincipal)}</strong>
            </span>
            <span>
              Suma Cuota Quincenal:{' '}
              <strong className="text-[#00D1FF] font-mono">{formatCurrency(dynamicTotals.totalQuota)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Tabla de Expedientes con Ordenamiento ↑↓ */}
      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 border-b border-white/10 text-slate-300 uppercase font-mono text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('id')}>
                  <div className="flex items-center gap-1.5">
                    <span>Folio</span>
                    {renderSortIcon('id')}
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('convenio')}>
                  <div className="flex items-center gap-1.5">
                    <span>Convenio</span>
                    {renderSortIcon('convenio')}
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('fullName')}>
                  <div className="flex items-center gap-1.5">
                    <span>Cliente / Solicitante</span>
                    {renderSortIcon('fullName')}
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('curp')}>
                  <div className="flex items-center gap-1.5">
                    <span>ID Empleado / CURP</span>
                    {renderSortIcon('curp')}
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('requestedAmount')}>
                  <div className="flex items-center gap-1.5">
                    <span>Monto Solicitado</span>
                    {renderSortIcon('requestedAmount')}
                  </div>
                </th>
                <th
                  className="py-3 px-4 cursor-pointer hover:text-white"
                  onClick={() => handleSort('fortnightlyPayment')}
                >
                  <div className="flex items-center gap-1.5">
                    <span>Cuota Quincenal</span>
                    {renderSortIcon('fortnightlyPayment')}
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('termFortnights')}>
                  <div className="flex items-center gap-1.5">
                    <span>Plazo</span>
                    {renderSortIcon('termFortnights')}
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1.5">
                    <span>Estatus</span>
                    {renderSortIcon('status')}
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredAndSorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No se encontraron expedientes que coincidan con los criterios de búsqueda.
                  </td>
                </tr>
              ) : (
                filteredAndSorted.map((exp) => (
                  <tr key={exp.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3 px-4 font-mono text-[#00D1FF] font-semibold">{exp.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-300">{exp.convenio || 'STSGECH'}</td>
                    <td className="py-3 px-4 font-medium text-white">{exp.fullName}</td>
                    <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">
                      {exp.curp || exp.curpMasked}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-100">{formatCurrency(exp.requestedAmount)}</td>
                    <td className="py-3 px-4 font-mono text-teal-300">
                      {formatCurrency(exp.fortnightlyPayment || 0)}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-semibold">{exp.termFortnights} quincenas</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {exp.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedExpedientId(exp.id);
                          setIsModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#00D1FF]/10 hover:bg-[#00D1FF]/20 text-[#00D1FF] font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Ver Detalle</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExpedientDetailModal
        isOpen={isModalOpen}
        expedientId={selectedExpedientId}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedExpedientId(null);
        }}
        fetchDetails={fetchExpedientDetails}
      />
    </div>
  );
};
