import { useState, useCallback } from 'react';
import { Send, Paperclip, X, FileText, Image } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useChat } from '@/contexts/ChatContext';

const ChatInput = () => {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { sendMessage, isProcessing } = useChat();

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  const handleSend = async () => {
    if ((!text.trim() && !file) || isProcessing) return;
    const msg = text.trim();
    const f = file;
    setText('');
    setFile(null);
    await sendMessage(msg || (f ? `Analyze this file: ${f.name}` : ''), f || undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      {...getRootProps()}
      className={`border-t border-border bg-card p-4 transition-colors ${isDragActive ? 'bg-primary/5 border-primary/30' : ''}`}
    >
      <input {...getInputProps()} />

      {isDragActive && (
        <div className="text-center text-primary text-sm mb-3 py-3 border-2 border-dashed border-primary/30 rounded-lg">
          Drop your file here...
        </div>
      )}

      {file && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-muted/50 border border-border rounded-lg w-fit">
          {file.type.startsWith('image/') ? <Image size={14} className="text-primary" /> : <FileText size={14} className="text-primary" />}
          <span className="text-sm text-muted-foreground truncate max-w-48">{file.name}</span>
          <button onClick={() => setFile(null)} className="text-muted-foreground hover:text-destructive transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={open}
          disabled={isProcessing}
          className="p-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50"
          title="Attach file"
        >
          <Paperclip size={18} />
        </button>

        <div className="flex-1 bg-input border border-border rounded-xl focus-within:ring-2 focus-within:ring-primary/50 transition-all">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances..."
            disabled={isProcessing}
            rows={1}
            className="w-full bg-transparent px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none disabled:opacity-50 max-h-32"
            style={{ minHeight: '40px' }}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={isProcessing || (!text.trim() && !file)}
          className="p-2.5 rounded-xl gradient-primary text-primary-foreground glow-hover transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
