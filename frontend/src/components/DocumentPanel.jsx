import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FilePdf, FileDoc, Image as ImageIcon, UploadSimple,
  Trash, MagnifyingGlass, File as FileIcon, SpinnerGap,
  CheckCircle, XCircle, CloudArrowUp, CheckSquare, Square,
  TrashSimple, SelectionAll, X as XIcon
} from '@phosphor-icons/react';
import { TEST_IDS } from '@/constants/testIds';

const FILE_TYPE_ICONS = {
  pdf: FilePdf, docx: FileDoc, doc: FileDoc,
  png: ImageIcon, jpg: ImageIcon, jpeg: ImageIcon,
  webp: ImageIcon, gif: ImageIcon, bmp: ImageIcon,
};

const STATUS_CONFIG = {
  processing: { color: 'text-yellow-400', label: 'Processing', Icon: SpinnerGap },
  ready: { color: 'text-[#00C853]', label: 'Ready', Icon: CheckCircle },
  error: { color: 'text-[#FF3B30]', label: 'Error', Icon: XCircle },
};

export default function DocumentPanel({
  documents, selectedDocIds, onToggleSelect, onSelectAll,
  onClearSelection, onBulkDelete, onRefresh, apiUrl,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // {id, filename} or 'bulk'
  const fileInputRef = useRef(null);

  const filteredDocs = documents.filter(d =>
    d.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const selectedCount = selectedDocIds.size;

  const handleUpload = useCallback(async (files) => {
    if (!files?.length) return;
    for (const file of files) {
      setIsUploading(true);
      setUploadProgress(0);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiUrl}/upload`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded * 100) / e.total));
        };
        await new Promise((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) { toast.success(`Uploaded: ${file.name}`); resolve(); }
            else { reject(new Error(JSON.parse(xhr.responseText || '{}').detail || 'Upload failed')); }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(formData);
        });
        onRefresh();
      } catch (e) { toast.error(e.message || 'Upload failed'); }
      finally { setIsUploading(false); setUploadProgress(null); }
    }
  }, [apiUrl, onRefresh]);

  const handleSingleDelete = useCallback(async () => {
    if (!deleteTarget || deleteTarget === 'bulk') return;
    try {
      const res = await fetch(`${apiUrl}/documents/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) { toast.success(`Deleted: ${deleteTarget.filename}`); onRefresh(); }
    } catch (e) { toast.error('Delete failed'); }
    setDeleteTarget(null);
  }, [deleteTarget, apiUrl, onRefresh]);

  const handleBulkDeleteConfirm = useCallback(() => {
    onBulkDelete([...selectedDocIds]);
    setDeleteTarget(null);
  }, [selectedDocIds, onBulkDelete]);

  const handleDrop = useCallback((e) => { e.preventDefault(); setIsDragOver(false); handleUpload(e.dataTransfer.files); }, [handleUpload]);

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <TooltipProvider>
      <div data-testid={TEST_IDS.DOC_PANEL} className="flex flex-col h-full">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-[#222222]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-lg font-bold tracking-tight text-white">Documents</h2>
            <span className="text-xs font-mono text-[#666666] tracking-wider uppercase">{documents.length} files</span>
          </div>

          {/* Bulk Actions Toolbar */}
          {selectedCount > 0 && (
            <div data-testid="bulk-actions-toolbar" className="flex items-center gap-2 p-2 bg-[#0A0A0A] border border-[#333333] mb-3 animate-fade-in">
              <span className="text-xs font-mono text-[#A0A0A0] mr-1">
                <span className="text-white font-bold">{selectedCount}</span> selected
              </span>
              <div className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-testid="select-all-btn" onClick={onSelectAll}
                    className="p-1.5 text-[#A0A0A0] hover:text-white transition-colors" title="Select All">
                    <SelectionAll className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Select All</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-testid="clear-selection-btn" onClick={onClearSelection}
                    className="p-1.5 text-[#A0A0A0] hover:text-white transition-colors" title="Clear Selection">
                    <XIcon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Clear Selection</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button data-testid="bulk-delete-btn" onClick={() => setDeleteTarget('bulk')}
                    className="p-1.5 text-[#FF3B30] hover:text-white hover:bg-[#FF3B30] transition-all rounded-sm" title="Delete Selected">
                    <TrashSimple className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Delete Selected</p></TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Upload Zone */}
        <div className="px-6 pt-4">
          <div data-testid={TEST_IDS.DOC_UPLOAD_ZONE}
            className={`border-dashed border-2 p-5 text-center cursor-pointer transition-all duration-200 ${
              isDragOver ? 'border-[#FF3B30] bg-[#141414]' : 'border-[#333333] bg-[#0A0A0A] hover:border-[#FF3B30] hover:bg-[#141414]'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} data-testid={TEST_IDS.DOC_UPLOAD_INPUT} type="file" className="hidden"
              accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif,.bmp" multiple
              onChange={(e) => handleUpload(e.target.files)} />
            {isUploading ? (
              <div className="space-y-2">
                <SpinnerGap className="w-5 h-5 text-[#FF3B30] mx-auto animate-spin" />
                <Progress value={uploadProgress} className="h-1 bg-[#222222] rounded-none" />
                <p className="text-xs font-mono text-[#A0A0A0]">{uploadProgress}%</p>
              </div>
            ) : (
              <>
                <CloudArrowUp className="w-7 h-7 text-[#666666] mx-auto mb-1.5" weight="duotone" />
                <p className="text-sm text-[#A0A0A0]">Drop files or click to upload</p>
                <p className="text-xs font-mono text-[#666666]">PDF, DOCX, PNG, JPG</p>
              </>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-6 pt-3">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666]" />
            <input data-testid={TEST_IDS.DOC_SEARCH_INPUT} type="text" placeholder="Search documents..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0A0A0A] border border-[#333333] text-white pl-9 pr-3 py-2 text-sm focus:border-white outline-none transition-colors rounded-sm placeholder:text-[#666666]" />
          </div>
        </div>

        {/* Document List */}
        <ScrollArea className="flex-1 px-6 pt-3 pb-6">
          <div className="space-y-1.5 stagger-children">
            {filteredDocs.length === 0 && (
              <div className="text-center py-10">
                <FileIcon className="w-10 h-10 text-[#222222] mx-auto mb-3" weight="duotone" />
                <p className="text-sm text-[#666666] font-medium">
                  {searchQuery ? 'No matching documents' : 'No documents uploaded yet.'}
                </p>
                {!searchQuery && (
                  <p className="text-xs text-[#444444] mt-1">Upload files to start analyzing</p>
                )}
              </div>
            )}

            {filteredDocs.map((doc) => {
              const TypeIcon = FILE_TYPE_ICONS[doc.file_type] || FileIcon;
              const status = STATUS_CONFIG[doc.status] || STATUS_CONFIG.error;
              const StatusIcon = status.Icon;
              const isSelected = selectedDocIds.has(doc.id);

              return (
                <div key={doc.id} data-testid={TEST_IDS.DOC_LIST_ITEM}
                  className={`group flex items-start gap-2.5 p-3 border transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? 'bg-[#0A0A0A] border-[#FF3B30]'
                      : 'bg-[#0A0A0A] border-[#222222] hover:border-[#333333]'
                  }`}
                  onClick={() => onToggleSelect(doc.id)}
                >
                  {/* Checkbox */}
                  <div className="mt-0.5 flex-shrink-0" data-testid="doc-checkbox">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(doc.id)}
                      className="data-[state=checked]:bg-[#FF3B30] data-[state=checked]:border-[#FF3B30] border-[#666666]"
                    />
                  </div>

                  {/* Icon */}
                  <TypeIcon className="w-4 h-4 text-[#A0A0A0] mt-0.5 flex-shrink-0" weight="duotone" />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate font-medium">{doc.filename}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-mono text-[#666666] uppercase tracking-wider">{doc.file_type}</span>
                      <span className="text-[#333333]">|</span>
                      <span className="text-[10px] font-mono text-[#666666]">{formatSize(doc.file_size)}</span>
                      {doc.status === 'ready' && doc.chunks_count > 0 && (
                        <>
                          <span className="text-[#333333]">|</span>
                          <span className="text-[10px] font-mono text-[#666666]">{doc.chunks_count} chunks</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status + Delete */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <StatusIcon
                      className={`w-3.5 h-3.5 ${status.color} ${doc.status === 'processing' ? 'animate-spin' : ''}`}
                      weight={doc.status === 'ready' ? 'fill' : 'regular'}
                    />
                    <button data-testid={TEST_IDS.DOC_DELETE_BTN}
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: doc.id, filename: doc.filename }); }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-[#666666] hover:text-[#FF3B30] transition-all duration-150">
                      <Trash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogContent className="bg-[#0A0A0A] border border-[#333333] text-white rounded-sm max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-heading text-white">
                {deleteTarget === 'bulk' ? 'Delete Selected Documents?' : `Delete "${deleteTarget?.filename}"?`}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#A0A0A0] text-sm">
                {deleteTarget === 'bulk'
                  ? `This will permanently delete ${selectedCount} document(s), their embeddings, and all associated chunks.`
                  : 'This will permanently remove the file, all embeddings from Qdrant, and metadata from the database.'
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="delete-cancel-btn"
                className="bg-transparent border border-[#333333] text-white hover:bg-[#141414] hover:border-white rounded-none">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction data-testid="delete-confirm-btn"
                onClick={deleteTarget === 'bulk' ? handleBulkDeleteConfirm : handleSingleDelete}
                className="bg-[#FF3B30] text-white hover:bg-[#D63026] border-none rounded-none font-bold">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
