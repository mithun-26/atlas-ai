import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FileText, BookOpen, Hash, Star, Lightning
} from '@phosphor-icons/react';
import { TEST_IDS } from '@/constants/testIds';

const FILE_TYPE_LABELS = {
  pdf: 'PDF',
  docx: 'DOCX',
  doc: 'DOC',
  png: 'PNG',
  jpg: 'JPG',
  jpeg: 'JPEG',
  webp: 'WEBP',
};

function SourceCard({ source, index }) {
  return (
    <div
      data-testid={TEST_IDS.CITATION_CARD}
      className="animate-slide-in bg-[#0A0A0A] border border-[#222222] p-4 flex flex-col gap-2.5 rounded-sm hover:border-[#333333] transition-colors duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-5 h-5 bg-[#FF3B30] text-white text-[10px] font-mono font-bold rounded-sm">
            {source.index || index + 1}
          </span>
          <span className="text-xs font-mono text-[#A0A0A0] uppercase tracking-wider truncate max-w-[140px]">
            {source.filename}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#666666] uppercase tracking-[0.15em]">
          {FILE_TYPE_LABELS[source.file_type] || source.file_type?.toUpperCase()}
        </span>
      </div>

      {/* Text preview */}
      <p className="text-xs text-[#A0A0A0] leading-relaxed line-clamp-4">
        {source.text}
      </p>

      {/* Metadata row */}
      <div className="flex items-center gap-3 pt-1 border-t border-[#222222]">
        <div className="flex items-center gap-1 text-[#666666]">
          <BookOpen className="w-3 h-3" />
          <span className="text-[10px] font-mono tracking-wider">
            PAGE {source.page}
          </span>
        </div>
        {source.score > 0 && (
          <div className="flex items-center gap-1 text-[#666666]">
            <Star className="w-3 h-3" />
            <span className="text-[10px] font-mono tracking-wider">
              {typeof source.score === 'number' ? source.score.toFixed(4) : source.score}
            </span>
          </div>
        )}
        {source.retrieval_method && (
          <div className="flex items-center gap-1 text-[#666666]">
            <Hash className="w-3 h-3" />
            <span className="text-[10px] font-mono tracking-wider uppercase">
              {source.retrieval_method}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CitationsPanel({ sources }) {
  return (
    <div data-testid={TEST_IDS.CITATION_PANEL} className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-[#222222]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-heading text-lg font-bold tracking-tight text-white">
            Sources
          </h2>
          <span className="text-xs font-mono text-[#666666] tracking-wider uppercase">
            {sources.length} found
          </span>
        </div>
      </div>

      {/* Sources List */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3 stagger-children">
          {sources.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-sm bg-[#0A0A0A] border border-[#222222] flex items-center justify-center mb-4">
                <Lightning className="w-6 h-6 text-[#333333]" weight="duotone" />
              </div>
              <p className="text-sm text-[#666666] max-w-[200px] leading-relaxed">
                Sources and citations will appear here when you ask questions
              </p>
            </div>
          )}

          {sources.map((source, i) => (
            <SourceCard key={source.id || i} source={source} index={i} />
          ))}
        </div>
      </ScrollArea>

      {/* Footer info */}
      {sources.length > 0 && (
        <div className="p-4 px-6 border-t border-[#222222]">
          <div className="flex items-center gap-2 text-[#666666]">
            <FileText className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono tracking-wider uppercase">
              Hybrid RAG: Qdrant Dense + BM25 + RRF
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
