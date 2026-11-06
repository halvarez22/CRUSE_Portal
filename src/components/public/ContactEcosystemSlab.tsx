import React from 'react';
import { MapPin, Phone, Mail, Clock, ShieldCheck, Building2 } from 'lucide-react';
import { COMPANY_INFO } from '../../data/cruseData';

export const ContactEcosystemSlab: React.FC = () => {
  return (
    <section id="contacto" className="py-12 lg:py-20 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative group">
          <div className="absolute -inset-3 bg-gradient-to-r from-[#249E82] via-[#00D1FF] to-[#396CAE] opacity-0 dark:opacity-25 blur-2xl rounded-3xl dark:group-hover:opacity-40 transition-opacity" />

          <div className="relative glass-slab-emerald rounded-3xl p-8 sm:p-12 shadow-lg dark:shadow-2xl border border-slate-200 dark:border-[#249E82]/50 transform hover:-translate-y-1 transition-all">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200 dark:border-white/10 mb-8">
              <div>
                <span className="text-xs uppercase tracking-widest font-black text-emerald-800 dark:text-[#4CD360] block mb-1">
                  Sedes de Atención y Contacto Institucional
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  Conecte con {COMPANY_INFO.shortName}
                </h2>
              </div>

              <div className="bg-white rounded-xl px-3.5 py-2 shadow-sm border border-slate-200">
                <img
                  src="/branding/logotipo-cruse-oficial.png"
                  alt="Cruse Microfinanciera"
                  className="h-8 w-auto object-contain"
                />
              </div>
            </div>

            {/* Dual Routing Banner: Sindicalizados vs Confianza */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-2xl bg-white/90 dark:bg-black/30 border border-emerald-500/40">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-emerald-800 dark:text-[#4CD360] mb-1.5">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>Trabajadores Sindicalizados y Jubilados (Vía Sindicato — Promotores)</span>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed mb-1.5">
                  El Sindicato es nuestro intermediario oficial y su personal son nuestros promotores autorizados. Comunícate al <strong>{COMPANY_INFO.unionOfficeContact.title}</strong> ({COMPANY_INFO.unionOfficeContact.venueName}):
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 mb-2">
                  {COMPANY_INFO.unionOfficeContact.address} (o con tu delegado sindical municipal).
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="tel:6146077301"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#249E82]/15 hover:bg-[#249E82]/25 text-emerald-950 dark:text-[#4CD360] text-xs font-mono font-bold border border-[#249E82]/40 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> 614 607 7301
                  </a>
                  <a
                    href="tel:6141412503"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#249E82]/15 hover:bg-[#249E82]/25 text-emerald-950 dark:text-[#4CD360] text-xs font-mono font-bold border border-[#249E82]/40 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> 614 141 2503
                  </a>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/90 dark:bg-black/30 border border-[#396CAE]/40">
                <div className="flex items-center gap-2 text-xs font-black uppercase text-[#1E40AF] dark:text-[#00D1FF] mb-1.5">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>Personal de Confianza (Supremo Tribunal de Justicia)</span>
                </div>
                <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed mb-1.5">
                  Atención y trámite directo con nosotros en las <strong>Oficinas Centrales de {COMPANY_INFO.name}:</strong>
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-300 mb-2">
                  {COMPANY_INFO.address}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="tel:6144111544"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#396CAE]/15 hover:bg-[#396CAE]/25 text-[#1E3A8A] dark:text-[#00D1FF] text-xs font-mono font-bold border border-[#396CAE]/40 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> {COMPANY_INFO.officePhone}
                  </a>
                  <a
                    href="tel:6141845849"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#396CAE]/15 hover:bg-[#396CAE]/25 text-[#1E3A8A] dark:text-[#00D1FF] text-xs font-mono font-bold border border-[#396CAE]/40 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" /> Cel. {COMPANY_INFO.cellPhone}
                  </a>
                </div>
              </div>
            </div>

            {/* Contact Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 text-xs sm:text-sm">
              {/* Institution and Physical Address */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-[#249E82]/40 flex items-center justify-center text-emerald-700 dark:text-[#4CD360] shrink-0 shadow-xs">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 text-xs block font-bold">
                      Razón Social Registrada:
                    </span>
                    <strong className="text-slate-900 dark:text-white text-sm">
                      {COMPANY_INFO.name}
                    </strong>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-[#249E82]/40 flex items-center justify-center text-emerald-700 dark:text-[#4CD360] shrink-0 shadow-xs">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 text-xs block font-bold">
                      Horario de Atención al Público:
                    </span>
                    <p className="text-slate-900 dark:text-white font-semibold">
                      {COMPANY_INFO.businessHours}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-[#249E82]/40 flex items-center justify-center text-[#1E40AF] dark:text-[#00D1FF] shrink-0 shadow-xs">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 text-xs block font-bold">
                      Canal Digital y Correo Corporativo:
                    </span>
                    <a
                      href={`mailto:${COMPANY_INFO.email}`}
                      className="text-emerald-800 dark:text-[#4CD360] font-semibold underline hover:opacity-80 block"
                    >
                      {COMPANY_INFO.email}
                    </a>
                  </div>
                </div>
              </div>

              {/* UNE Contact with Explicit Physical Address */}
              <div className="space-y-4">
                <div className="p-4 glass-card rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30">
                  <span className="text-[11px] font-black uppercase text-[#1E40AF] dark:text-[#00D1FF] block mb-1">
                    Unidad Especializada de Atención a Usuarios (UNE)
                  </span>
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-semibold mb-1">
                    {COMPANY_INFO.uneContact.title}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-1.5">
                    <strong>Domicilio Físico UNE:</strong> {COMPANY_INFO.uneContact.address}
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 font-mono mb-1">
                    <Phone className="w-3.5 h-3.5 inline mr-1" />
                    {COMPANY_INFO.uneContact.phone}
                  </p>
                  <a
                    href={`mailto:${COMPANY_INFO.uneContact.email}`}
                    className="text-xs text-emerald-800 dark:text-[#4CD360] font-mono underline block"
                  >
                    {COMPANY_INFO.uneContact.email}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
