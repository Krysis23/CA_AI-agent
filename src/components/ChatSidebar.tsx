import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, MessageSquare, Edit2, Check, X, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useChat } from '@/contexts/ChatContext';
import Logo from '@/components/Logo';

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const ChatSidebar = ({ isOpen, onToggle }: ChatSidebarProps) => {
  const {
    conversations,
    activeConversationId,
    activeConversation,
    createConversation,
    deleteConversation,
    renameConversation,
    setActiveConversation,
  } = useChat();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const confirmRename = () => {
    if (editingId && editTitle.trim()) {
      renameConversation(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 z-40 lg:hidden"
            onClick={onToggle}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed lg:relative z-50 w-72 h-full bg-card border-r border-border flex flex-col"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <Logo size="sm" />
              <button onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted">
                <PanelLeftClose size={18} />
              </button>
            </div>

            <div className="p-3">
              <button
                onClick={createConversation}
                className="w-full gradient-primary text-primary-foreground text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 glow-hover transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus size={16} />
                New Chat
              </button>
            </div>

            {activeConversation?.docData && typeof activeConversation.docData === 'object' && (
              <div className="mx-3 mb-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                <p className="font-medium text-foreground">
                  {(String((activeConversation.docData as { document_type?: string }).document_type || 'document'))
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}{' '}
                  loaded
                </p>
                <p className="text-muted-foreground truncate mt-0.5">
                  {(activeConversation.docData as { person_name?: string }).person_name || ''}
                </p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-3">
              {conversations.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  No conversations yet
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map(conv => (
                    <motion.div
                      key={conv.id}
                      layout
                      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                        conv.id === activeConversationId
                          ? 'bg-muted/80 text-foreground'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      }`}
                      onClick={() => setActiveConversation(conv.id)}
                    >
                      <MessageSquare size={14} className="shrink-0" />
                      <div className="flex-1 min-w-0">
                        {editingId === conv.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              ref={inputRef}
                              value={editTitle}
                              onChange={e => setEditTitle(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingId(null); }}
                              className="w-full bg-input border border-border rounded px-2 py-0.5 text-sm text-foreground"
                              onClick={e => e.stopPropagation()}
                            />
                            <button onClick={(e) => { e.stopPropagation(); confirmRename(); }} className="text-success"><Check size={14} /></button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="text-destructive"><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm truncate">{conv.title}</p>
                            <p className="text-xs text-muted-foreground/60">{formatDate(conv.updatedAt)}</p>
                          </>
                        )}
                      </div>
                      {editingId !== conv.id && (
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); startRename(conv.id, conv.title); }}
                            className="p-1 rounded hover:bg-muted transition-colors"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                            className="p-1 rounded hover:bg-destructive/20 text-destructive transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Collapse toggle when sidebar is hidden */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed top-4 left-4 z-30 p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-all hover:bg-muted"
        >
          <PanelLeft size={18} />
        </button>
      )}
    </>
  );
};

export default ChatSidebar;
