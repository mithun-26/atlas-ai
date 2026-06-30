import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  PaperPlaneRight, Plus, ChatDots, Trash, CaretDown,
  Robot, User as UserIcon, FileText, CheckCircle, Folder
} from '@phosphor-icons/react';
import { TEST_IDS } from '@/constants/testIds';

function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div
      data-testid={isUser ? TEST_IDS.CHAT_MESSAGE_USER : TEST_IDS.CHAT_MESSAGE_AI}
      className={`animate-fade-in ${isUser ? 'flex justify-end' : ''}`}
    >
      {isUser ? (
        <div className="flex items-start gap-3 max-w-[85%]">
          <div className="bg-[#1A1A1A] text-white p-4 rounded-sm border border-[#333333]">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="w-7 h-7 rounded-sm bg-[#222222] flex items-center justify-center flex-shrink-0 mt-1">
            <UserIcon className="w-4 h-4 text-[#A0A0A0]" weight="fill" />
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-sm bg-[#FF3B30] flex items-center justify-center flex-shrink-0 mt-1">
            <Robot className="w-4 h-4 text-white" weight="fill" />
          </div>
          <div className="flex-1 border-l-2 border-[#FF3B30] pl-5 py-1">
            {message.content ? (
              <div className={`atlas-prose text-sm ${message.isStreaming ? 'typing-cursor' : ''}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#666666]">
                <span className="text-sm processing-pulse">Thinking</span>
                <span className="processing-pulse">...</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPanel({
  messages,
  isStreaming,
  onSendMessage,
  conversations,
  activeConvId,
  onNewChat,
  onSelectConv,
  onDeleteConv,
  documents,
  selectedDocNames,
  hasDocuments,
}) {
  const [input, setInput] = useState('');
  const [showConvList, setShowConvList] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const convDropdownRef = useRef(null);

  // Auto scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (convDropdownRef.current && !convDropdownRef.current.contains(e.target)) {
        setShowConvList(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '52px';
      el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    }
  }, []);

  useEffect(() => {
    adjustTextarea();
  }, [input, adjustTextarea]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    onSendMessage(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '52px';
  }, [input, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const activeConvTitle = conversations.find(c => c.id === activeConvId)?.title;

  return (
    <TooltipProvider>
      <div data-testid={TEST_IDS.CHAT_PANEL} className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 px-6 border-b border-[#222222] flex items-center justify-between">
          <div className="flex items-center gap-3 relative" ref={convDropdownRef}>
            <button
              data-testid={TEST_IDS.NEW_CHAT_BUTTON}
              onClick={onNewChat}
              className="flex items-center gap-1.5 bg-transparent text-white border border-[#333333] hover:border-white px-3 py-1.5 rounded-none transition-colors duration-150 text-xs font-mono uppercase tracking-wider"
            >
              <Plus className="w-3.5 h-3.5" weight="bold" />
              New
            </button>

            {conversations.length > 0 && (
              <button
                onClick={() => setShowConvList(prev => !prev)}
                className="flex items-center gap-1.5 text-[#A0A0A0] hover:text-white transition-colors text-sm truncate max-w-[240px]"
              >
                <ChatDots className="w-4 h-4 flex-shrink-0" weight="duotone" />
                <span className="truncate">{activeConvTitle || 'Select conversation'}</span>
                <CaretDown className="w-3 h-3 flex-shrink-0" />
              </button>
            )}

            {/* Conversation dropdown */}
            {showConvList && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-[#0A0A0A] border border-[#222222] z-50 shadow-xl">
                <ScrollArea className="max-h-60">
                  {conversations.map(conv => (
                    <div
                      key={conv.id}
                      data-testid={TEST_IDS.CONVERSATION_ITEM}
                      className={`group flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[#141414] transition-colors border-b border-[#222222] last:border-0 ${
                        conv.id === activeConvId ? 'bg-[#141414] border-l-2 border-l-[#FF3B30]' : ''
                      }`}
                      onClick={() => { onSelectConv(conv.id); setShowConvList(false); }}
                    >
                      <span className="text-sm text-[#A0A0A0] truncate flex-1 mr-2">
                        {conv.title}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteConv(conv.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[#666666] hover:text-[#FF3B30] transition-all"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </ScrollArea>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#666666] tracking-wider uppercase">
              Atlas AI
            </span>
            <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-[#FF3B30] processing-pulse' : 'bg-[#00C853]'}`} />
          </div>
        </div>

        {/* Messages Area */}
        <ScrollArea data-testid={TEST_IDS.CHAT_MESSAGES_AREA} className="flex-1 overflow-hidden">
          <div className="p-6 space-y-6 min-h-full">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center">
                <div className="w-16 h-16 rounded-sm bg-[#0A0A0A] border border-[#222222] flex items-center justify-center mb-6">
                  <Robot className="w-8 h-8 text-[#FF3B30]" weight="duotone" />
                </div>
                <h3 className="font-heading text-xl font-bold text-white mb-2">
                  Atlas AI
                </h3>
                <p className="text-sm text-[#666666] max-w-md leading-relaxed mb-6">
                  Upload documents and ask questions. I analyze PDFs, DOCX files, and images to provide grounded answers with citations.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
                  {[
                    'Summarize this document',
                    'What projects are mentioned?',
                    'Explain this architecture diagram',
                    'Compare the uploaded files',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => onSendMessage(suggestion)}
                      className="text-left text-xs text-[#A0A0A0] bg-[#0A0A0A] border border-[#222222] px-3 py-2.5 hover:border-[#FF3B30] hover:text-white transition-colors duration-150"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-[#222222]">
          {/* Context Indicator */}
          <div data-testid="search-context-indicator" className="px-6 pt-3 pb-1">
            <div className="flex items-start gap-2">
              <Folder className="w-3.5 h-3.5 text-[#666666] mt-0.5 flex-shrink-0" weight="duotone" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-mono text-[#666666] uppercase tracking-wider">Searching:</span>
                {selectedDocNames && selectedDocNames.length > 0 ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {selectedDocNames.map((name, i) => (
                      <span key={i} className="flex items-center gap-1 text-[10px] font-mono text-[#A0A0A0]">
                        <CheckCircle className="w-2.5 h-2.5 text-[#00C853]" weight="fill" />
                        <span className="truncate max-w-[140px]">{name}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-[#A0A0A0] block mt-0.5">All Documents</span>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 px-6 pt-2">
            {!hasDocuments ? (
              <div data-testid="no-docs-warning" className="text-center py-4 border border-dashed border-[#333333] bg-[#0A0A0A]">
                <FileText className="w-5 h-5 text-[#444444] mx-auto mb-1.5" weight="duotone" />
                <p className="text-xs text-[#666666]">Upload documents to start chatting</p>
              </div>
            ) : (
              <>
                <div className="flex items-end gap-3">
                  <div className="flex-1 relative">
                    <textarea ref={textareaRef} data-testid={TEST_IDS.CHAT_INPUT_FIELD}
                      value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                      placeholder="Ask about your documents..." disabled={isStreaming}
                      className="chat-textarea w-full bg-[#0A0A0A] border border-[#333333] focus:border-white text-white p-4 pr-12 text-sm rounded-sm outline-none transition-colors placeholder:text-[#666666] disabled:opacity-50"
                      rows={1} />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button data-testid={TEST_IDS.CHAT_SEND_BUTTON} onClick={handleSend}
                        disabled={!input.trim() || isStreaming}
                        className="bg-white text-black font-bold px-4 py-3.5 rounded-none hover:bg-[#FF3B30] hover:text-white transition-colors duration-200 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0">
                        <PaperPlaneRight className="w-5 h-5" weight="fill" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent><p className="text-xs">Send message (Enter)</p></TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-[10px] font-mono text-[#666666] mt-2 tracking-wide">Shift + Enter for new line</p>
              </>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
