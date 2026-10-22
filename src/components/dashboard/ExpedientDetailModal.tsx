/**
 * MODAL DE DETALLE DE EXPEDIENTE CON ACCESO PII Y BLOCK DE NOTAS SIEMPRE VISIBLE (RN-02)
 *
 * @implements RN-02 (Block de Notas Operativas Siempre Visible en el expediente)
 * @implements Guardrail Forense 1 (Erradicación de catch (err: any) por unknown con type guard)
 * @implements Regla 3 Anti-God-Object (< 185 líneas)
 */

import React, { useEffect, useState } from 'react';
import { ExpedientDetails } from '../../types/dashboard';
import { OperationalNotesPanel } from '../admin/OperationalNotesPanel';

interface ExpedientDetailModalProps {
  isOpen: boolean;
  expedientId: string | null;
  onClose: () => void;
  fetchDetails: (id: string) => Promise<ExpedientDetails>;
}

export const ExpedientDetailModal: React.FC<ExpedientDetailModalProps> = ({
  isOpen,
  expedientId,
  onClose,
  fetchDetails,
}) => {
  const [details, setDetails] = useState<ExpedientDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && expedientId) {
      let mounted = true;
      setLoading(true);
      setError(null);
      setDetails(null);

      fetchDetails(expedientId)
        .then((data) => {
          if (mounted) setDetails(data);
        })
        .catch((err: unknown) => {
          if (mounted) {
            setError(err instanceof Error ? err.message : 'Error fetching details');
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });

      return () => {
        mounted = false;
      };
    }
  }, [isOpen, expedientId, fetchDetails]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div
        className="bg-slate-950 border border-slate-800 rounded-xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <h2 id="modal-title" className="text-xl font-bold text-teal-400">
            Detalle de Expediente (Acceso PII + Block de Notas RN-02)
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded p-1"
            aria-label="Cerrar modal"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 bg-slate-800 rounded w-1/4 mb-2"></div>
                  <div className="h-8 bg-slate-800 rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
              <p className="font-semibold">Error al cargar datos sensibles:</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : details ? (
            <div className="space-y-5 text-slate-300">
              <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">Nombre Completo</h3>
                <p className="text-lg font-medium text-white">{details.fullName}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">CURP (Sin enmascarar)</h3>
                  <p className="font-mono text-cyan-400 tracking-wider">{details.curp}</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">RFC</h3>
                  <p className="font-mono text-cyan-400 tracking-wider">{details.rfc}</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">INE / ID</h3>
                  <p className="text-white">{details.voterId}</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">Teléfono</h3>
                  <p className="text-white">{details.phone}</p>
                </div>
              </div>

              <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">Dirección</h3>
                <p className="text-white">{details.address}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">Monto</h3>
                  <p className="text-teal-400 font-bold">${details.requestedAmount.toLocaleString('es-MX')}</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">Plazo</h3>
                  <p className="text-white">{details.termFortnights} quincenas</p>
                </div>
                <div className="bg-slate-900 p-4 rounded-lg border border-slate-800">
                  <h3 className="text-xs uppercase tracking-wider text-slate-500 mb-1">Producto</h3>
                  <p className="text-white capitalize">{details.productType}</p>
                </div>
              </div>

              <OperationalNotesPanel entityType="EXPEDIENTE" entityId={details.id} />
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
