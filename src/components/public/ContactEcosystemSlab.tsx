import React from 'react';
import { MapPin, Phone, Mail, Clock, ShieldCheck } from 'lucide-react';
import { COMPANY_INFO } from '../../data/cruseData';

export const ContactEcosystemSlab: React.FC = () => {
  return (
    <section id="contacto" className="py-12 lg:py-20 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Floating Emerald Glass Slab (Directly inspired by Slide 9) */}
        <div className="relative group">
          {/* Neon ambient rim (Solo en Modo Oscuro conforme a Guardrail 3) */}
          <div className="absolute -inset-3 bg-gradient-to-r from-[#249E82] via-[#00D1FF] to-[#396CAE] opacity-0 dark:opacity-25 blur-2xl rounded-3xl dark:group-hover:opacity-40 transition-opacity" />

          {/* The Slab */}
          <div className="relative glass-slab-emerald rounded-3xl p-8 sm:p-12 shadow-lg dark:shadow-2xl border border-slate-200 dark:border-[#249E82]/50 transform hover:-translate-y-1 transition-all">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200 dark:border-white/10 mb-8">
              <div>
                <span className="text-xs uppercase tracking-widest font-black text-emerald-800 dark:text-[#4CD360] block mb-1">
                  Atención Institucional y Sucursal Central
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                  Conecte con nuestro ecosistema
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
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 text-xs block font-bold">
                      Domicilio Corporativo:
                    </span>
                    <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                      {COMPANY_INFO.address}
                    </p>
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
              </div>

              {/* Phones, Digital & UNE Contact */}
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-white dark:bg-black/30 border border-slate-200 dark:border-[#249E82]/40 flex items-center justify-center text-[#1E40AF] dark:text-[#00D1FF] shrink-0 shadow-xs">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400 text-xs block font-bold">
                      Teléfonos de Oficina y Atención Celular:
                    </span>
                    <p className="text-slate-900 dark:text-white font-mono font-bold text-sm">
                      Oficina: {COMPANY_INFO.officePhone} | Cel. {COMPANY_INFO.cellPhone}
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

                {/* Unidad Especializada UNE */}
                <div className="p-3.5 glass-card rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-black/30">
                  <span className="text-[11px] font-black uppercase text-[#1E40AF] dark:text-[#00D1FF] block mb-0.5">
                    Unidad Especializada de Atención a Usuarios (UNE)
                  </span>
                  <p className="text-xs text-slate-700 dark:text-slate-300">
                    {COMPANY_INFO.uneContact.title}
                  </p>
                  <a
                    href={`mailto:${COMPANY_INFO.uneContact.email}`}
                    className="text-xs text-emerald-800 dark:text-[#4CD360] font-mono underline block mt-1"
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
