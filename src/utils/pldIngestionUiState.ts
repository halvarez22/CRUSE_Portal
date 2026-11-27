/**
 * Máquina de estados pura Zero-Display y purga en RAM para ingesta PLD/FT (CRUSE-APO-2026-081).
 */
import Decimal from 'decimal.js';
import { CanonicalPldColumnRole, SmartPldFileAnalysisResult } from '../types/pldSmartIngestion';
import { PreparedClientWatchlistPayload } from './pldWatchlistClientHelper';

export interface PldIngestionUiState {
  readonly csvContent: string;
  readonly preparedFile: PreparedClientWatchlistPayload | null;
  readonly analysis: SmartPldFileAnalysisResult | null;
  readonly mappingOverride: Record<number, CanonicalPldColumnRole>;
  readonly showManualPaste: boolean;
  readonly showAdvancedMapping: boolean;
  readonly requestSeq: number;
}

export function createInitialPldIngestionUiState(): PldIngestionUiState {
  return {
    csvContent: '',
    preparedFile: null,
    analysis: null,
    mappingOverride: {},
    showManualPaste: false,
    showAdvancedMapping: false,
    requestSeq: 0,
  };
}

export function resolveActiveIngestionCsv(
  preparedFile: PreparedClientWatchlistPayload | null,
  manualCsvContent: string
): string {
  return preparedFile ? preparedFile.normalizedCsvContent : manualCsvContent;
}

export function shouldAutoExpandAdvancedMapping(
  analysis: SmartPldFileAnalysisResult | null | undefined
): boolean {
  if (!analysis) return false;
  const invalidCount = analysis.stats?.invalidRowsCount ?? 0;
  if (invalidCount > 0) return true;
  try {
    const confidence = new Decimal(analysis.overallConfidencePct ?? '0');
    return confidence.lessThan(new Decimal('80'));
  } catch {
    return true;
  }
}

export function applyFileLoadedState(
  prev: PldIngestionUiState,
  prepared: PreparedClientWatchlistPayload
): PldIngestionUiState {
  return {
    ...prev,
    preparedFile: prepared,
    csvContent: '',
    showManualPaste: false,
    mappingOverride: {},
    requestSeq: prev.requestSeq + 1,
  };
}

export function applyManualPasteState(
  prev: PldIngestionUiState,
  manualText: string
): PldIngestionUiState {
  return {
    ...prev,
    preparedFile: null,
    analysis: null,
    mappingOverride: {},
    showAdvancedMapping: false,
    showManualPaste: true,
    csvContent: manualText,
    requestSeq: prev.requestSeq + 1,
  };
}

export function applyAnalysisResultState(
  prev: PldIngestionUiState,
  analysis: SmartPldFileAnalysisResult | null
): PldIngestionUiState {
  return {
    ...prev,
    analysis,
    showAdvancedMapping: shouldAutoExpandAdvancedMapping(analysis),
  };
}

export function purgePldIngestionUiState(prev: PldIngestionUiState): PldIngestionUiState {
  return {
    csvContent: '',
    preparedFile: null,
    analysis: null,
    mappingOverride: {},
    showManualPaste: false,
    showAdvancedMapping: false,
    requestSeq: prev.requestSeq + 1,
  };
}
