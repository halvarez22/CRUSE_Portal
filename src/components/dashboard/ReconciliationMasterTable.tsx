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
      <div className="p-6 border-b border-slate-800 flex justify-between items-center">
        <h2 className="text-xl font-bold text-teal-400">Master Reconciliation Table</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900 text-cyan-400 text-sm uppercase tracking-wider">
              <th className="p-4 border-b border-slate-800">ID</th>
              <th className="p-4 border-b border-slate-800">Nombre</th>
              <th className="p-4 border-b border-slate-800">CURP</th>
              <th className="p-4 border-b border-slate-800">Monto</th>
              <th className="p-4 border-b border-slate-800">Estatus</th>
              <th className="p-4 border-b border-slate-800">Fecha</th>
              <th className="p-4 border-b border-slate-800 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="text-slate-300">
            {loans.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">
                  No hay créditos recientes.
                </td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr key={loan.id} className="hover:bg-slate-900/50 transition-colors border-b border-slate-800/50">
                  <td className="p-4 font-mono text-xs">{loan.id.substring(0, 8)}</td>
                  <td className="p-4">{loan.fullName}</td>
                  <td className="p-4 font-mono text-xs text-slate-400">{loan.curpMasked}</td>
                  <td className="p-4 font-medium text-white">{formatCurrency(loan.amount)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full 
                      ${loan.status === 'aprobado' ? 'bg-teal-900/50 text-teal-400 border border-teal-800' : 
                        loan.status === 'rechazado' ? 'bg-red-900/50 text-red-400 border border-red-800' :
                        loan.status === 'conciliado' ? 'bg-cyan-900/50 text-cyan-400 border border-cyan-800' :
                        'bg-slate-800 text-slate-300 border border-slate-700'}`}>
                      {loan.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-400">
                    {new Date(loan.date).toLocaleDateString('es-MX')}
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => onViewDetails(loan.id)}
                      className="text-cyan-500 hover:text-cyan-300 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded px-2 py-1"
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
