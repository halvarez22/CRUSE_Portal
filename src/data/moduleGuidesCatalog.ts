/**
 * CATÁLOGO DE GUÍAS OPERATIVAS EN LENGUAJE CLARO (SIN TECNICISMOS)
 * Expediente: CRUSE-APO-2026-067 (Hallazgos A.1–A.6, B.6, B.7, D.7 + Guardrail Forense 8)
 *
 * Redactado en español cotidiano para Mesa de Control, Promotores, Tesorería y Cumplimiento.
 * Cero acrónimos técnicos incomprensibles, retención regulatoria CNBV de 10 años mínimos,
 * autoridad garante Secretaría Anticorrupción y Buen Gobierno, y separación estricta entre
 * Convenios Institucionales, Plazas Geográficas y Sistemas Contables.
 */

export type FriendlyGuideModuleId =
  | 'dashboard'
  | 'pre_applications'
  | 'executive'
  | 'expedientes'
  | 'reconciliation'
  | 'funding'
  | 'collections'
  | 'credit_bureau'
  | 'pld'
  | 'audit'
  | 'cloud_migration'
  | 'operations_hub'
  | 'users';

export type AdminTabId = FriendlyGuideModuleId;

export interface ModuleGuideItem {
  id: FriendlyGuideModuleId;
  title: string;
  phaseBadge: 'FASE 1' | 'FASE 2' | 'FASE 3';
  contractRef: string;
  plainSummary: string;
  whatItReplaces: string;
  steps: string[];
  verifyTip: string;
}

export interface ModuleFriendlyGuide {
  tabNumber: number;
  friendlyTitle: string;
  phaseBadge: 'FASE 1' | 'FASE 2' | 'FASE 3';
  whatItDoes: string;
  contractDeliverable: string;
  threeSimpleSteps: string[];
}

export const MODULE_GUIDES: Readonly<Record<FriendlyGuideModuleId, ModuleGuideItem>> = {
  dashboard: {
    id: 'dashboard',
    title: '1. Tablero Principal de Cartera',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.1 (Tablero Directivo en Tiempo Real)',
    plainSummary:
      'Muestra de un vistazo cuánto dinero está prestado, cuánto saldo falta por cobrar y cómo se comporta la morosidad real en cada plaza operativa (Chihuahua, León y Cancún).',
    whatItReplaces:
      'Sustituye tener que abrir varias hojas de Excel y sumar saldos a mano para saber el estado del negocio.',
    steps: [
      'Revisa las tarjetas superiores con el capital colocado, saldo vigente y cartera vencida.',
      'Filtra por plaza geográfica (Chihuahua, León o Cancún) para revisar resultados regionales.',
      'El semáforo mide únicamente días reales de atraso: Verde (al corriente, 0 días), Amarillo (1 a 30 días), Naranja (31 a 89 días) y Rojo (90 días o más / cobranza extrajudicial). Las licencias con oficio y los trámites en curso se muestran con una etiqueta separada y no se cuentan como atraso.',
    ],
    verifyTip:
      'Prueba práctica: cambia entre Chihuahua, León y Cancún y verifica que la suma de las tres plazas coincide exactamente con el total general.',
  },
  pre_applications: {
    id: 'pre_applications',
    title: '2. Bandeja de Solicitudes del Portal Web',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.2 (Captación Digital y Simulador Público)',
    plainSummary:
      'Aquí llegan las solicitudes que los trabajadores envían desde la página pública de Cruse después de cotizar su préstamo en el simulador (que incluye el cálculo informativo del CAT y los datos de la Unidad Especializada UNE).',
    whatItReplaces:
      'Evita que las solicitudes queden perdidas en correos sueltos o mensajes de WhatsApp sin seguimiento.',
    steps: [
      'Abre una solicitud para revisar el monto pedido, plazo y convenio institucional del trabajador.',
      'El sistema verifica automáticamente que el descuento quincenal respete el tope máximo permitido por el convenio de su dependencia (30%).',
      'Asigna el caso a un promotor o pásalo a revisión documental para continuar el trámite.',
    ],
    verifyTip:
      'Prueba práctica: entra a la calculadora pública, envía una solicitud de prueba y comprueba que aparece de inmediato en esta bandeja.',
  },
  executive: {
    id: 'executive',
    title: '3. Centro Directivo y Proyecciones (5 Sub-herramientas)',
    phaseBadge: 'FASE 2',
    contractRef: 'Contrato Fase 2 — Entregable 2.1 (Inteligencia de Negocio y Análisis)',
    plainSummary:
      'Agrupa cinco herramientas internas de apoyo para Dirección y Operaciones: presentación ejecutiva, simulador de rendimiento de cartera a 36 meses, evaluador de riesgo crediticio, comparador contra bancos y el asistente virtual interno.',
    whatItReplaces:
      'Reemplaza presentaciones estáticas desactualizadas y consultas manuales repetitivas sobre la cartera.',
    steps: [
      'Usa las pestañas internas para moverte entre el simulador financiero, el evaluador de riesgo y el asistente interno.',
      'En el asistente interno puedes escribir preguntas cotidianas (por ejemplo: "¿cuánto capital tenemos vigente en Chihuahua?").',
      'Por privacidad, el asistente interno responde con cifras globales y nunca comparte datos personales confidenciales con servicios externos.',
    ],
    verifyTip:
      'Prueba práctica: pregunta al asistente interno el total de créditos activos y compáralo con el Tablero Principal.',
  },
  expedientes: {
    id: 'expedientes',
    title: '4. Expedientes Digitales y Alta de Créditos',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.3 (Expediente Seguro y Control de Convenios)',
    plainSummary:
      'Es el archivo central de todos los clientes y sus préstamos activos. Separa claramente el Convenio Institucional del trabajador (STSGECH, Supremo Tribunal de Justicia, Jubilados y Pensionados) de su Plaza Geográfica (Chihuahua, León o Cancún).',
    whatItReplaces:
      'Reemplaza carpetas físicas con copias de INE y archivos de Excel donde se capturaban clientes a mano.',
    steps: [
      'Busca a un cliente por nombre o clave; los datos confidenciales y las fotos del INE se guardan cifrados y nunca se envían sin protección por WhatsApp.',
      'En renovaciones, el sistema solo libera la capacidad del descuento anterior cuando el préstamo previo queda vinculado para liquidarse con la misma dispersión.',
      'Desde aquí también se generan los archivos oficiales de alta para SIF/CIB (Logic Systems), que funciona como el sistema auxiliar de cartera y cumplimiento.',
    ],
    verifyTip:
      'Prueba práctica: abre cualquier expediente y revisa su historial de préstamos, póliza de seguro de vida y notas operativas.',
  },
  reconciliation: {
    id: 'reconciliation',
    title: '5. Conciliación Quincenal de Nómina',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.4 (Conciliación Masiva y Aplicación de Pagos)',
    plainSummary:
      'Cruza en segundos el archivo de descuentos recibido de cada dependencia contra las cuotas esperadas por Cruse y aplica cada pago siguiendo el orden legal del contrato: Seguro → Comisiones → Moratorios → Interés Ordinario e IVA → Capital.',
    whatItReplaces:
      'Elimina jornadas de 3 a 5 días buscando diferencias quincenales renglón por renglón en Excel.',
    steps: [
      'Carga el archivo de descuentos de la quincena correspondiente al convenio.',
      'Revisa en pantalla los pagos exactos, pagos parciales y empleados que no aparecieron en nómina.',
      'Confirma la aplicación para actualizar saldos y descargar el archivo de actualización para SIF/CIB (Logic Systems).',
    ],
    verifyTip:
      'Prueba práctica: compara un corte de nómina en paralelo con tu hoja de Excel usando la Cédula de Pruebas Paralelas UAT.',
  },
  funding: {
    id: 'funding',
    title: '7. Fondeo, Inversionistas y Póliza Aspel COI',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.5 (Control de Inversionistas y Póliza Contable)',
    plainSummary:
      'Administra los contratos privados de fondeo, calcula intereses simples o capitalizables (con opción de conteo de días reales o convención 365/30.4), aplica automáticamente la retención de ISR según el régimen fiscal del contrato y genera la póliza contable para Aspel COI.',
    whatItReplaces:
      'Sustituye las hojas manuales de relación de inversionistas y el armado a mano de la póliza mensual en Aspel COI.',
    steps: [
      'Al registrar un fondeador, selecciona su clasificación legal (Accionista, Línea Institucional o Fondeo Privado Exento — sin captación del público) y su régimen fiscal de ISR (Sistema Financiero sobre capital o Mutuo PF 20% sobre interés).',
      'Registra abonos o retiros intermedios; el sistema divide los tramos sin errores en meses de 31 días.',
      'Descarga la póliza contable mensual lista para importar a Aspel COI (Sistema de Contabilidad General, distinto a SIF/CIB que es el auxiliar de cartera).',
    ],
    verifyTip:
      'Prueba práctica: genera un corte mensual y verifica que el ISR sobre mutuo de persona física se calcula sobre el interés devengado y nunca sobre el capital.',
  },
  collections: {
    id: 'collections',
    title: '6. Cobranza, Licencias y Reestructuras',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.6 (Gestión de Cartera y Pago Sostenido)',
    plainSummary:
      'Controla licencias sin goce de sueldo con oficio, cobranza extrajudicial y reestructuras que consolidan hasta 4 préstamos normales en uno solo.',
    whatItReplaces:
      'Sustituye controles manuales de oficios de suspensión y cálculos manuales de saldos absorbidos.',
    steps: [
      'Registra una licencia oficial capturando el número de oficio; el sistema pausa el cobro sin clasificar al trabajador como moroso.',
      'Al reestructurar créditos que venían con atraso, el nuevo crédito queda marcado como "Reestructurado en Observación" hasta completar 3 pagos consecutivos completos y puntuales (regla CNBV de Pago Sostenido).',
      'Consulta la estimación preventiva de reservas (EPRC) según los días de atraso de cada cuenta.',
    ],
    verifyTip:
      'Prueba práctica: verifica que una cuenta reestructurada proveniente de atraso no cambia a estado sano sino hasta acreditar 3 pagos oportunos.',
  },
  credit_bureau: {
    id: 'credit_bureau',
    title: '8. Reportes a Círculo de Crédito',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.7 (Cumplimiento de Información Crediticia)',
    plainSummary:
      'Prepara el archivo mensual oficial de cartera para Círculo de Crédito (incluyendo cuentas activas y bajas laborales con saldo pendiente). Conforme a la ley mexicana, reportar a una Sociedad de Información Crediticia cumple la obligación legal al existir interconexión entre sociedades.',
    whatItReplaces:
      'Evita armar a mano archivos de texto rígidos que suelen rechazarse por errores de formato.',
    steps: [
      'Selecciona el mes de corte y revisa las cuentas listas para reporte.',
      'Verifica las claves de observación aplicables (por ejemplo, baja laboral con saldo vigente).',
      'Descarga el archivo oficial validado listo para envío a Círculo de Crédito.',
    ],
    verifyTip:
      'Prueba práctica: genera una vista previa del archivo mensual y confirma que los saldos coinciden con el cierre de cartera.',
  },
  pld: {
    id: 'pld',
    title: '9. Prevención de Lavado de Dinero (PLD/FT) y UNE',
    phaseBadge: 'FASE 2',
    contractRef: 'Contrato Fase 2 — Entregable 2.4 (Cumplimiento CNBV / UIF y Matriz de Riesgo)',
    plainSummary:
      'Integra el cumplimiento completo para SOFOM: carga inteligente de listas oficiales (Personas Bloqueadas UIF, Lista Consolidada de la ONU y OFAC), listas de riesgo fiscal/debida diligencia (SAT 69-B, PEPs, GAFI y Paraísos Fiscales), Matriz de Riesgo de clientes y generación de reportes SITI de 41 columnas para la UIF (Relevantes, Inusuales, 24 Horas e Internos Preocupantes).',
    whatItReplaces:
      'Reemplaza búsquedas manuales archivo por archivo y formatos de Excel propensos a errores ante auditorías de la CNBV.',
    steps: [
      'Sube cualquier archivo oficial de listas (CSV, Excel o XML); el asistente detecta las columnas automáticamente y te muestra una vista previa antes de guardar.',
      'Ejecuta el barrido masivo de cartera e inversionistas y revisa las alertas en la bandeja del Oficial de Cumplimiento.',
      'Genera los reportes SITI de 41 columnas para la UIF y consulta los folios de aclaraciones de la Unidad Especializada (UNE / REDECO-REUNE).',
    ],
    verifyTip:
      'Prueba práctica: descarga la plantilla oficial de Lista ONU o UIF, cárgala y confirma que el barrido genera el acta certificada.',
  },
  audit: {
    id: 'audit',
    title: '10. Bitácora Blindada de Auditoría (10 Años CNBV)',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.8 (Trazabilidad Forense Inalterable)',
    plainSummary:
      'Registra automáticamente cada movimiento importante del portal (inicios de sesión, consultas de expedientes, cambios de parámetros, altas de usuarios y cortes). Ningún usuario puede borrar ni modificar registros pasados y la información se conserva por al menos 10 años conforme a las disposiciones PLD/FT de la CNBV y los lineamientos de la Secretaría Anticorrupción y Buen Gobierno.',
    whatItReplaces:
      'Sustituye bitácoras en papel o archivos locales fáciles de alterar o extraviar.',
    steps: [
      'Filtra movimientos por usuario, fecha o tipo de operación.',
      'Usa el botón de verificación de integridad para comprobar que ningún registro ha sido manipulado.',
      'Descarga el respaldo auditable para entregarlo en revisiones de CNBV, CONDUSEF o auditoría externa.',
    ],
    verifyTip:
      'Prueba práctica: realiza un cambio administrativo y verifica que aparece de inmediato en el primer renglón con fecha, hora y responsable.',
  },
  cloud_migration: {
    id: 'cloud_migration',
    title: '11. Migración Segura desde Excel a la Nube',
    phaseBadge: 'FASE 3',
    contractRef: 'Contrato Fase 3 — Entregable 3.3 (Migración Histórica y Plan de Regreso Seguro)',
    plainSummary:
      'Permite subir los historiales de Excel de forma controlada, comprobando que la suma de saldos cuadre al centavo ($0.00 de diferencia) antes de aceptar el lote.',
    whatItReplaces:
      'Elimina migraciones manuales riesgosas donde se pierden decimales o se duplican contratos.',
    steps: [
      'Carga el lote en modo paralelo de pruebas y verifica que la diferencia contable sea exactamente $0.00.',
      'El Plan de Regreso (Rollback) solo está permitido mientras el lote esté en pruebas y no tenga ningún pago, conciliación o reestructura posterior.',
      'Una vez activado el corte productivo o registrado el primer pago, el sistema bloquea cualquier reversión masiva para proteger la integridad de la cartera.',
    ],
    verifyTip:
      'Prueba práctica: confirma que el sistema impide revertir un lote si ya existen pagos aplicados sobre sus contratos.',
  },
  operations_hub: {
    id: 'operations_hub',
    title: '12. Centro de Operaciones, Conectores y Parámetros',
    phaseBadge: 'FASE 3',
    contractRef: 'Contrato Fase 3 — Entregable 3.4 (Monitoreo Operativo y Configuración Central)',
    plainSummary:
      'Muestra el estado de salud del portal, la comunicación segura con los sistemas externos y permite a Dirección ajustar parámetros vivos (prima de seguro, suma asegurada, rangos de tasas especiales y tasas anuales de ISR) sin pedir cambios de programación.',
    whatItReplaces:
      'Evita depender de soporte técnico para actualizar tarifas institucionales o revisar el estado de los conectores.',
    steps: [
      'Consulta los indicadores de disponibilidad de las Fases 1, 2 y 3.',
      'En el panel de Parámetros Financieros (exclusivo de Dirección), edita valores vigentes; los cambios quedan registrados en la bitácora y solo afectan contratos nuevos.',
      'En el entorno productivo oficial, los botones de simulación de pruebas permanecen ocultos automáticamente por seguridad.',
    ],
    verifyTip:
      'Prueba práctica: revisa el panel de parámetros vigentes y confirma que los valores coinciden con la política autorizada por Dirección.',
  },
  users: {
    id: 'users',
    title: '13. Administración de Usuarios y Seguridad de Acceso',
    phaseBadge: 'FASE 1',
    contractRef: 'Contrato Fase 1 — Entregable 1.9 (Control de Roles y Doble Factor 2FA)',
    plainSummary:
      'Controla quién puede entrar al portal y qué módulos puede ver según su puesto. Los puestos directivos y de control utilizan aplicación autenticadora de doble factor (Google/Microsoft Authenticator) y todo usuario nuevo debe cambiar su contraseña temporal obligatoriamente en su primer acceso.',
    whatItReplaces:
      'Elimina contraseñas compartidas y accesos sin control de permisos.',
    steps: [
      'Al dar de alta a un colaborador, entrega su contraseña temporal en persona o por canal privado; el sistema le obligará a crear su propia clave personal al entrar por primera vez.',
      'Los roles críticos (Dirección, Cumplimiento y Operaciones) validan su ingreso mediante aplicación autenticadora en su teléfono, evitando riesgos de clonación de chip SMS.',
      'Cualquier alta o cambio de permisos hecho por Dirección genera una alerta automática inmutable para revisión del Oficial de Cumplimiento.',
    ],
    verifyTip:
      'Prueba práctica: crea un usuario de prueba y verifica que el sistema exige cambiar la contraseña temporal antes de mostrar el portal.',
  },
};

export const ORDERED_MODULE_GUIDES: readonly ModuleGuideItem[] = Object.values(MODULE_GUIDES);

export const MODULE_FRIENDLY_GUIDES: Readonly<Record<AdminTabId, ModuleFriendlyGuide>> =
  ORDERED_MODULE_GUIDES.reduce(
    (acc, item, idx) => {
      acc[item.id] = {
        tabNumber: idx + 1,
        friendlyTitle: item.title,
        phaseBadge: item.phaseBadge,
        whatItDoes: item.plainSummary,
        contractDeliverable: item.contractRef,
        threeSimpleSteps: item.steps,
      };
      return acc;
    },
    {} as Record<AdminTabId, ModuleFriendlyGuide>
  );
