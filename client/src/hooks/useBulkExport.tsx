import { useState, useCallback } from 'react';
import { toast } from 'sonner';

interface ExportProgress {
  resumeId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface BulkExportOptions {
  format: 'docx' | 'pdf';
  includeOriginal: boolean;
  customFilenames: { [resumeId: string]: string };
}

interface UseBulkExportReturn {
  isExporting: boolean;
  exportProgress: ExportProgress[];
  exportResumes: (resumeIds: string[], options?: Partial<BulkExportOptions>) => Promise<void>;
  exportIndividual: (resumeId: string, options?: Partial<BulkExportOptions>) => Promise<void>;
  cancelExport: () => void;
}

export function useBulkExport(): UseBulkExportReturn {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress[]>([]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const updateProgress = useCallback((resumeId: string, status: ExportProgress['status'], error?: string) => {
    setExportProgress(prev => 
      prev.map(item => 
        item.resumeId === resumeId ? { ...item, status, error } : item
      )
    );
  }, []);

  const initializeProgress = useCallback((resumeIds: string[], resumeData: any[]) => {
    const progress: ExportProgress[] = resumeIds.map((id, index) => ({
      resumeId: id,
      fileName: resumeData[index]?.fileName || `resume-${id}`,
      status: 'pending' as const
    }));
    setExportProgress(progress);
  }, []);

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const exportIndividual = useCallback(async (
    resumeId: string, 
    options: Partial<BulkExportOptions> = {}
  ) => {
    try {
      setIsExporting(true);
      
      // Get resume data
      const resumeResponse = await fetch(`/api/resumes/${resumeId}`);
      if (!resumeResponse.ok) {
        throw new Error('Failed to fetch resume data');
      }
      
      const resumeData = await resumeResponse.json();
      initializeProgress([resumeId], [resumeData]);
      
      updateProgress(resumeId, 'processing');
      
      // Export single resume
      const exportResponse = await fetch('/api/resumes/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeIds: [resumeId],
          format: options.format || 'docx'
        })
      });

      if (!exportResponse.ok) {
        throw new Error('Export failed');
      }

      const blob = await exportResponse.blob();
      const filename = options.customFilenames?.[resumeId] || resumeData.fileName;
      
      downloadBlob(blob, filename);
      updateProgress(resumeId, 'completed');
      
      toast.success(`Exported ${resumeData.fileName}`);
    } catch (error) {
      console.error('Individual export failed:', error);
      updateProgress(resumeId, 'error', error instanceof Error ? error.message : 'Export failed');
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [initializeProgress, updateProgress, downloadBlob]);

  const exportResumes = useCallback(async (
    resumeIds: string[],
    options: Partial<BulkExportOptions> = {}
  ) => {
    if (resumeIds.length === 0) {
      toast.error('No resumes selected for export');
      return;
    }

    if (resumeIds.length === 1) {
      return exportIndividual(resumeIds[0], options);
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsExporting(true);

    try {
      // Fetch resume data for progress tracking
      const resumeDataPromises = resumeIds.map(id => 
        fetch(`/api/resumes/${id}`).then(res => res.json())
      );
      
      const resumeDataArray = await Promise.all(resumeDataPromises);
      initializeProgress(resumeIds, resumeDataArray);

      // Mark all as processing
      resumeIds.forEach(id => updateProgress(id, 'processing'));
      
      toast.info(`Preparing to export ${resumeIds.length} resumes...`);

      // Call bulk export API
      const exportResponse = await fetch('/api/resumes/bulk/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeIds,
          format: options.format || 'docx'
        }),
        signal: controller.signal
      });

      if (!exportResponse.ok) {
        const errorData = await exportResponse.json();
        throw new Error(errorData.message || 'Bulk export failed');
      }

      // Mark all as completed before download
      resumeIds.forEach(id => updateProgress(id, 'completed'));

      // Handle the download
      const blob = await exportResponse.blob();
      const contentDisposition = exportResponse.headers.get('Content-Disposition');
      
      let filename = `resumes-${new Date().toISOString().split('T')[0]}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      downloadBlob(blob, filename);
      
      toast.success(`Successfully exported ${resumeIds.length} resumes as ZIP`);
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        toast.info('Export cancelled');
        resumeIds.forEach(id => updateProgress(id, 'pending'));
      } else {
        console.error('Bulk export failed:', error);
        resumeIds.forEach(id => 
          updateProgress(id, 'error', error instanceof Error ? error.message : 'Export failed')
        );
        toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      setIsExporting(false);
      setAbortController(null);
    }
  }, [initializeProgress, updateProgress, downloadBlob, exportIndividual]);

  const cancelExport = useCallback(() => {
    if (abortController) {
      abortController.abort();
      toast.info('Export cancelled');
    }
  }, [abortController]);

  return {
    isExporting,
    exportProgress,
    exportResumes,
    exportIndividual,
    cancelExport
  };
}

// Export Progress Dialog Component
export function ExportProgressDialog({ 
  isOpen, 
  progress, 
  onClose, 
  onCancel 
}: {
  isOpen: boolean;
  progress: ExportProgress[];
  onClose: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  const completedCount = progress.filter(p => p.status === 'completed').length;
  const errorCount = progress.filter(p => p.status === 'error').length;
  const totalCount = progress.length;
  const isComplete = completedCount + errorCount === totalCount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-80 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            Exporting Resumes
          </h3>
          {!isComplete && (
            <button
              onClick={onCancel}
              className="text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="mb-4">
          <div className="text-sm text-gray-600 mb-2">
            Progress: {completedCount + errorCount} / {totalCount}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((completedCount + errorCount) / totalCount) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {progress.map(item => (
            <div key={item.resumeId} className="flex items-center justify-between text-sm">
              <span className="truncate flex-1 mr-2">{item.fileName}</span>
              <div className="flex items-center">
                {item.status === 'pending' && (
                  <span className="text-gray-500">Pending</span>
                )}
                {item.status === 'processing' && (
                  <span className="text-blue-600 animate-pulse">Processing...</span>
                )}
                {item.status === 'completed' && (
                  <span className="text-green-600">✓ Complete</span>
                )}
                {item.status === 'error' && (
                  <span className="text-red-600" title={item.error}>✗ Error</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {isComplete && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}