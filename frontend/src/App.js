import { useState, useEffect, useCallback, useRef } from 'react';
import '@/App.css';
import { Toaster, toast } from 'sonner';
import DocumentPanel from '@/components/DocumentPanel';
import ChatPanel from '@/components/ChatPanel';
import CitationsPanel from '@/components/CitationsPanel';
import { TEST_IDS } from '@/constants/testIds';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState(new Set());
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sources, setSources] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => { document.documentElement.classList.add('dark'); }, []);

  // Fetch documents and sync selection state
  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`${API}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        // Sync selectedDocIds from backend 'selected' field
        const sel = new Set(data.filter(d => d.selected !== false).map(d => d.id));
        setSelectedDocIds(sel);
      }
    } catch (e) {
      console.error('Failed to fetch documents:', e);
    }
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API}/conversations`);
      if (res.ok) setConversations(await res.json());
    } catch (e) { console.error('Failed to fetch conversations:', e); }
  }, []);

  const loadConversation = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const res = await fetch(`${API}/conversations/${convId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        const lastAi = [...(data.messages || [])].reverse().find(m => m.role === 'assistant');
        if (lastAi?.sources?.length) setSources(lastAi.sources);
      }
    } catch (e) { console.error('Failed to load conversation:', e); }
  }, []);

  useEffect(() => { fetchDocuments(); fetchConversations(); }, [fetchDocuments, fetchConversations]);

  useEffect(() => {
    const hasProcessing = documents.some(d => d.status === 'processing');
    if (!hasProcessing) return;
    const timer = setInterval(fetchDocuments, 3000);
    return () => clearInterval(timer);
  }, [documents, fetchDocuments]);

  // === Document Selection ===
  const toggleDocSelection = useCallback(async (docId) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      const nowSelected = !next.has(docId);
      if (nowSelected) next.add(docId); else next.delete(docId);
      // Persist to backend
      fetch(`${API}/documents/select`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: [docId], selected: nowSelected }),
      }).catch(() => {});
      return next;
    });
  }, []);

  const selectAllDocs = useCallback(async () => {
    const allIds = documents.map(d => d.id);
    setSelectedDocIds(new Set(allIds));
    fetch(`${API}/documents/select`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: allIds, selected: true }),
    }).catch(() => {});
  }, [documents]);

  const clearSelection = useCallback(async () => {
    const allIds = documents.map(d => d.id);
    setSelectedDocIds(new Set());
    fetch(`${API}/documents/select`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document_ids: allIds, selected: false }),
    }).catch(() => {});
  }, [documents]);

  const bulkDeleteDocs = useCallback(async (ids) => {
    try {
      const res = await fetch(`${API}/documents/delete-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_ids: ids }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Deleted ${data.count} document(s)`);
        setSelectedDocIds(prev => {
          const next = new Set(prev);
          ids.forEach(id => next.delete(id));
          return next;
        });
        fetchDocuments();
      }
    } catch (e) {
      toast.error('Bulk delete failed');
    }
  }, [fetchDocuments]);

  // === Chat ===
  const handleNewChat = useCallback(() => {
    setActiveConvId(null); setMessages([]); setSources([]);
  }, []);

  const handleSelectConv = useCallback((convId) => {
    setActiveConvId(convId); loadConversation(convId);
  }, [loadConversation]);

  const handleDeleteConv = useCallback(async (convId) => {
    try {
      await fetch(`${API}/conversations/${convId}`, { method: 'DELETE' });
      if (activeConvId === convId) handleNewChat();
      fetchConversations();
    } catch (e) { console.error('Failed to delete conversation:', e); }
  }, [activeConvId, handleNewChat, fetchConversations]);

  // Get the effective document IDs for retrieval
  const getSelectedIds = useCallback(() => {
    if (selectedDocIds.size === 0) return null; // null = search all
    return [...selectedDocIds];
  }, [selectedDocIds]);

  const handleSendMessage = useCallback(async (question) => {
    if (!question.trim() || isStreaming) return;

    const userMsg = {
      id: crypto.randomUUID(), role: 'user', content: question,
      sources: [], created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setSources([]);
    setIsStreaming(true);

    const aiMsgId = crypto.randomUUID();
    setMessages(prev => [...prev, {
      id: aiMsgId, role: 'assistant', content: '', sources: [],
      created_at: new Date().toISOString(), isStreaming: true,
    }]);

    try {
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`${API}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          conversation_id: activeConvId,
          selected_document_ids: getSelectedIds(),
        }),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.trim()) continue;
          const lines = part.split('\n');
          let eventType = '', eventData = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) eventType = line.slice(7);
            else if (line.startsWith('data: ')) eventData = line.slice(6);
          }
          if (!eventData) continue;
          try {
            const parsed = JSON.parse(eventData);
            if (eventType === 'sources') {
              setSources(parsed.sources || []);
              if (parsed.conversation_id) setActiveConvId(parsed.conversation_id);
            } else if (eventType === 'token') {
              accumulated += parsed.content;
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: accumulated } : m));
            } else if (eventType === 'done') {
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, isStreaming: false } : m));
              fetchConversations();
            } else if (eventType === 'error') {
              setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: `Error: ${parsed.message}`, isStreaming: false } : m));
            }
          } catch (parseErr) { /* skip */ }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: 'Connection error. Please try again.', isStreaming: false } : m));
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming, activeConvId, fetchConversations, getSelectedIds]);

  // Derive selected doc names for context indicator
  const selectedDocNames = documents
    .filter(d => selectedDocIds.has(d.id))
    .map(d => d.filename);

  return (
    <div data-testid={TEST_IDS.APP_CONTAINER} className="h-screen overflow-hidden bg-black">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-[#222222] h-full">
        <div className="lg:col-span-3 bg-black overflow-hidden flex flex-col">
          <DocumentPanel
            documents={documents}
            selectedDocIds={selectedDocIds}
            onToggleSelect={toggleDocSelection}
            onSelectAll={selectAllDocs}
            onClearSelection={clearSelection}
            onBulkDelete={bulkDeleteDocs}
            onRefresh={fetchDocuments}
            apiUrl={API}
          />
        </div>
        <div className="lg:col-span-6 bg-black overflow-hidden flex flex-col">
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            onSendMessage={handleSendMessage}
            conversations={conversations}
            activeConvId={activeConvId}
            onNewChat={handleNewChat}
            onSelectConv={handleSelectConv}
            onDeleteConv={handleDeleteConv}
            documents={documents}
            selectedDocNames={selectedDocNames}
            hasDocuments={documents.length > 0}
          />
        </div>
        <div className="lg:col-span-3 bg-black overflow-hidden flex flex-col">
          <CitationsPanel sources={sources} />
        </div>
      </div>
      <Toaster theme="dark" position="bottom-right" toastOptions={{
        style: { background: '#0A0A0A', border: '1px solid #222222', color: '#FFFFFF', fontFamily: 'IBM Plex Sans, sans-serif' },
      }} />
    </div>
  );
}

export default App;
