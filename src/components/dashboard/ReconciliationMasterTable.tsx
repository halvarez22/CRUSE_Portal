import React from 'react';
import Decimal from 'decimal.js';
import { FileSpreadsheet } from 'lucide-react';
import { LatestLoan } from '../../types/dashboard';
import { DelinquencySemaphore, HubFilterOption } from '../../types/executive';

interface ReconciliationMasterTableProps {
  loans: LatestLoan[];
  loading: boolean;
  selectedHub?: HubFilterOption;
  onViewDetails: (id: string) => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
  }).format(value);
};

const escapeCsvCell = (raw: string | null | undefined): string => {
  const clean = String(raw ?? '').replace(/\r?\n/g, ' ').trim();
  const safeFormula = /^[=+\-@]/.test(clean) ? `'${clean}` : clean;
  return `"${safeFormula.replace(/"/g, '""')}"`;
};

const formatDecimalForCsv = (rawAmount: number | string | null | undefined): string => {
  try {
    return new Decimal(String(rawAmount ?? '0'))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toFixed(2);
  } catch {
    return '0.00';
  }
};

function renderSemaphoreBadge(sem?: DelinquencySemaphore) {
  const s = sem || 'VERDE';
  if (s === 'ROJO') {
    return (
      <span
        translate="no"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30"
      >
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        ROJO · VENCIDO
      </span>
    );
  }
  if (s === 'AMARILLO') {
    return (
      <span
        translate="no"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30"
      >
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        AMARILLO · PREVENTIVO
      </span>
    );
  }
  return (
    <span
      translate="no"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      VERDE · AL CORRIENTE
    </span>
  );
}

export const ReconciliationMasterTable: React.FC<ReconciliationMasterTableProps> = ({
  loans,
  loading,
  selectedHub = 'ALL',
  onViewDetails,
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [convenioFilter, setConvenioFilter] = React.useState('ALL');
  const [statusFilter, setStatusFilter] = React.useState('ALL');
  const [semaphoreFilter, setSemaphoreFilter] = React.useState('ALL');
  const [sortField, setSortField] = React.useState<'fullName' | 'amount' | 'payment' | 'date'>(
    'fullName'
  );
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const convenioOptions = React.useMemo(
    () => Array.from(new Set(loans.map((l) => (l.convenio || 'STSGECH').trim()))).sort(),
    [loans]
  );

  // 1. Reset limpio de filtros locales cuando el usuario cambia de Hub Nacional
  React.useEffect(() => {
    setSearchQuery('');
    setConvenioFilter('ALL');
    setSemaphoreFilter('ALL');
    setStatusFilter('ALL');
  }, [selectedHub]);

  // 2. Guardia defensiva: si el convenio seleccionado no existe en las opciones del Hub actual, vuelve a 'ALL'
  React.useEffect(() => {
    if (
      convenioFilter !== 'ALL' &&
      !convenioOptions.some((opt) => opt === convenioFilter)
    ) {
      setConvenioFilter('ALL');
    }
  }, [convenioFilter, convenioOptions]);

  const filteredLoans = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const seenIds = new Set<string>();

    const list = loans.filter((loan) => {
      if (!loan.id || seenIds.has(loan.id)) return false;
      seenIds.add(loan.id);

      const displayCurp = (loan.curp || loan.curpMasked || '').toLowerCase();
      const normalizedConvenio = (loan.convenio || 'STSGECH').trim();
      const normalizedStatus = (loan.status || 'capturado').trim().toLowerCase();
      const normalizedSem = (loan.semaphore || 'VERDE').trim().toUpperCase();

      const matchesQ =
        !q ||
        loan.id.toLowerCase().includes(q) ||
        (loan.fullName || '').toLowerCase().includes(q) ||
        displayCurp.includes(q) ||
        normalizedConvenio.toLowerCase().includes(q) ||
        (loan.hubRegion || '').toLowerCase().includes(q);
      if (!matchesQ) return false;
      if (convenioFilter !== 'ALL' && normalizedConvenio !== convenioFilter) return false;
      if (statusFilter !== 'ALL' && normalizedStatus !== statusFilter.toLowerCase()) return false;
      if (semaphoreFilter !== 'ALL' && normalizedSem !== semaphoreFilter.toUpperCase()) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'fullName') cmp = (a.fullName || '').localeCompare(b.fullName || '', 'es');
      else if (sortField === 'amount')
        cmp = new Decimal(String(a.amount ?? 0)).comparedTo(new Decimal(String(b.amount ?? 0)));
      else if (sortField === 'payment')
        cmp = new Decimal(String(a.payment ?? 0)).comparedTo(new Decimal(String(b.payment ?? 0)));
      else cmp = (a.date || '').localeCompare(b.date || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [loans, searchQuery, convenioFilter, statusFilter, semaphoreFilter, sortField, sortDir]);

  const tbodyReconciliationKey = `${selectedHub || 'ALL'}|${convenioFilter}|${semaphoreFilter}|${statusFilter}|${searchQuery.trim().toLowerCase()}|${sortField}|${sortDir}|${filteredLoans.length}`;

  const toggleSort = (field: 'fullName' | 'amount' | 'payment' | 'date') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleExportToExcel = () => {
    const headers = [
      'ID Expediente',
      'Hub Regional',
      'Convenio',
      'Nombre Completo',
      'ID Empleado / CURP',
      'Monto Colocado (MXN)',
      'Cuota Quincenal (MXN)',
      'Semáforo',
      'Estatus',
      'Fecha de Registro',
    ];

    const rows = filteredLoans.map((loan) => {
      const formattedDate = loan.date
        ? new Date(loan.date).toLocaleDateString('es-MX')
        : 'SIN FECHA';
      return [
        escapeCsvCell(loan.id),
        escapeCsvCell(loan.hubRegion || 'CHIHUAHUA'),
        escapeCsvCell(loan.convenio || 'STSGECH'),
        escapeCsvCell(loan.fullName),
        escapeCsvCell(loan.curp || loan.curpMasked),
        formatDecimalForCsv(loan.amount),
        formatDecimalForCsv(loan.payment ?? 0),
        escapeCsvCell(loan.semaphore || 'VERDE'),
        escapeCsvCell((loan.status || 'capturado').toUpperCase()),
        escapeCsvCell(formattedDate),
      ].join(',');
    });

    const csvContent = [headers.map((h) => `"${h}"`).join(','), ...rows].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const hubSlug = (selectedHub || 'ALL').toLowerCase();
    const dateSlug = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.setAttribute('download', `CRUSE_Cartera_${hubSlug}_${dateSlug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg p-6">
        <div className="h-6 bg-slate-800 rounded w-1/4 animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-slate-800 rounded animate-pulse w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      translate="no"
      className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg"
    >
      <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-teal-400">
            Tabla Maestra de Cartera ({filteredLoans.length} de {loans.length})
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Datos desencriptados en sesión autorizada (Zero-PII en reposo · Clasificación por Hub y Semáforo)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, CURP, convenio, Hub..."
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 w-60"
          />
          <select
            aria-label="Filtrar por Convenio"
            value={convenioFilter}
            onChange={(e) => setConvenioFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Convenio: Todos</option>
            {convenioOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por Semáforo"
            value={semaphoreFilter}
            onChange={(e) => setSemaphoreFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Semáforo: Todos</option>
            <option value="VERDE">🟢 Verde (Al corriente)</option>
            <option value="AMARILLO">🟡 Amarillo (Preventivo)</option>
            <option value="ROJO">🔴 Rojo (Vencido/Congelado)</option>
          </select>
          <select
            aria-label="Filtrar por Estatus"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Estatus: Todos</option>
            <option value="capturado">CAPTURADO</option>
            <option value="activo">ACTIVO</option>
            <option value="aprobado">APROBADO</option>
            <option value="rechazado">RECHAZADO</option>
          </select>
          <button
            type="button"
            onClick={handleExportToExcel}
            disabled={filteredLoans.length === 0}
            title="Descargar los registros filtrados en formato CSV compatible con Microsoft Excel"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed border border-emerald-500/40 text-xs font-bold text-emerald-300 transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel ({filteredLoans.length})</span>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table translate="no" className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-cyan-400 text-xs uppercase tracking-wider">
              <th className="p-4 border-b border-slate-800">ID</th>
              <th className="p-4 border-b border-slate-800">Hub / Convenio</th>
              <th
                className="p-4 border-b border-slate-800 cursor-pointer hover:text-white"
                onClick={() => toggleSort('fullName')}
              >
                Nombre {sortField === 'fullName' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800">ID Empleado / CURP</th>
              <th
                className="p-4 border-b border-slate-800 cursor-pointer hover:text-white"
                onClick={() => toggleSort('amount')}
              >
                Monto {sortField === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th
                className="p-4 border-b border-slate-800 cursor-pointer hover:text-white"
                onClick={() => toggleSort('payment')}
              >
                Cuota {sortField === 'payment' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800">Semáforo</th>
              <th className="p-4 border-b border-slate-800">Estatus</th>
              <th
                className="p-4 border-b border-slate-800 cursor-pointer hover:text-white"
                onClick={() => toggleSort('date')}
              >
                Fecha {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody key={tbodyReconciliationKey} translate="no" className="text-slate-300 text-sm">
            {filteredLoans.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500">
                  No hay créditos que coincidan con el filtro seleccionado.
                </td>
              </tr>
            ) : (
              filteredLoans.map((loan) => (
                <tr
                  key={loan.id}
                  className="hover:bg-slate-900/50 transition-colors border-b border-slate-800/50"
                >
                  <td className="p-4 font-mono text-xs text-cyan-400">
                    {loan.id.substring(0, 12)}
                  </td>
                  <td className="p-4 text-xs">
                    <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 font-bold text-[10px] mr-1.5">
                      {loan.hubRegion || 'CHIHUAHUA'}
                    </span>
                    <span className="font-semibold text-slate-300">
                      {loan.convenio || 'STSGECH'}
                    </span>
                  </td>
                  <td className="p-4 font-medium text-white">{loan.fullName}</td>
                  <td className="p-4 font-mono text-xs text-emerald-400">
                    {loan.curp || loan.curpMasked}
                  </td>
                  <td className="p-4 font-medium text-white">{formatCurrency(loan.amount)}</td>
                  <td className="p-4 font-mono text-xs text-teal-300">
                    {formatCurrency(loan.payment || 0)}
                  </td>
                  <td className="p-4">{renderSemaphoreBadge(loan.semaphore)}</td>
                  <td className="p-4">
                    <span
                      translate="no"
                      className={`px-2 py-1 text-xs font-semibold rounded-full 
                      ${
                        loan.status === 'aprobado' || loan.status === 'activo'
                          ? 'bg-teal-900/50 text-teal-400 border border-teal-800'
                          : loan.status === 'rechazado'
                            ? 'bg-red-900/50 text-red-400 border border-red-800'
                            : loan.status === 'conciliado'
                              ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-800'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                      }`}
                    >
                      {(loan.status || 'capturado').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-xs text-slate-400">
                    {new Date(loan.date).toLocaleDateString('es-MX')}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => onViewDetails(loan.id)}
                      className="text-cyan-400 hover:text-cyan-300 transition-colors text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20"
                      aria-label={`Ver detalles de ${loan.fullName}`}
                    >
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
