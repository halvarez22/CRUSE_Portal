import React from 'react';
import { ShieldCheck, Award, FileCheck2, ExternalLink } from 'lucide-react';
import { COMPANY_INFO } from '../../data/cruseData';

export const FooterPublic: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900/60 glass-panel py-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Regulatory & Affiliation Badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pb-8 border-b border-slate-200 dark:border-white/10 mb-8">
          
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-card border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-950 dark:text-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#0F766E] dark:text-[#2EBD9B]" />
            <span>CONDUSEF (Registro SIPRES Activo)</span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-card border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-950 dark:text-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#396CAE]" />
            <span>CNBV (Supervisión PLD/FT Art. 95 Bis)</span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-card border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-950 dark:text-slate-200">
            <Award className="w-4 h-4 text-amber-600 dark:text-[#D4AF37]" />
            <span>Miembro ASOFOM desde {COMPANY_INFO.asofomMemberSince}</span>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-card border border-slate-200 dark:border-white/10 text-xs font-bold text-slate-950 dark:text-slate-200">
            <FileCheck2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span>{COMPANY_INFO.qualityCertification}</span>
          </div>

        </div>

        {/* Corporate Legal Text (Mandatory SOFOM E.N.R. Regulatory Legend) */}
        <div className="max-w-5xl mx-auto text-center space-y-4 text-xs text-slate-700 dark:text-slate-400 leading-relaxed">
          <p>
            <strong className="text-slate-950 dark:text-slate-200">{COMPANY_INFO.name}</strong> es una Sociedad Financiera de Objeto Múltiple, Entidad No Regulada, que para su constitución y operación no requiere de autorización de la Secretaría de Hacienda y Crédito Público, y está sujeta a la supervisión de la Comisión Nacional Bancaria y de Valores únicamente para efectos del artículo 95 Bis de la Ley General de Organizaciones y Actividades Auxiliares del Crédito en materia de Prevención de Lavado de Dinero y Financiamiento al Terrorismo (PLD/FT).
          </p>

          <p>
            Supervisada y registrada ante la Comisión Nacional para la Protección y Defensa de los Usuarios de Servicios Financieros (CONDUSEF) a través del Sistema de Registro de Prestadores de Servicios Financieros (SIPRES).
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-400 font-medium">
            <span>© {new Date().getFullYear()} {COMPANY_INFO.name}. Todos los derechos reservados.</span>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                alert('Aviso de Privacidad Integral de Microfinanciera Cruse conforme a la LFPDPPP.');
              }}
              className="text-[#0F766E] dark:text-[#2EBD9B] font-bold underline hover:opacity-80"
            >
              Aviso de Privacidad Integral (LFPDPPP)
            </a>
            <span>•</span>
            <a
              href="https://www.condusef.gob.mx"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#0F766E] dark:hover:text-[#2EBD9B] transition-colors flex items-center gap-1"
            >
              <span>Portal CONDUSEF</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};
