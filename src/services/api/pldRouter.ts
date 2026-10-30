/**
 * ENRUTADOR DE PREVENCIÓN DE LAVADO DE DINERO (PLD/FT: 69-B SAT / UIF / OFAC / PEPs)
 *
 * @implements CRUSE-APO-2026-027 (Directrices 1, 2, 3 y 4)
 * @implements Regla 3 Anti-God-Object (< 600 líneas) y Regla 6 SQA (tipado estricto)
 */

import { Router, Request, Response } from 'express';
import { requireAuth, getAuth } from '../auth/authMiddleware';
import { extractClientIp } from '../audit/auditMask';
import { PldListType, TentativeAmountReportingMode } from '../../types';
import {
  getPldComplianceOverview,
  ingestPldRiskListEntries,
  resolvePldHitAlert,
  runFullPortfolioPldScreening,
} from '../pld/pldScreeningService';
import {
  listGrayListAndExceptionWorkflowData,
  processDirectionGrayListDecision,
} from '../pld/grayListDirectionWorkflowService';
import { evaluateCnbvSlaClocksAndSemesterReviews } from '../pld/cnbvComplianceCron';
import { generateOfficialSiti41ColumnTxtLayout } from '../pld/sitiLayoutGenerator';
import {
  CashOperationCandidateInput,
  detectFractionedAndRelevantCashOperations,
  recordCccSessionDecision,
  submitInternalWhistleblowingReport,
} from '../pld/cnbvAssistedComplianceService';

export const pldRouter = Router();

const VALID_LIST_TYPES: ReadonlySet<PldListType> = new Set<PldListType>([
  'SAT_69B_DEFINITIVO',
  'SAT_69B_PRESUNTO',
  'UIF_PERSONAS_BLOQUEADAS',
  'OFAC_SDN',
  'PEP_NACIONAL',
]);

/**
 * GET /api/pld/overview
 * Retorna KPIs, entradas cifradas en listas de riesgo, alertas proyectadas (Single-Pass CTE) y último lote de barrido.
 */
pldRouter.get('/overview', requireAuth('pld:read'), async (_req: Request, res: Response) => {
  try {
    const overview = await getPldComplianceOverview();
    return res.json({
      ok: true,
      ...overview,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error consultando consola PLD/FT';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/pld/lists/ingest
 * Ingiere de forma idempotente un archivo CSV/TXT de lista oficial (69-B SAT / UIF / OFAC / PEPs)
 * calculando sourceFileHash SHA-256 inmediato y aplicando Blind Indexing Zero-PII.
 */
pldRouter.post('/lists/ingest', requireAuth('pld:manage_lists'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);

    const body = req.body as {
      csvContent?: unknown;
      defaultListType?: unknown;
      defaultOfficialReference?: unknown;
    };

    const csvContent = typeof body.csvContent === 'string' ? body.csvContent : '';
    const rawListType = typeof body.defaultListType === 'string' ? body.defaultListType.trim().toUpperCase() : 'SAT_69B_DEFINITIVO';
    const defaultOfficialReference =
      typeof body.defaultOfficialReference === 'string' && body.defaultOfficialReference.trim().length > 0
        ? body.defaultOfficialReference.trim()
        : 'DOF-SAT-69B-2026';

    if (!csvContent || csvContent.trim().length === 0) {
      return res.status(400).json({ error: 'Se requiere el contenido CSV/TXT de la lista oficial PLD/FT (csvContent).' });
    }

    const defaultListType: PldListType = VALID_LIST_TYPES.has(rawListType as PldListType)
      ? (rawListType as PldListType)
      : 'SAT_69B_DEFINITIVO';

    const result = await ingestPldRiskListEntries({
      csvContent,
      defaultListType,
      defaultOfficialReference,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al ingerir lista PLD/FT';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/pld/screen-portfolio
 * Ejecuta el barrido integral de cartera e inversionistas en Una Sola Pasada CTE y sella el Acta Oficial CNBV/UIF en WORM.
 */
pldRouter.post('/screen-portfolio', requireAuth('pld:screen'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);

    const batch = await runFullPortfolioPldScreening({
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({
      ok: true,
      batch,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error ejecutando barrido integral PLD/FT';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/pld/alerts/:alertId/resolve
 * Emite un dictamen inmutable WORM sobre una alerta PLD/FT (Event-Sourced State Projection).
 */
pldRouter.post('/alerts/:alertId/resolve', requireAuth('pld:resolve_alert'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const alertId = String(req.params.alertId ?? '').trim();

    const body = req.body as {
      resolutionStatus?: unknown;
      justificationNotes?: unknown;
    };

    const rawStatus = typeof body.resolutionStatus === 'string' ? body.resolutionStatus.trim().toUpperCase() : '';
    const justificationNotes = typeof body.justificationNotes === 'string' ? body.justificationNotes : '';

    if (!['CONFIRMED_BLOCKED', 'CLEARED_EDD', 'FALSE_POSITIVE'].includes(rawStatus)) {
      return res.status(400).json({
        error: 'Estado de dictamen inválido. Use CONFIRMED_BLOCKED, CLEARED_EDD o FALSE_POSITIVE.',
      });
    }

    const result = await resolvePldHitAlert({
      alertId,
      resolutionStatus: rawStatus as 'CONFIRMED_BLOCKED' | 'CLEARED_EDD' | 'FALSE_POSITIVE',
      justificationNotes,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al registrar dictamen PLD/FT';
    return res.status(400).json({ error: msg });
  }
});

/**
 * GET /api/pld/gray-list-and-exceptions
 * Retorna los perfiles de cumplimiento (Lista Gris ¿Autoriza Dirección? y Excepciones OCR) y reportes tentativos.
 */
pldRouter.get('/gray-list-and-exceptions', requireAuth('pld:read'), async (_req: Request, res: Response) => {
  try {
    const data = await listGrayListAndExceptionWorkflowData();
    return res.json({
      ok: true,
      ...data,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error consultando flujos de Lista Gris y Excepciones OCR';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/pld/gray-list/:expedienteId/direction-decision
 * Ejecuta la resolución de Dirección en Lista Gris (AUTHORIZED_CONTINUE vs REJECTED_GENERATE_INUSUAL).
 */
pldRouter.post(
  '/gray-list/:expedienteId/direction-decision',
  requireAuth('pld:resolve_alert'),
  async (req: Request, res: Response) => {
    try {
      const { user } = getAuth(req);
      const ip = extractClientIp(req.headers);
      const expedienteId = String(req.params.expedienteId ?? '').trim();

      const body = req.body as {
        decision?: unknown;
        tentativeAmountMode?: unknown;
        justificationNotes?: unknown;
      };

      const rawDecision = typeof body.decision === 'string' ? body.decision.trim().toUpperCase() : '';
      if (rawDecision !== 'AUTHORIZED_CONTINUE' && rawDecision !== 'REJECTED_GENERATE_INUSUAL') {
        return res.status(400).json({
          error: 'Decisión de Dirección inválida. Use AUTHORIZED_CONTINUE o REJECTED_GENERATE_INUSUAL.',
        });
      }

      const rawMode =
        typeof body.tentativeAmountMode === 'string'
          ? body.tentativeAmountMode.trim().toUpperCase()
          : 'ZERO_EOPERATIVO';
      const tentativeAmountMode: TentativeAmountReportingMode =
        rawMode === 'REQUESTED_AMOUNT_BLOCKED' ? 'REQUESTED_AMOUNT_BLOCKED' : 'ZERO_EOPERATIVO';

      const justificationNotes =
        typeof body.justificationNotes === 'string' ? body.justificationNotes : '';

      const result = await processDirectionGrayListDecision({
        expedienteId,
        decision: rawDecision,
        tentativeAmountMode,
        justificationNotes,
        actorEmail: user.email,
        actorRole: user.role,
        sourceIp: ip,
      });

      return res.json({
        ok: true,
        ...result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error procesando decisión de Dirección en Lista Gris';
      return res.status(400).json({ error: msg });
    }
  }
);

/**
 * POST /api/pld/evaluate-fractioned-cash
 * Punto de Control #1 (FASE 2.4): Evalúa pagos en efectivo ($500 a $7,500 USD en un mes calendario) usando Decimal.js.
 */
pldRouter.post('/evaluate-fractioned-cash', requireAuth('pld:screen'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const body = req.body as { operations?: unknown; dryRun?: unknown };
    const dryRun = body.dryRun !== undefined ? Boolean(body.dryRun) : true;

    const rawOps = Array.isArray(body.operations) ? body.operations : [];
    const operations: CashOperationCandidateInput[] = rawOps.map((item: Record<string, unknown>, idx: number) => ({
      operationId: String(item.operationId ?? `cash_op_${idx + 1}`),
      expedienteId: typeof item.expedienteId === 'string' ? item.expedienteId : null,
      blindCurp: String(item.blindCurp ?? 'blind_demo_frac_01'),
      subjectMaskedName: String(item.subjectMaskedName ?? 'ACREDITADO VENTANILLA EFECTIVO'),
      subjectCurpMasked: String(item.subjectCurpMasked ?? 'MARC8105********09'),
      subjectRfcMasked: String(item.subjectRfcMasked ?? 'MARC810512***'),
      hubCode: String(item.hubCode ?? 'HUB-CUU'),
      amountMxn: String(item.amountMxn ?? '0.00'),
      operationDateIso: String(item.operationDateIso ?? new Date().toISOString().slice(0, 10)),
    }));

    const summary = await detectFractionedAndRelevantCashOperations({
      operations,
      dryRun,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({ ok: true, ...summary });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error evaluando operaciones fraccionadas en efectivo';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/pld/whistleblowing
 * Punto de Control #2 (FASE 2.4): Buzón Confidencial de Denuncia Interna (ROIP — Tipo SITI '3') con plazo de 60 días naturales.
 */
pldRouter.post('/whistleblowing', requireAuth('pld:read'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const body = req.body as {
      subjectMaskedName?: unknown;
      hubCode?: unknown;
      col40OperationDescription?: unknown;
      col41InusualReasons?: unknown;
      isAnonymous?: unknown;
    };

    const col40 = typeof body.col40OperationDescription === 'string' ? body.col40OperationDescription.trim() : '';
    const col41 = typeof body.col41InusualReasons === 'string' ? body.col41InusualReasons.trim() : '';
    if (col40.length < 10 || col41.length < 10) {
      return res.status(400).json({
        error: 'La descripción de la operación preocupante y las razones deben tener al menos 10 caracteres.',
      });
    }

    const result = await submitInternalWhistleblowingReport({
      subjectMaskedName:
        typeof body.subjectMaskedName === 'string' && body.subjectMaskedName.trim().length > 0
          ? body.subjectMaskedName.trim()
          : 'COLABORADOR INTERNO REPORTADO EN BUZON',
      hubCode: typeof body.hubCode === 'string' ? body.hubCode.trim() : 'HUB-CUU',
      col40OperationDescription: col40,
      col41InusualReasons: col41,
      isAnonymous: Boolean(body.isAnonymous),
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.status(201).json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error registrando denuncia interna ROIP';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/pld/reports/:reportId/ccc-decision
 * Punto de Control #2 (FASE 2.4): Sesión del Comité de Comunicación y Control (CCC) con cálculo de 3 días hábiles CNBV.
 */
pldRouter.post('/reports/:reportId/ccc-decision', requireAuth('pld:resolve_alert'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const reportId = String(req.params.reportId ?? '').trim();
    const body = req.body as {
      cccDecision?: unknown;
      cccJustificationNotes?: unknown;
      cccSessionDateIso?: unknown;
    };

    const rawDecision = typeof body.cccDecision === 'string' ? body.cccDecision.trim().toUpperCase() : '';
    if (rawDecision !== 'REPORT_TO_UIF' && rawDecision !== 'DISMISSED_WITH_JUSTIFICATION') {
      return res.status(400).json({
        error: 'Decisión de CCC inválida. Use REPORT_TO_UIF o DISMISSED_WITH_JUSTIFICATION.',
      });
    }

    const notes = typeof body.cccJustificationNotes === 'string' ? body.cccJustificationNotes.trim() : '';
    if (notes.length < 10) {
      return res.status(400).json({
        error: 'El acta de sesión del CCC requiere al menos 10 caracteres de justificación.',
      });
    }

    const result = await recordCccSessionDecision({
      reportId,
      cccDecision: rawDecision,
      cccJustificationNotes: notes,
      cccSessionDateIso: typeof body.cccSessionDateIso === 'string' ? body.cccSessionDateIso : undefined,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error registrando sesión del CCC';
    return res.status(400).json({ error: msg });
  }
});

/**
 * POST /api/pld/evaluate-sla-clocks
 * Punto de Control #2 (FASE 2.4): Ejecuta el Reloj Normativo CNBV (60 días naturales + 3 días hábiles post-CCC + revisión 180d).
 */
pldRouter.post('/evaluate-sla-clocks', requireAuth('pld:read'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const result = await evaluateCnbvSlaClocksAndSemesterReviews({
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });
    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error evaluando relojes SLA CNBV';
    return res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/pld/siti-layout
 * Punto de Control #3 (FASE 2.4): Genera el archivo oficial .TXT de 41 columnas SITI UIF/CNBV separado por ';' y CRLF.
 */
pldRouter.post('/siti-layout', requireAuth('pld:read'), async (req: Request, res: Response) => {
  try {
    const { user } = getAuth(req);
    const ip = extractClientIp(req.headers);
    const body = req.body as {
      reportIds?: unknown;
      sitiReportTypeFilter?: unknown;
    };

    const reportIds = Array.isArray(body.reportIds)
      ? body.reportIds.map((id) => String(id))
      : undefined;
    const rawType = typeof body.sitiReportTypeFilter === 'string' ? body.sitiReportTypeFilter.trim() : '';
    const sitiReportTypeFilter =
      rawType === '1' || rawType === '2' || rawType === '3' ? rawType : undefined;

    const result = await generateOfficialSiti41ColumnTxtLayout({
      reportIds,
      sitiReportTypeFilter,
      actorEmail: user.email,
      actorRole: user.role,
      sourceIp: ip,
    });

    return res.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error generando layout SITI de 41 columnas';
    return res.status(500).json({ error: msg });
  }
});
