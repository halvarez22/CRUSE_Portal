import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, User, AlertCircle, RefreshCw } from 'lucide-react';
import { FAQ_CHAT_PROMPTS } from '../../data/cruseData';
import { ChatMessage } from '../../types';
import { ChatFormattedMessage } from './ChatFormattedMessage';
import { evaluateDeterministicFinancialQuery } from '../../services/ai/chatFinancialCalculator';

export const AiAssistantPublic: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: '¡Hola! Soy el Asistente Inteligente de Microfinanciera Cruse. Estoy aquí para resolver tus dudas sobre montos, tasas fijas, requisitos y capacidad de descuento vía nómina. ¿En qué te puedo asesorar hoy?',
      timestamp: 'Ahora',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Auto-Scroll inteligente (CRUSE-APO-2026-016): Guardia para evitar scroll en el montaje inicial
  useEffect(() => {
    if (messages.length > 1 || isTyping) {
      messagesContainerRef.current?.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages, isTyping]);

  // Regex patterns to block PII (Watch Item 2 from Forensic Audit Qwen)
  const PII_PATTERNS = [
    /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d/i, // CURP
    /[A-Z&Ñ]{3,4}\d{6}[A-V1-9][A-Z\d]{2}/i, // RFC
    /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/, // Email
    /(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/, // Phone
  ];

  const buildLocalFallbackReply = (query: string, historyTurns: Array<{ role: string; content: string }>): string => {
    const det = evaluateDeterministicFinancialQuery(query, historyTurns);
    if (det.detected) {
      if (det.needsClarification && det.clarificationReply) return det.clarificationReply;
      if (det.fallbackMarkdownReply) return det.fallbackMarkdownReply;
    }

    const matchedFaq = FAQ_CHAT_PROMPTS.find(
      (faq) =>
        query.toLowerCase().includes(faq.title.toLowerCase().slice(0, 10)) ||
        faq.prompt.toLowerCase().includes(query.toLowerCase())
    );

    if (matchedFaq) {
      return matchedFaq.answer;
    } else if (query.toLowerCase().includes('tasa') || query.toLowerCase().includes('interes')) {
      return 'En Microfinanciera Cruse manejamos dos productos principales: Crédito Clásico al 1.97% quincenal fija sin IVA (47.50% anual, CAT 88.05%) y Crédito Express al 3.33% quincenal (48.00% anual). Ambos con 0% comisión por apertura y descuento directo en nómina.';
    } else if (query.toLowerCase().includes('requisito') || query.toLowerCase().includes('papel') || query.toLowerCase().includes('documento')) {
      return 'Solo requieres 3 documentos: 2 copias de tu INE/IFE vigente, 1 copia de tu último recibo de nómina y 1 copia de comprobante de domicilio reciente (CFE/agua no mayor a 3 meses para el Crédito Clásico). ¡Sin aval!';
    } else if (query.toLowerCase().includes('seguro') || query.toLowerCase().includes('35000') || query.toLowerCase().includes('muerte') || query.toLowerCase().includes('fallecimiento')) {
      return 'El Crédito Clásico incluye una póliza institucional de Seguro de Vida por $35,000.00 MXN ($22.85 quincenales ya integrados en tu cuota). En caso de siniestro, liquida la deuda por completo y el excedente se entrega en efectivo a tus beneficiarios.';
    }
    return 'Gracias por tu consulta. Nuestros créditos se otorgan con retención vía nómina en Chihuahua para trabajadores del Gobierno del Estado y Supremo Tribunal. Puedes calcular tu cuota exacta en nuestro Simulador o comunicarte a la oficina central al (614) 411-15-44.';
  };

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputText).trim();
    if (!query) return;

    setValidationError(null);

    // Barrera 1 (Cliente): Watch Item 2 - Sanitization & Zero PII Enforcement
    if (query.length > 2000) {
      setValidationError('Tu mensaje supera el límite permitido de 2,000 caracteres.');
      return;
    }

    const hasPii = PII_PATTERNS.some((pattern) => pattern.test(query));
    if (hasPii) {
      setValidationError(
        'Por tu seguridad y cumplimiento LFPDPPP, este asistente no solicita ni procesa datos personales sensibles (CURP, RFC, correos o teléfonos). Por favor realiza tu consulta financiera de forma general.'
      );
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
    };

    const historyPayload = messages.slice(-6).map((m) => ({
      role: m.sender,
      content: m.text.slice(0, 1500),
    }));

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, history: historyPayload }),
      });

      const data = await response.json();

      if (!response.ok) {
        setValidationError(data.error || 'No se pudo procesar tu consulta.');
        return;
      }

      const botMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: data.reply || buildLocalFallbackReply(query, historyPayload),
        timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMessage]);
    } catch {
      // Fallback resiliente (Regla 4 U-First) únicamente en caso de error de red
      const fallbackMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: buildLocalFallbackReply(query, historyPayload),
        timestamp: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <section id="asistente-ia" className="py-8 lg:py-12 relative">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-bold bg-[#249E82]/15 text-[#0F766E] dark:text-[#2EBD9B] border border-[#249E82]/30 mb-3">
            <Bot className="w-3.5 h-3.5" />
            <span>Asistente Inteligente 24/7 — Cero Fuga de Datos (Zero-PII)</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-2">
            Orientación Financiera Inmediata
          </h2>
          <p className="text-slate-700 dark:text-slate-300 text-xs sm:text-sm">
            Pregunta en lenguaje natural sobre montos, descuentos de nómina y requisitos sin compartir datos sensibles.
          </p>
        </div>

        {/* Chat Window Container (Glassmorphism - Viewport optimizado CRUSE-APO-2026-016) */}
        <div className="bg-white dark:bg-slate-900/60 glass-panel rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col h-[680px] lg:h-[740px] max-h-[82vh] min-h-[540px] justify-between border border-slate-200 dark:border-white/10">
          
          {/* Chat Header */}
          <div className="flex justify-between items-center pb-3 border-b border-slate-200 dark:border-white/10 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#249E82] to-[#4CD360] text-white flex items-center justify-center shadow-md">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <span className="text-sm font-black text-slate-950 dark:text-white block">
                  Cruse Virtual Advisor
                </span>
                <span className="text-[11px] text-[#0F766E] dark:text-[#2EBD9B] flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#0F766E] dark:bg-[#4CD360] animate-pulse" />
                  Alimentado por IA LLaMA 3.3 70B
                </span>
              </div>
            </div>

            <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono hidden sm:inline">
              Filtro LFPDPPP Activo
            </span>
          </div>

          {/* Messages Scroll Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto space-y-4 pr-2 text-xs sm:text-sm mb-4 scroll-smooth"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg bg-[#249E82]/20 border border-[#249E82]/40 text-[#0F766E] dark:text-[#4CD360] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] p-4 rounded-2xl shadow-sm leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-[#249E82] to-[#1E9F81] text-white rounded-tr-xs'
                      : 'glass-card text-slate-950 dark:text-slate-200 rounded-tl-xs border border-slate-200 dark:border-white/10'
                  }`}
                >
                  <ChatFormattedMessage text={msg.text} isUser={msg.sender === 'user'} />
                  <span
                    className={`text-[10px] block mt-1.5 ${
                      msg.sender === 'user' ? 'text-white/70 text-right' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {msg.timestamp}
                  </span>
                </div>

                {msg.sender === 'user' && (
                  <div className="w-7 h-7 rounded-lg bg-[#396CAE]/20 border border-[#396CAE]/40 text-[#1E3A8A] dark:text-[#00D1FF] flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 italic">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0F766E] dark:text-[#249E82]" />
                <span>Cruse Virtual Advisor está escribiendo...</span>
              </div>
            )}
          </div>

          {/* Quick FAQ Suggestion Pills */}
          <div className="pb-3 border-t border-slate-200 dark:border-white/10 pt-2">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 block mb-1.5">
              Preguntas sugeridas:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {FAQ_CHAT_PROMPTS.slice(0, 3).map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendMessage(item.prompt)}
                  className="px-2.5 py-1 rounded-lg text-xs glass-card text-slate-800 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white border border-slate-200 dark:border-white/10 hover:border-[#249E82] transition-colors font-medium"
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          {/* Validation Error Alert */}
          {validationError && (
            <div className="mb-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Chat Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Escribe tu consulta sobre el crédito..."
              className="flex-1 glass-input rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-950 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#249E82]"
              maxLength={2000}
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[#249E82] hover:bg-[#1E9F81] text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <span>Enviar</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>

      </div>
    </section>
  );
};
