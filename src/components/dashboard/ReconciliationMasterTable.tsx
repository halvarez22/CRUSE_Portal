import React from 'react';
import { LatestLoan } from '../../types/dashboard';

interface ReconciliationMasterTableProps {
  loans: LatestLoan[];
  loading: boolean;
  onViewDetails: (id: string) => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(value);
};

export const ReconciliationMasterTable: React.FC<ReconciliationMasterTableProps> = ({ 
  loans, 
  loading, 
  onViewDetails 
}) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [convenioFilter, setConvenioFilter] = React.useState('ALL');
  const [statusFilter, setStatusFilter] = React.useState('ALL');
  const [sortField, setSortField] = React.useState<'fullName' | 'amount' | 'payment' | 'date'>('fullName');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');

  const convenioOptions = React.useMemo(
    () => Array.from(new Set(loans.map((l) => l.convenio || 'STSGECH'))).sort(),
    [loans]
  );

  const filteredLoans = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = loans.filter((loan) => {
      const displayCurp = (loan.curp || loan.curpMasked || '').toLowerCase();
      const matchesQ =
        !q ||
        loan.id.toLowerCase().includes(q) ||
        (loan.fullName || '').toLowerCase().includes(q) ||
        displayCurp.includes(q) ||
        (loan.convenio || '').toLowerCase().includes(q);
      if (!matchesQ) return false;
      if (convenioFilter !== 'ALL' && (loan.convenio || 'STSGECH') !== convenioFilter) return false;
      if (statusFilter !== 'ALL' && loan.status !== statusFilter) return false;
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'fullName') cmp = (a.fullName || '').localeCompare(b.fullName || '', 'es');
      else if (sortField === 'amount') cmp = (a.amount || 0) - (b.amount || 0);
      else if (sortField === 'payment') cmp = (a.payment || 0) - (b.payment || 0);
      else cmp = (a.date || '').localeCompare(b.date || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [loans, searchQuery, convenioFilter, statusFilter, sortField, sortDir]);

  const toggleSort = (field: 'fullName' | 'amount' | 'payment' | 'date') => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-slate-800">
          <div className="h-6 bg-slate-800 rounded w-1/4 animate-pulse"></div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-800 rounded animate-pulse w-full"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="p-6 border-b border-slate-800 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-teal-400">Tabla Maestra de Cartera ({filteredLoans.length} de {loans.length})</h2>
          <p className="text-xs text-slate-400 mt-0.5">Datos desencriptados en sesión autorizada (Zero-PII en reposo)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, ID/CURP, convenio..."
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 w-64"
          />
          <select
            aria-label="Filtrar por Convenio"
            value={convenioFilter}
            onChange={(e) => setConvenioFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">Convenio: Todos</option>
            {convenioOptions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
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
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-cyan-400 text-xs uppercase tracking-wider">
              <th className="p-4 border-b border-slate-800">ID</th>
              <th className="p-4 border-b border-slate-800">Convenio</th>
              <th className="p-4 border-b border-slate-800 cursor-pointer hover:text-white" onClick={() => toggleSort('fullName')}>
                Nombre {sortField === 'fullName' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800">ID Empleado / CURP</th>
              <th className="p-4 border-b border-slate-800 cursor-pointer hover:text-white" onClick={() => toggleSort('amount')}>
                Monto {sortField === 'amount' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800 cursor-pointer hover:text-white" onClick={() => toggleSort('payment')}>
                Cuota {sortField === 'payment' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800">Estatus</th>
              <th className="p-4 border-b border-slate-800 cursor-pointer hover:text-white" onClick={() => toggleSort('date')}>
                Fecha {sortField === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
              </th>
              <th className="p-4 border-b border-slate-800 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-slate-300 text-sm">
            {filteredLoans.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500">
                  No hay créditos que coincidan con el filtro seleccionado.
                </td>
              </tr>
            ) : (
              filteredLoans.map((loan) => (
                <tr key={loan.id} className="hover:bg-slate-900/50 transition-colors border-b border-slate-800/50">
                  <td className="p-4 font-mono text-xs text-cyan-400">{loan.id.substring(0, 12)}</td>
                  <td className="p-4 text-xs font-semibold text-slate-300">{loan.convenio || 'STSGECH'}</td>
                  <td className="p-4 font-medium text-white">{loan.fullName}</td>
                  <td className="p-4 font-mono text-xs text-emerald-400">{loan.curp || loan.curpMasked}</td>
                  <td className="p-4 font-medium text-white">{formatCurrency(loan.amount)}</td>
                  <td className="p-4 font-mono text-xs text-teal-300">{formatCurrency(loan.payment || 0)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                      ${loan.status === 'aprobado' || loan.status === 'activo' ? 'bg-teal-900/50 text-teal-400 border border-teal-800' : 
                        loan.status === 'rechazado' ? 'bg-red-900/50 text-red-400 border border-red-800' :
                        loan.status === 'conciliado' ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-800' :
                        'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                      {loan.status.toUpperCase()}
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

