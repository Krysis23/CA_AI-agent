import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Trash2, LogOut, User, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/contexts/ChatContext';
import { useAuth } from '@/contexts/AuthContext';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import Logo from './Logo';

const ChatArea = () => {
  const { activeConversation, clearChat, sendMessage, isProcessing } = useChat();
  const { user, logout } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex-1 flex flex-col h-screen min-w-0">
      {/* Top bar */}
      <header className="h-14 border-b border-border bg-card/50 backdrop-blur-sm flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 pl-12 lg:pl-0">
          {activeConversation ? (
            <h2 className="text-sm font-medium text-foreground truncate">{activeConversation.title}</h2>
          ) : (
            <Logo size="sm" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeConversation && activeConversation.messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center">
                <User size={14} className="text-primary-foreground" />
              </div>
              <span className="text-sm text-foreground hidden sm:block">{user?.name}</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            {showMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute right-0 top-full mt-1 z-50 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut size={14} />
                    Logout
                  </button>
                </motion.div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 lg:p-6">
        {!activeConversation || activeConversation.messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center max-w-md"
            >
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 glow-primary">
                <Sparkles size={28} className="text-primary-foreground" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Welcome to CA_AI Agent</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Upload bank statements, balance sheets, or any financial documents for instant AI-powered analysis.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  'Analyze my bank statement',
                  'Calculate estimated taxes',
                  'Review my balance sheet',
                  'Financial health check',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => sendMessage(suggestion)}
                    className="text-left text-sm px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {activeConversation.messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  );
};

export default ChatArea;
