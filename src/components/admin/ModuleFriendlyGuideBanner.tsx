import React, { useState } from 'react';
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, FileCheck, HelpCircle, Sparkles, X } from 'lucide-react';

export type AdminTabId =
  | 'dashboard' | 'pre_applications' | 'executive' | 'expedientes' | 'reconciliation'
  | 'collections' | 'funding' | 'credit_bureau' | 'pld' | 'audit' | 'users';

export interface ModuleFriendlyGuide {
  tabNumber: number;
  friendlyTitle: string;
  whatItDoes: string;
  contractDeliverable: string;
  threeSimpleSteps: readonly [string, string, string];
}

export const MODULE_FRIENDLY_GUIDES: Record<AdminTabId, ModuleFriendlyGuide> = {
  dashboard: {
    tabNumber: 1,
    friendlyTitle: '1. Resumen General de Cartera',
    whatItDoes:
      'Antes había que abrir varias hojas de Excel para sumar cuánto dinero estaba prestado o quién tenía atrasos. Esta pantalla suma todo al instante y te muestra con colores de semáforo la salud de todos los créditos en Chihuahua, León y Cancún.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.3 y Visión Ejecutiva C.1 / C.4: Sustitución definitiva de hojas de Excel por una base de datos central con Semáforo de Morosidad (Verde, Amarillo y Rojo) y supervisión por 3 Hubs Nacionales.',
    threeSimpleSteps: [
      'Paso 1: Elige arriba la región que deseas revisar ("Nacional (3 Hubs)", "Chihuahua", "León" o "Cancún").',
      'Paso 2: Revisa el Semáforo de colores (Verde = Al corriente, Amarillo = En licencia o espera, Rojo = Con atraso) y las 4 tarjetas de dinero.',
      'Paso 3: En la tabla inferior haz clic en "Ver Detalle" para abrir la ficha de un cliente o en "Exportar a Excel (.CSV)" para descargar tu reporte.',
    ],
  },
  pre_applications: {
    tabNumber: 2,
    friendlyTitle: '2. Buzón de Pre-Solicitudes',
    whatItDoes:
      'Funciona igual que tu bandeja de correo electrónico: aquí llegan automáticamente los datos de los trabajadores que cotizaron su préstamo en la página pública y pidieron ser atendidos por un promotor, sin enviar documentos personales por chat.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.2, B.3 y Visión Ejecutiva C.5: Captación digital desde el Simulador Público con aviso automático al WhatsApp de promoción de la Lic. Alma y control de seguimiento (No leído → Leído → Atendido).',
    threeSimpleSteps: [
      'Paso 1: Haz clic en cualquier solicitud nueva de la columna izquierda (con punto verde); el sistema la marcará automáticamente como "Leído".',
      'Paso 2: Revisa en el panel derecho el monto simulado, convenio y teléfono del trabajador, y presiona "Contactar al Solicitante por WhatsApp".',
      'Paso 3: Escribe tus observaciones en el cuadro de notas de cita y presiona el botón "Marcar como Atendido".',
    ],
  },
  executive: {
    tabNumber: 3,
    friendlyTitle: '3. Suite Ejecutiva y Simuladores (5 Módulos)',
    whatItDoes:
      'Reúne en un solo lugar las 5 herramientas para Dirección, Mesa de Control e Inversionistas: la presentación comercial de 10 láminas, el proyector de ganancias a 36 meses, la calculadora de descuento quincenal del trabajador, el comparador frente a bancos y el mapa de sedes.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque B (B.1 a B.5) y Visión Ejecutiva C.8 / C.9: Entrega de los 5 Módulos Ejecutivos de Valor con evaluación del límite del 30% de sueldo neto y transparencia total de tasas sin comisiones ocultas.',
    threeSimpleSteps: [
      'Paso 1: Elige cualquiera de los 5 botones superiores (por ejemplo "3. Simulador & Scoring Aprobador" para evaluar si un trabajador califica).',
      'Paso 2: Captura el monto, plazo, sueldo neto quincenal y antigüedad del trabajador y presiona "Emitir Dictamen de Scoring para Aprobador".',
      'Paso 3: Consulta el semáforo de recomendación (Bajo, Medio o Alto riesgo), la cuota quincenal exacta con seguro de $22.85 y la tabla de pagos.',
    ],
  },
  expedientes: {
    tabNumber: 4,
    friendlyTitle: '4. Expedientes de Clientes',
    whatItDoes:
      'Es el archivero digital de todas las solicitudes y créditos levantados por los promotores en campo con la cámara guiada de su celular, evitando que las fotos de identificaciones o recibos se queden guardadas en los teléfonos.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.2 y Visión Ejecutiva C.10: Digitalización segura de expedientes por convenio institucional (STSGECH, Supremo Tribunal, Bajío y Sur) y generación de archivos para el sistema SIF/CIB.',
    threeSimpleSteps: [
      'Paso 1: Usa la barra de búsqueda o los filtros por Convenio y Estatus para localizar rápidamente el expediente de cualquier trabajador.',
      'Paso 2: Revisa en el renglón su monto, plazo, descuento quincenal y estado de validación.',
      'Paso 3: Utiliza los botones superiores para exportar el listado o preparar el archivo de carga para el sistema contable SIF/CIB.',
    ],
  },
  reconciliation: {
    tabNumber: 5,
    friendlyTitle: '5. Conciliación Quincenal de Nómina',
    whatItDoes:
      'Antes tomaba de 3 a 5 días comparar renglón por renglón en Excel lo que se mandó a cobrar al sindicato contra lo que realmente depositó Tesorería. Este módulo hace ese cruce en segundos y detecta quién pagó completo, quién pagó parcial y quién faltó.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.4 y Visión Ejecutiva C.6: Motor de Conciliación Quincenal Inteligente con prelación automática de pagos (1° Seguro $22.85 → 2° Interés → 3° IVA → 4° Capital) y descarga de archivo para SIF/CIB.',
    threeSimpleSteps: [
      'Paso 1: Selecciona el Convenio y la Quincena, y presiona "Generar Layout de Cobro Sindical" para obtener la lista que se envía a Recursos Humanos.',
      'Paso 2: Cuando Tesorería envíe los pagos retenidos, sube el archivo y presiona "Previsualizar Cruce Quincenal" para ver las diferencias antes de guardar.',
      'Paso 3: Presiona "Confirmar y Aplicar Conciliación en Firme" y descarga tu archivo listo para Logic Systems SIF/CIB.',
    ],
  },
  collections: {
    tabNumber: 6,
    friendlyTitle: '6. Cobranza, Licencias y Reestructuras',
    whatItDoes:
      'Permite atender casos especiales de los trabajadores sin perder el orden: pausar cobros cuando un empleado pide licencia sin goce de sueldo, congelar recargos por baja laboral, unir varios préstamos en uno solo (reestructura) y revisar el seguro de vida.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.4 y Visión Ejecutiva C.7: Control estricto de cartera vencida, pausa por licencias sin goce de sueldo, consolidación de hasta 4 créditos Normales en 1 y cotejo de póliza de seguro de vida de $35,000 MXN.',
    threeSimpleSteps: [
      'Paso 1: Busca al trabajador y elige la pestaña que necesites: "1. Licencias y Convenios", "2. Reestructura N-a-1" o "3. Cotejo Póliza Seguro de Vida".',
      'Paso 2: Si el trabajador salió de permiso sin sueldo, selecciona "Suspensión Temporal", anota el motivo y confirma para pausar sus recargos.',
      'Paso 3: Si va a renovar o unir hasta 4 préstamos Normales en uno nuevo, márcalos en la pestaña 2 y presiona "Consolidar en Nuevo Contrato".',
    ],
  },
  funding: {
    tabNumber: 7,
    friendlyTitle: '7. Inversionistas y Pagarés',
    whatItDoes:
      'Lleva el control claro del dinero que los inversionistas confían a Microfinanciera Cruse: registra sus pagarés, calcula automáticamente los intereses de cada mes (simples o reinvertibles) y descuenta la retención de impuestos (ISR).',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.3 y Visión Ejecutiva C.3: Administración centralizada de fondeo e inversionistas con emisión de pagarés y cálculo mensual automático sin riesgo de duplicar cobros.',
    threeSimpleSteps: [
      'Paso 1: Haz clic en "+ Nuevo Inversionista", escribe su nombre, capital inicial, tasa anual y retención de ISR, y presiona "Guardar y Generar Pagaré".',
      'Paso 2: Al final del mes, elige la fecha en el calendario superior y presiona el botón verde de Corte Mensual para calcular los rendimientos de todos.',
      'Paso 3: Si necesitas anotar una instrucción especial sobre algún inversionista, presiona "Ver Notas" en su renglón.',
    ],
  },
  credit_bureau: {
    tabNumber: 8,
    friendlyTitle: '8. Reporte a Círculo de Crédito',
    whatItDoes:
      'Prepara y revisa en un clic el archivo mensual oficial que Microfinanciera Cruse debe entregar a Círculo de Crédito (con su clave oficial 001496), marcando correctamente las cuentas al corriente, liquidadas o reestructuradas.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque D.2: Generador automatizado y validado del reporte mensual regulatorio para Sociedades de Información Crediticia (Círculo de Crédito, otorgante 001496).',
    threeSimpleSteps: [
      'Paso 1: Selecciona el Periodo de Corte mensual y el Tipo de Cartera que deseas reportar.',
      'Paso 2: Presiona "Previsualizar Cartera a Reportar" para revisar en pantalla que todos los saldos y claves estén completos.',
      'Paso 3: Haz clic en "Generar y Descargar Layout Oficial (001496)" para guardar el archivo listo para subir a Círculo de Crédito.',
    ],
  },
  pld: {
    tabNumber: 9,
    friendlyTitle: '9. Prevención de Lavado de Dinero (PLD)',
    whatItDoes:
      'Protege a la financiera ante la CNBV revisando automáticamente que ningún solicitante, cliente o inversionista aparezca en las listas oficiales de personas bloqueadas o de riesgo (SAT 69-B, UIF, OFAC o funcionarios públicos PEP).',
    contractDeliverable:
      'Contrato Fase 1 — Bloque D.1 y Visión Ejecutiva C.2: Blindaje regulatorio PLD/FT ante la CNBV y UIF con carga de listas oficiales, barrido general de cartera en un clic y emisión de Acta de Cumplimiento.',
    threeSimpleSteps: [
      'Paso 1: En "Ingestar Lista Oficial", selecciona el archivo de lista oficial (SAT 69-B, UIF u OFAC), presiona "Previsualizar" y luego guárdalo en la base.',
      'Paso 2: Presiona el botón superior derecho "Ejecutar Barrido Integral (Cartera + Fondeo)" para revisar a todos los clientes e inversionistas.',
      'Paso 3: Haz clic en "Descargar Acta CNBV/UIF" para guardar tu comprobante de auditoría, o en "Dictaminar" si necesitas resolver alguna alerta.',
    ],
  },
  audit: {
    tabNumber: 10,
    friendlyTitle: '10. Historial de Seguridad (Bitácora 5 Años)',
    whatItDoes:
      'Es la libreta de seguridad inborrable del portal: guarda automáticamente quién entró al sistema, a qué hora, desde qué computadora y qué movimiento hizo, conservando el historial por 5 años para cualquier revisión de autoridades.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.5 y Visión Ejecutiva C.2: Bitácora de auditoría inalterable con retención regulatoria de 5 años y botón de verificación de integridad para inspecciones de CNBV e INAI.',
    threeSimpleSteps: [
      'Paso 1: Si buscas qué hizo un usuario en particular, escribe su correo en el buscador o elige el tipo de acción en el menú desplegable.',
      'Paso 2: Revisa en la tabla la fecha, hora exacta, usuario y detalle del movimiento realizado.',
      'Paso 3: Cuando un auditor pida comprobar que ningún registro fue borrado ni alterado, presiona el botón verde superior derecho de verificación.',
    ],
  },
  users: {
    tabNumber: 11,
    friendlyTitle: '11. Usuarios y Accesos por Celular',
    whatItDoes:
      'Exclusivo para Dirección / Administrador: permite dar de alta al equipo registrando su número celular para que reciban su código de acceso por mensaje SMS (sin instalar aplicaciones), cambiar permisos o cortar el acceso al instante si alguien causa baja.',
    contractDeliverable:
      'Contrato Fase 1 — Bloque A.1 y A.6: Control de acceso con doble verificación por código SMS al celular, segregación de funciones por puesto y botón de suspensión inmediata de cuenta.',
    threeSimpleSteps: [
      'Paso 1: Para dar de alta a un colaborador, llena su nombre, correo, puesto y teléfono celular en el panel izquierdo y presiona "Crear Usuario".',
      'Paso 2: Entrega al colaborador su Carta de Bienvenida con su clave inicial y sus 8 códigos de respaldo para emergencias.',
      'Paso 3: Si un colaborador cambia de celular o deja de laborar en la empresa, usa los botones "Cambiar Celular" o "Suspender Acceso (Baja)" en su renglón.',
    ],
  },
};

interface ModuleFriendlyGuideBannerProps {
  activeTab: AdminTabId;
  isManualModalOpen: boolean;
  onOpenManualModal: () => void;
  onCloseManualModal: () => void;
}

export const ModuleFriendlyGuideBanner: React.FC<ModuleFriendlyGuideBannerProps> = ({
  activeTab,
  isManualModalOpen,
  onOpenManualModal,
  onCloseManualModal,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const guide = MODULE_FRIENDLY_GUIDES[activeTab];

  return (
    <>
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-[#0D1B3E] via-slate-900 to-[#0D1B3E] border border-[#00D1FF]/35 shadow-lg overflow-hidden">
        <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-[#00D1FF]/15 text-[#00D1FF] border border-[#00D1FF]/30">
              <HelpCircle className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Ayuda en Línea · Módulo {guide.tabNumber} de 11
                </span>
                <h2 className="text-sm md:text-base font-extrabold text-white">{guide.friendlyTitle}</h2>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Explicación amigable para operación diaria: qué hace esta pantalla, qué punto del contrato cumple y cómo usarla en 3 pasos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenManualModal}
              className="px-3.5 py-1.5 rounded-xl bg-[#249E82] hover:bg-[#1e856e] text-white text-xs font-bold flex items-center gap-1.5 shadow transition-all"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Ver Manual Completo Fase 1</span>
            </button>
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-all"
            >
              <span>{isCollapsed ? 'Mostrar Guía' : 'Ocultar Guía'}</span>
              {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
              <div className="text-xs font-extrabold text-[#00D1FF] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#D4AF37]" />
                <span>1. ¿Qué hace este módulo en tu día a día?</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{guide.whatItDoes}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 space-y-1.5">
              <div className="text-xs font-extrabold text-emerald-400 flex items-center gap-1.5">
                <FileCheck className="w-4 h-4" />
                <span>2. ¿Qué punto del Contrato de Fase 1 logramos aquí?</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">{guide.contractDeliverable}</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-amber-500/30 space-y-2">
              <div className="text-xs font-extrabold text-[#D4AF37] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>3. ¿Cómo usarlo en 3 pasos sencillos?</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-200">
                {guide.threeSimpleSteps.map((stepText, idx) => (
                  <li key={idx} className="leading-relaxed flex items-start gap-1.5">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{stepText}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#0D1B3E] border-b border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-5 h-5 text-[#00D1FF]" />
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Manual Amigable de Fase 1 — Guía de los 11 Módulos para Usuarios No Técnicos
                  </h3>
                  <p className="text-xs text-slate-300">Qué hace cada pantalla, qué punto del Contrato cumple y cómo operarla en 3 pasos.</p>
                </div>
              </div>
              <button type="button" onClick={onCloseManualModal} className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1">
                <X className="w-4 h-4" />
                <span>Cerrar Manual</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {(Object.values(MODULE_FRIENDLY_GUIDES) as ModuleFriendlyGuide[]).map((item) => (
                <div key={item.tabNumber} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h4 className="text-sm font-extrabold text-[#00D1FF]">{item.friendlyTitle}</h4>
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Módulo {item.tabNumber} de 11</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed"><strong className="text-white">¿Qué hace en tu día a día?: </strong>{item.whatItDoes}</p>
                  <p className="text-xs text-emerald-300 leading-relaxed"><strong className="text-white">Punto del Contrato Fase 1: </strong>{item.contractDeliverable}</p>
                  <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-xs font-bold text-[#D4AF37] block">Cómo interactuar en 3 pasos:</span>
                    {item.threeSimpleSteps.map((st, i) => (<p key={i} className="text-xs text-slate-300">{st}</p>))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
