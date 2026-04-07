import { motion } from 'framer-motion';
import { Copy, AlertCircle, FileText, Image, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatMessage as ChatMessageType } from '@/contexts/ChatContext';
import FinancialSummary from './FinancialSummary';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const TypingIndicator = () => (
  <div className="flex items-center gap-1.5 py-2 px-1">
    <div className="w-2 h-2 rounded-full gradient-primary animate-typing" />
    <div className="w-2 h-2 rounded-full gradient-primary animate-typing" style={{ animationDelay: '0.2s' }} />
    <div className="w-2 h-2 rounded-full gradient-primary animate-typing" style={{ animationDelay: '0.4s' }} />
  </div>
);

const ChatMessage = ({ message }: { message: ChatMessageType }) => {
  const isUser = message.role === 'user';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(message.content);
    toast.success('Copied to clipboard');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 5 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`${
          isUser ? 'max-w-[80%] lg:max-w-[70%]' : 'max-w-[95%] lg:max-w-[88%]'
        } ${isUser ? 'order-1' : 'order-1'}`}
      >
        {/* User avatar / AI avatar */}
        <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isUser ? 'bg-primary/20 text-primary' : 'gradient-primary text-primary-foreground'
          }`}>
            {isUser ? (
              <span className="text-xs font-bold">U</span>
            ) : (
              <span className="text-xs font-bold">AI</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* File attachment */}
            {message.fileName && (
              <div className={`flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm ${isUser ? 'ml-auto w-fit' : ''}`}>
                {message.fileType?.startsWith('image/') ? <Image size={14} className="text-primary" /> : <FileText size={14} className="text-primary" />}
                <span className="text-muted-foreground truncate">{message.fileName}</span>
              </div>
            )}

            {/* Message bubble */}
            <div className={`rounded-xl px-4 py-3 ${
              isUser
                ? 'gradient-primary text-primary-foreground'
                : message.isError
                  ? 'bg-destructive/10 border border-destructive/20'
                  : 'bg-card border border-border'
            }`}>
              {message.isLoading ? (
                <TypingIndicator />
              ) : message.isError ? (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle size={16} />
                  <span className="text-sm">{message.content}</span>
                </div>
              ) : isUser ? (
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
              ) : (
                <div className="prose prose-sm prose-invert max-w-none text-foreground">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="text-lg font-bold text-foreground mt-3 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-base font-bold text-foreground mt-3 mb-1.5">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-sm font-bold text-foreground mt-2 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="text-sm text-foreground/90 mb-2 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                      li: ({ children }) => <li className="text-sm text-foreground/90">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      blockquote: ({ children }) => <blockquote className="border-l-2 border-primary pl-3 italic text-muted-foreground my-2">{children}</blockquote>,
                      table: ({ children }) => <div className="overflow-x-auto my-2"><table className="text-sm border-collapse w-full">{children}</table></div>,
                      th: ({ children }) => <th className="border border-border px-3 py-1.5 text-left font-semibold bg-muted/50">{children}</th>,
                      td: ({ children }) => <td className="border border-border px-3 py-1.5">{children}</td>,
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            {/* Financial summary (structured document upload) */}
            {!isUser && message.financialData && (
              <FinancialSummary data={message.financialData} />
            )}

            {!isUser && message.metrics && !message.isLoading && !message.isError && (
              <Collapsible className="mt-2 border border-border rounded-lg bg-muted/20 overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 [&[data-state=open]_svg]:rotate-180">
                  <span>Evaluation metrics</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 space-y-2 text-xs border-t border-border/60 bg-card/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                    <div className="rounded-md bg-background/50 p-2 border border-border/50">
                      <p className="text-muted-foreground">Precision@4</p>
                      <p className="font-semibold text-foreground">{message.metrics.precision_at_4}</p>
                    </div>
                    <div className="rounded-md bg-background/50 p-2 border border-border/50">
                      <p className="text-muted-foreground">Recall@4</p>
                      <p className="font-semibold text-foreground">{message.metrics.recall_at_4}</p>
                    </div>
                    <div className="rounded-md bg-background/50 p-2 border border-border/50">
                      <p className="text-muted-foreground">CRAG score</p>
                      <p className="font-semibold text-foreground">{message.metrics.crag_score}</p>
                    </div>
                    <div className="rounded-md bg-background/50 p-2 border border-border/50">
                      <p className="text-muted-foreground">Judge</p>
                      <p className="font-semibold text-foreground">{message.metrics.judge_score}/5</p>
                    </div>
                  </div>
                  <p
                    className={
                      message.metrics.crag_status === 'CORRECT'
                        ? 'text-success'
                        : message.metrics.crag_status === 'AMBIGUOUS'
                          ? 'text-amber-500'
                          : 'text-destructive'
                    }
                  >
                    CRAG: {message.metrics.crag_status} — {message.metrics.crag_action}
                  </p>
                  {message.metrics.chunk_scores?.length > 0 && (
                    <p className="text-muted-foreground">
                      Chunk relevance:{' '}
                      {message.metrics.chunk_scores.map((s, i) => {
                        const labels: Record<number, string> = {
                          2: 'Highly relevant',
                          1: 'Partial',
                          0: 'Not relevant',
                        };
                        return (
                          <span key={i}>
                            {i > 0 ? ' | ' : ''}
                            C{i + 1}: {labels[s] ?? s}
                          </span>
                        );
                      })}
                    </p>
                  )}
                  <p className="text-muted-foreground italic">Judge: {message.metrics.judge_reason}</p>
                </CollapsibleContent>
              </Collapsible>
            )}

            {!isUser && message.retrievedChunks && message.retrievedChunks.length > 0 && !message.isLoading && !message.isError && (
              <Collapsible className="mt-2 border border-border rounded-lg bg-muted/20 overflow-hidden">
                <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 [&[data-state=open]_svg]:rotate-180">
                  <span>Retrieved ICAI chunks</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform" />
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3 space-y-2 text-xs border-t border-border/60 bg-card/30 max-h-64 overflow-y-auto">
                  {message.retrievedChunks.map((ch, i) => (
                    <pre
                      key={`${ch.chunk_id}-${i}`}
                      className="whitespace-pre-wrap break-words rounded-md bg-background/60 p-2 border border-border/40 font-mono text-[11px] text-foreground/90"
                    >
                      {JSON.stringify(
                        { level: ch.level, book: ch.book, chunk_id: ch.chunk_id, text: ch.text },
                        null,
                        2
                      )}
                    </pre>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Copy button for AI messages */}
            {!isUser && !message.isLoading && !message.isError && (
              <button
                onClick={copyToClipboard}
                className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Copy size={12} />
                Copy
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatMessage;
