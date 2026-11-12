/**
 * PANEL MODULAR DE HISTORIAL WORM Y CATÁLOGOS OFICIALES SIC (CÍRCULO DE CRÉDITO)
 *
 * @implements CRUSE-APO-2026-060 Guardrail 4 (Extracción modular < 200 líneas, interfaz limpia sin prop-drilling y 0 any)
 * @implements RN-05 (Historial inmutable WORM) y RN-06 (Catálogos Oficiales SIC)
 */

import React, { useState } from 'react';
import { Database, PlusCircle } from 'lucide-react';
import { CreditBureauCatalogItem, CreditBureauReportRecord } from '../../types';

export interface SaveCatalogPayload {
  catalogGroup: string;
  code: string;
  description: string;
  active: boolean;
}

export interface CreditBureauHistoryAndCatalogsPanelProps {
  subTab: 'history' | 'catalogs';
  historicalReports: CreditBureauReportRecord[];
  catalogs: CreditBureauCatalogItem[];
  isAdmin: boolean;
  onSaveCatalog: (payload: SaveCatalogPayload) => Promise<boolean>;
}

export const CreditBureauHistoryAndCatalogsPanel: React.FC<
  CreditBureauHistoryAndCatalogsPanelProps
> = ({ subTab, historicalReports, catalogs, isAdmin, onSaveCatalog }) => {
  const [newGroup, setNewGroup] = useState('OBSERVATION_CODE');
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [savingCatalog, setSavingCatalog] = useState(false);

  const handleCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingCatalog) return;
    setSavingCatalog(true);
    try {
      const ok = await onSaveCatalog({ catalogGroup: newGroup, code: newCode, description: newDesc, active: newActive });
      if (ok) {
        setNewCode('');
        setNewDesc('');
      }
    } finally {
      setSavingCatalog(false);
    }
  };

  if (subTab === 'history') {
    return (
      <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-white/5 border-b border-white/10 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#00D1FF]" />
          <span className="text-xs font-bold text-white">
            Lotes Históricos Sellados en `credit_bureau_reports` (WORM Inmutable)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px]">
              <tr>
                <th className="py-3 px-4">Folio Reporte</th>
                <th className="py-3 px-4">Periodo Reportado</th>
                <th className="py-3 px-4">Fecha de Sellado</th>
                <th className="py-3 px-4 text-right">Cuentas Detalladas</th>
                <th className="py-3 px-4 text-right">Saldo Total Reportado</th>
                <th className="py-3 px-4">Sello Criptográfico SHA-256</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {historicalReports.map((rep) => (
                <tr key={rep.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4 font-mono font-bold text-[#00D1FF]">{rep.id}</td>
                  <td className="py-3 px-4 font-mono text-white">{rep.reportingMonth}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">{rep.createdAt.replace('T', ' ').slice(0, 19)}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">{rep.totalAccounts}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                    ${Number(rep.totalReportedBalance).toLocaleString('es-MX')} MXN
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                    {rep.manifestHash.slice(0, 18)}...{rep.manifestHash.slice(-8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 rounded-3xl glass-panel border border-white/10 overflow-hidden">
        <div className="px-5 py-3.5 bg-white/5 border-b border-white/10">
          <span className="text-xs font-bold text-white">
            Catálogos Oficiales de Círculo de Crédito (`credit_bureau_catalogs` — RN-06)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/5 border-b border-white/10 text-slate-400 uppercase font-mono text-[10px]">
              <tr>
                <th className="py-3 px-4">Grupo</th>
                <th className="py-3 px-4">Clave</th>
                <th className="py-3 px-4">Descripción Oficial</th>
                <th className="py-3 px-4">Estatus</th>
                <th className="py-3 px-4">Actualizado Por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {catalogs.map((cat) => (
                <tr key={cat.id} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 px-4 font-mono text-slate-300">{cat.catalogGroup}</td>
                  <td className="py-2.5 px-4 font-mono font-bold text-[#D4AF37]">{cat.code}</td>
                  <td className="py-2.5 px-4 text-slate-200">{cat.description}</td>
                  <td className="py-2.5 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cat.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                      {cat.active ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400">{cat.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isAdmin && (
        <form onSubmit={handleCatalogSubmit} className="p-5 rounded-3xl glass-card border border-white/10 space-y-4 self-start">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-[#D4AF37]" />
            <h3 className="text-sm font-bold text-white">Agregar / Editar Clave Oficial SIC (RN-06)</h3>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Grupo de Catálogo</label>
            <select value={newGroup} onChange={(e) => setNewGroup(e.target.value)} className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white">
              <option value="OBSERVATION_CODE">OBSERVATION_CODE (Claves Observación)</option>
              <option value="ACCOUNT_TYPE">ACCOUNT_TYPE (Tipos de Cuenta)</option>
              <option value="CONTRACT_TYPE">CONTRACT_TYPE (Tipos de Contrato)</option>
              <option value="PAYMENT_FREQUENCY">PAYMENT_FREQUENCY (Frecuencias)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Clave Oficial (Ej. CC, SG, UP)</label>
            <input type="text" required maxLength={10} value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="Ej. CV" className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white font-mono" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Descripción Oficial</label>
            <input type="text" required maxLength={200} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Descripción del manual de Círculo de Crédito" className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input type="checkbox" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} />
            <span>Clave vigente para reportes mensuales</span>
          </label>
          <button type="submit" disabled={savingCatalog} className="w-full py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#c29d2f] text-slate-950 font-bold text-xs transition-all disabled:opacity-50">
            {savingCatalog ? 'Guardando...' : 'Guardar Clave en Catálogo SIC'}
          </button>
        </form>
      )}
    </div>
  );
};
