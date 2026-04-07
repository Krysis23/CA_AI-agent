import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useAuth } from './AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export interface FinancialData {
  totalCredit: number;
  totalDebit: number;
  estimatedTax: number;
}

export interface EvaluationMetrics {
  precision_at_4: number;
  recall_at_4: number;
  crag_status: string;
  crag_score: number;
  crag_action: string;
  chunk_scores: number[];
  judge_score: number;
  judge_reason: string;
}

export interface RetrievedChunkPreview {
  level: string;
  book: string;
  chunk_id: number;
  text: string;
}

export interface UploadedDocItem {
  filename: string;
  doc_data?: Record<string, unknown>;
  plain_text?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  fileName?: string;
  fileType?: string;
  financialData?: FinancialData;
  isLoading?: boolean;
  isError?: boolean;
  metrics?: EvaluationMetrics;
  retrievedChunks?: RetrievedChunkPreview[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
  docData?: Record<string, unknown> | null;
  plainFileTexts?: string[];
  uploadedDocs?: UploadedDocItem[];
}

interface ChatContextType {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActiveConversation: (id: string) => void;
  sendMessage: (content: string, file?: File) => Promise<void>;
  clearChat: () => void;
  isProcessing: boolean;
}

const ChatContext = createContext<ChatContextType | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
};

function financialDataFromDoc(doc: Record<string, unknown>): FinancialData | undefined {
  const bank = doc.bank as Record<string, number> | undefined;
  if (!bank || typeof bank !== 'object') return undefined;
  const tc = Number(bank.total_credits) || 0;
  const td = Number(bank.total_debits) || 0;
  if (tc <= 0 && td <= 0) return undefined;
  return { totalCredit: tc, totalDebit: td, estimatedTax: 0 };
}

function buildHistoryFromMessages(messages: ChatMessage[]): { user: string; assistant: string }[] {
  const pairs: { user: string; assistant: string }[] = [];
  let pendingUser: ChatMessage | null = null;
  for (const m of messages) {
    if (m.role === 'user') {
      pendingUser = m;
    } else if (m.role === 'assistant' && pendingUser && !m.isLoading && !m.isError) {
      pairs.push({ user: pendingUser.content, assistant: m.content });
      pendingUser = null;
    }
  }
  return pairs.slice(-3);
}

function normalizeConversation(raw: Record<string, unknown>): Conversation {
  const rawMessages = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = rawMessages.map((m) => ({
    ...(m as Record<string, unknown>),
    timestamp: new Date((m as Record<string, unknown>).timestamp as string),
  })) as ChatMessage[];
  return {
    id: raw.id as string,
    title: raw.title as string,
    messages,
    createdAt: new Date(raw.createdAt as string),
    updatedAt: new Date(raw.updatedAt as string),
    docData: (raw.docData as Record<string, unknown> | null | undefined) ?? null,
    plainFileTexts: (raw.plainFileTexts as string[] | undefined) ?? [],
    uploadedDocs: (raw.uploadedDocs as UploadedDocItem[] | undefined) ?? [],
  };
}

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const storageKey = user ? `ca_ai_chats_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) {
      setConversations([]);
      setActiveConversationId(null);
      return;
    }
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, unknown>[];
        const convs = parsed.map(normalizeConversation);
        setConversations(convs);
        if (convs.length > 0) setActiveConversationId(convs[0].id);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const persist = useCallback(
    (convs: Conversation[]) => {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(convs));
    },
    [storageKey]
  );

  const createConversation = () => {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      docData: null,
      plainFileTexts: [],
      uploadedDocs: [],
    };
    const updated = [conv, ...conversations];
    setConversations(updated);
    setActiveConversationId(conv.id);
    persist(updated);
    return conv.id;
  };

  const deleteConversation = (id: string) => {
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated);
    if (activeConversationId === id) {
      setActiveConversationId(updated.length > 0 ? updated[0].id : null);
    }
    persist(updated);
  };

  const renameConversation = (id: string, title: string) => {
    const updated = conversations.map((c) => (c.id === id ? { ...c, title } : c));
    setConversations(updated);
    persist(updated);
  };

  const clearChat = () => {
    if (!activeConversationId) return;
    const updated = conversations.map((c) =>
      c.id === activeConversationId
        ? {
            ...c,
            messages: [],
            updatedAt: new Date(),
            docData: null,
            plainFileTexts: [],
            uploadedDocs: [],
          }
        : c
    );
    setConversations(updated);
    persist(updated);
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId) || null;

  const sendMessage = async (content: string, file?: File) => {
    let convId = activeConversationId;
    let currentConvs = conversations;

    if (!convId) {
      const conv: Conversation = {
        id: crypto.randomUUID(),
        title: content.slice(0, 40) || file?.name || 'New Chat',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        docData: null,
        plainFileTexts: [],
        uploadedDocs: [],
      };
      currentConvs = [conv, ...conversations];
      convId = conv.id;
      setConversations(currentConvs);
      setActiveConversationId(convId);
    }

    const convBefore = currentConvs.find((c) => c.id === convId)!;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
      fileName: file?.name,
      fileType: file?.type,
    };

    const loadingMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    };

    const withUser = currentConvs.map((c) => {
      if (c.id !== convId) return c;
      return {
        ...c,
        messages: [...c.messages, userMsg, loadingMsg],
        updatedAt: new Date(),
      };
    });

    setConversations(withUser);
    setIsProcessing(true);

    try {
      let assistantMsg: ChatMessage;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || 'Upload failed');
        }

        const data = (await res.json()) as {
          doc_item: UploadedDocItem;
          doc_data: Record<string, unknown> | null;
          plain_text_append: string | null;
          warning: string | null;
          summary_message: string;
        };

        const nextDocData =
          data.doc_data != null ? data.doc_data : convBefore.docData ?? null;
        const nextPlain =
          data.plain_text_append != null
            ? [...(convBefore.plainFileTexts ?? []), data.plain_text_append]
            : [...(convBefore.plainFileTexts ?? [])];
        const nextUploaded = [...(convBefore.uploadedDocs ?? []), data.doc_item];

        let fin: FinancialData | undefined;
        if (data.doc_data) fin = financialDataFromDoc(data.doc_data);

        assistantMsg = {
          id: loadingMsg.id,
          role: 'assistant',
          content: data.summary_message,
          timestamp: new Date(),
          financialData: fin,
        };

        const final = withUser.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            docData: nextDocData,
            plainFileTexts: nextPlain,
            uploadedDocs: nextUploaded,
            messages: c.messages.map((m) => (m.id === loadingMsg.id ? assistantMsg : m)),
            updatedAt: new Date(),
          };
        });

        setConversations(final);
        persist(final);
      } else {
        const priorMessages = convBefore.messages;
        const history = buildHistoryFromMessages(priorMessages);

        const res = await fetch(`${API_BASE}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: content,
            history,
            plain_file_texts: convBefore.plainFileTexts ?? [],
            doc_data: convBefore.docData ?? null,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { detail?: string }).detail || 'Ask API failed');
        }

        const data = (await res.json()) as {
          answer: string;
          metrics: EvaluationMetrics;
          retrieved_chunks: RetrievedChunkPreview[];
        };

        assistantMsg = {
          id: loadingMsg.id,
          role: 'assistant',
          content: data.answer,
          timestamp: new Date(),
          metrics: data.metrics,
          retrievedChunks: data.retrieved_chunks,
        };

        const final = withUser.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            messages: c.messages.map((m) => (m.id === loadingMsg.id ? assistantMsg : m)),
            updatedAt: new Date(),
          };
        });

        setConversations(final);
        persist(final);
      }
    } catch (error) {
      console.error(error);

      const errorMsg: ChatMessage = {
        id: loadingMsg.id,
        role: 'assistant',
        content:
          error instanceof Error ? error.message : 'Backend error. Is the API server running?',
        timestamp: new Date(),
        isError: true,
      };

      const final = withUser.map((c) => {
        if (c.id !== convId) return c;
        return {
          ...c,
          messages: c.messages.map((m) => (m.id === loadingMsg.id ? errorMsg : m)),
        };
      });

      setConversations(final);
      persist(final);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeConversation,
        createConversation,
        deleteConversation,
        renameConversation,
        setActiveConversation: setActiveConversationId,
        sendMessage,
        clearChat,
        isProcessing,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};
