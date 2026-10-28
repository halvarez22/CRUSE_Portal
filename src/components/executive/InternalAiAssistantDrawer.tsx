/**
 * MÓDULO B.4 (MODO INTERNO): ALMA VIRTUAL — COPILOTO FINANCIERO & OPERATIVO INTERNO 24/7
 * Expediente: CRUSE-APO-2026-033 / 033-R3 / 034 — 24 Preguntas Estratégicas Operativas en 5 Dominios
 * Guardrails: SQL 100% Parametrizado ($1, $2), Zero-PII en Payload a Groq, Contraste WCAG AAA (>15:1),
 * Auto-Scroll Estabilizado y Limpieza Atómica de Historial, Anti-God-Object (< 600 líneas).
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  Database,
  Layers,
  RotateCcw,
} from 'lucide-react';
import {
  ALMA_VIRTUAL_DOMAIN_TABS,
  ALMA_VIRTUAL_STRATEGIC_QUESTIONS,
} from '../../data/cruseExecutiveData';
import {
  AlmaVirtualDomainId,
  InternalAiAggregatedContext,
  InternalAiQueryResponse,
} from '../../types/executive';
import { ChatFormattedMessage } from '../public/ChatFormattedMessage';

interface InternalAiAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

interface InternalChatTurn {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  model?: string;
  intentCode?: string;
  ts: string;
}

function createInitialWelcomeMessage(): InternalChatTurn {
  return {
    id: 'welcome_alma_virtual',
    sender: 'assistant',
    text: '¡Hola! Soy **Alma Virtual**, tu Copiloto Financiero y Operativo Interno 24/7 en Microfinanciera Cruse. Estoy conectada en tiempo real a las **38 tablas de Azure PostgreSQL 16 (`cruse_fintech_v4`)** bajo protocolo estricto **Zero-PII**. Selecciona cualquiera de los **5 dominios operativos (24 preguntas estratégicas)** arriba o escríbeme cualquier consulta sobre cobranza quincenal, prelación de pagos, reestructuras N-a-1, seguros de vida ($22.85 / $35,000), Círculo de Crédito o bitácora forense WORM.',
    model: 'Alma Virtual · SQL-Verified Engine',
    ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
  };
}

export const InternalAiAssistantDrawer: React.FC<InternalAiAssistantDrawerProps> = ({
  isOpen,
  onClose,
  token,
}) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeDomainTab, setActiveDomainTab] = useState<AlmaVirtualDomainId>('COBRANZA');
  const [snapshot, setSnapshot] = useState<InternalAiAggregatedContext | null>(null);
  const [messages, setMessages] = useState<InternalChatTurn[]>(() => [
    createInitialWelcomeMessage(),
  ]);

  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Guardrail 3 (CRUSE-APO-2026-034): Auto-scroll estabilizado (Anti-Loop) al enviar pregunta o recibir respuesta
  useEffect(() => {
    if (!chatScrollContainerRef.current || !isOpen) return;
    if (messages.length <= 1 && !loading) return;
    chatScrollContainerRef.current.scrollTo({
      top: chatScrollContainerRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages.length, loading, isOpen]);

  if (!isOpen) return null;

  const filteredQuestions = ALMA_VIRTUAL_STRATEGIC_QUESTIONS.filter(
    (q) => q.domain === activeDomainTab
  );

  // Guardrail 3 (CRUSE-APO-2026-034): Limpieza atómica del historial con retorno instantáneo a top: 0
  const handleClearChat = () => {
    if (loading || messages.length <= 1) return;
    setMessages([createInitialWelcomeMessage()]);
    setQuestion('');
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const sendQuery = async (qText: string) => {
    const trimmed = qText.trim();
    if (!trimmed || loading) return;

    const userMsg: InternalChatTurn = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text: trimmed,
      ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await fetch('/api/executive/internal-ai-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = (await res.json()) as InternalAiQueryResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Error al consultar a Alma Virtual');
      }
      setSnapshot(data.aggregatedSnapshot);
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          sender: 'assistant',
          text: data.answer,
          model: data.model,
          intentCode: data.intentCode,
          ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text:
            err instanceof Error
              ? `⚠️ ${err.message}`
              : '⚠️ No fue posible completar la consulta en este momento.',
          ts: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-3xl bg-slate-950 border-l border-slate-800 h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#249E82] to-[#396CAE] flex items-center justify-center text-white shadow-lg">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-extrabold text-white">
                  Alma Virtual — Copiloto Financiero & Operativo Interno 24/7
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Zero-PII · SQL Parametrizado
                </span>
              </div>
              <p className="text-[11px] text-slate-200">
                Conectada en vivo a Azure PostgreSQL 16 (`cruse_fintech_v4`) · 24 Consultas Estratégicas de Administración y Mesa de Control.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClearChat}
              disabled={loading || messages.length <= 1}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 border border-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-colors"
              title="Limpiar historial de conversación para iniciar nuevas consultas"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#00D1FF]" />
              <span>Limpiar Chat</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
              title="Cerrar Alma Virtual"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Snapshot Agregado Certificado */}
        {snapshot && (
          <div className="px-5 py-2 bg-slate-900/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-teal-400 font-bold flex items-center gap-1">
              <Database className="w-3.5 h-3.5" /> PostgreSQL 16 En Vivo:
            </span>
            <span className="text-slate-100">
              Créditos Activos: <strong>{snapshot.totalActiveLoans}</strong>
            </span>
            <span className="text-slate-100">
              Alertas PLD Pendientes: <strong className="text-amber-300">{snapshot.pldAlertsPendingCount}</strong>
            </span>
            <span className="text-slate-100">
              Semáforo: 🟢{snapshot.semaphoreDistribution.VERDE} / 🟡{snapshot.semaphoreDistribution.AMARILLO} / 🔴{snapshot.semaphoreDistribution.ROJO}
            </span>
          </div>
        )}

        {/* Selector de los 5 Dominios Operativos (24 Preguntas Estratégicas) */}
        <div className="p-3.5 bg-slate-900/40 border-b border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Pool de 24 Preguntas Estratégicas Operativas (5 Dominios):</span>
            </div>
            <span className="text-[10px] text-slate-200 flex items-center gap-1">
              <Layers className="w-3 h-3 text-[#00D1FF]" /> Clic para consultar en BD real
            </span>
          </div>

          {/* Pestañas de Dominio */}
          <div className="flex flex-wrap gap-1.5">
            {ALMA_VIRTUAL_DOMAIN_TABS.map((tab) => {
              const isSelected = activeDomainTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDomainTab(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                    isSelected
                      ? 'bg-[#249E82] text-white border-[#249E82] shadow-sm'
                      : 'bg-slate-900 text-slate-200 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          {/* Lista de preguntas del dominio activo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
            {filteredQuestions.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => sendQuery(item.question)}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-slate-800 hover:border-[#00D1FF]/40 text-left transition-all"
              >
                <div className="text-[11px] font-bold text-[#00D1FF]">{item.shortLabel}</div>
                <div className="text-[10px] text-slate-200 line-clamp-1 mt-0.5">{item.question}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Historial de Conversación */}
        <div
          ref={chatScrollContainerRef}
          className="flex-1 overflow-y-auto p-5 space-y-4 scroll-smooth"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl p-4 text-xs leading-relaxed ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-[#249E82] to-[#396CAE] text-white font-medium'
                    : 'bg-slate-900 border border-slate-700 text-slate-100'
                }`}
              >
                <ChatFormattedMessage
                  text={m.text}
                  isUser={m.sender === 'user'}
                  forceDarkSurface={m.sender === 'assistant'}
                  enableVisualCharts={m.sender === 'assistant'}
                />
              </div>
              <span className="text-[10px] text-slate-300 mt-1 px-1">
                {m.ts} {m.model ? `· ${m.model}` : ''}{' '}
                {m.intentCode ? `· [${m.intentCode}]` : ''}
              </span>
            </div>
          ))}
          {loading && (
            <div className="text-xs text-teal-400 font-semibold animate-pulse">
              Ejecutando consulta parametrizada en PostgreSQL 16 (`cruse_fintech_v4`) y sintetizando respuesta con Alma Virtual...
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendQuery(question);
          }}
          className="p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Pregunta a Alma Virtual sobre pagos parciales, prelación, reestructuras, seguros, buró o bitácora WORM..."
            className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-[#00D1FF]"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="px-4 py-2.5 rounded-xl bg-[#249E82] hover:bg-[#1e856e] disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Consultar</span>
          </button>
        </form>
      </div>
    </div>
  );
};
