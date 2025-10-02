import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Download,
  FileText,
  FileType,
  File,
  Globe,
  Database,
  Settings,
  Eye,
  Palette,
  Layout,
  Info,
  CheckCircle,
  AlertCircle,
  Loader,
  Package,
  Trash2,
  Copy,
  X
} from 'lucide-react';
import {
  ExportManager,
  ExportOptions,
  ExportResult,
  ExportFormat,
  DEFAULT_EXPORT_OPTIONS,
  EXPORT_PRESETS,
  getFileSizeString,
  validateExportOptions
} from '@/lib/exportUtils';

export interface EnhancedExportModalProps {
  open: boolean;
  onClose: () => void;
  content: string;
  defaultFilename?: string;
  onExportComplete?: (results: ExportResult[]) => void;
}

interface ExportJob {
  id: string;
  format: ExportFormat;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  result?: ExportResult;
  error?: string;
}

const FORMAT_ICONS = {
  pdf: FileText,
  docx: FileType,
  txt: File,
  html: Globe,
  json: Database
};

const FORMAT_DESCRIPTIONS = {
  pdf: 'Portable Document Format - Universal compatibility',
  docx: 'Microsoft Word Document - Editable format',
  txt: 'Plain Text - Lightweight, readable anywhere',
  html: 'Web Document - Styled, web-compatible',
  json: 'Structured Data - For data portability'
};

export default function EnhancedExportModal({
  open,
  onClose,
  content,
  defaultFilename = 'resume',
  onExportComplete
}: EnhancedExportModalProps) {
  const [selectedFormats, setSelectedFormats] = useState<ExportFormat[]>(['pdf']);
  const [exportOptions, setExportOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);
  const [filename, setFilename] = useState(defaultFilename);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('formats');
  const [previewContent, setPreviewContent] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [exportManager] = useState(() => new ExportManager());

  // Update validation when options change
  useEffect(() => {
    const errors = validateExportOptions(exportOptions);
    setValidationErrors(errors);
  }, [exportOptions]);

  // Generate preview content when options change
  useEffect(() => {
    if (exportOptions.format === 'html') {
      // Generate HTML preview
      const tempManager = new ExportManager(exportOptions);
      tempManager.exportContent(content, 'preview', { format: 'html' })
        .then(result => result.blob.text())
        .then(html => setPreviewContent(html))
        .catch(() => setPreviewContent('Preview unavailable'));
    } else {
      setPreviewContent(content);
    }
  }, [content, exportOptions]);

  const handleFormatToggle = (format: ExportFormat) => {
    setSelectedFormats(prev => 
      prev.includes(format) 
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleOptionChange = (path: string, value: any) => {
    setExportOptions(prev => {
      const newOptions = { ...prev };
      const keys = path.split('.');
      let current: any = newOptions;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) current[keys[i]] = {};
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
      return newOptions;
    });
  };

  const applyPreset = (presetName: keyof typeof EXPORT_PRESETS) => {
    setExportOptions(EXPORT_PRESETS[presetName]);
  };

  const startExport = async () => {
    if (selectedFormats.length === 0 || validationErrors.length > 0) return;
    
    setIsExporting(true);
    
    // Initialize export jobs
    const jobs: ExportJob[] = selectedFormats.map(format => ({
      id: `${format}-${Date.now()}`,
      format,
      status: 'pending',
      progress: 0
    }));
    
    setExportJobs(jobs);
    
    const results: ExportResult[] = [];
    
    // Process each format
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      
      // Update job status to processing
      setExportJobs(prev => prev.map(j => 
        j.id === job.id ? { ...j, status: 'processing', progress: 0 } : j
      ));
      
      try {
        // Simulate progress updates
        for (let progress = 10; progress <= 90; progress += 20) {
          setExportJobs(prev => prev.map(j => 
            j.id === job.id ? { ...j, progress } : j
          ));
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // Perform actual export
        const result = await exportManager.exportContent(
          content, 
          filename, 
          { ...exportOptions, format: job.format }
        );
        
        results.push(result);
        
        // Update job as completed
        setExportJobs(prev => prev.map(j => 
          j.id === job.id 
            ? { ...j, status: 'completed', progress: 100, result } 
            : j
        ));
        
      } catch (error) {
        console.error(`Export failed for ${job.format}:`, error);
        
        // Update job as error
        setExportJobs(prev => prev.map(j => 
          j.id === job.id 
            ? { ...j, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' } 
            : j
        ));
      }
    }
    
    setIsExporting(false);
    onExportComplete?.(results);
  };

  const downloadResult = (result: ExportResult) => {
    ExportManager.downloadFile(result);
  };

  const downloadAllResults = () => {
    const completedJobs = exportJobs.filter(job => job.status === 'completed' && job.result);
    completedJobs.forEach(job => {
      if (job.result) {
        ExportManager.downloadFile(job.result);
      }
    });
  };

  const resetExport = () => {
    setExportJobs([]);
    setIsExporting(false);
  };

  const getFormatIcon = (format: ExportFormat) => {
    const IconComponent = FORMAT_ICONS[format];
    return <IconComponent className="w-4 h-4" />;
  };

  const getStatusIcon = (status: ExportJob['status']) => {
    switch (status) {
      case 'pending':
        return <Eye className="w-4 h-4 text-gray-400" />;
      case 'processing':
        return <Loader className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Enhanced Export Options
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="formats" className="flex items-center gap-1">
              <Package className="w-4 h-4" />
              Formats
            </TabsTrigger>
            <TabsTrigger value="styling" className="flex items-center gap-1">
              <Palette className="w-4 h-4" />
              Styling
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="formats" className="space-y-4 mt-0">
              <div>
                <Label className="text-base font-medium">Select Export Formats</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose one or more formats for your resume export
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(Object.keys(FORMAT_ICONS) as ExportFormat[]).map(format => (
                    <div
                      key={format}
                      className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                        selectedFormats.includes(format)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => handleFormatToggle(format)}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedFormats.includes(format)}
                          onChange={() => handleFormatToggle(format)}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getFormatIcon(format)}
                            <span className="font-medium uppercase">{format}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {FORMAT_DESCRIPTIONS[format]}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="filename">Filename (without extension)</Label>
                <Input
                  id="filename"
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  placeholder="my-resume"
                  className="mt-1"
                />
              </div>
            </TabsContent>

            <TabsContent value="styling" className="space-y-6 mt-0">
              <div>
                <Label className="text-base font-medium">Styling Presets</Label>
                <div className="flex gap-2 mt-2">
                  {Object.keys(EXPORT_PRESETS).map(preset => (
                    <Button
                      key={preset}
                      variant="outline"
                      size="sm"
                      onClick={() => applyPreset(preset as keyof typeof EXPORT_PRESETS)}
                      className="capitalize"
                    >
                      {preset}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fontSize">Font Size ({exportOptions.styling?.fontSize}px)</Label>
                    <Slider
                      id="fontSize"
                      min={8}
                      max={18}
                      step={1}
                      value={[exportOptions.styling?.fontSize || 12]}
                      onValueChange={([value]) => handleOptionChange('styling.fontSize', value)}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="lineHeight">Line Height ({exportOptions.styling?.lineHeight})</Label>
                    <Slider
                      id="lineHeight"
                      min={1}
                      max={2.5}
                      step={0.1}
                      value={[exportOptions.styling?.lineHeight || 1.5]}
                      onValueChange={([value]) => handleOptionChange('styling.lineHeight', value)}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fontFamily">Font Family</Label>
                    <Select
                      value={exportOptions.styling?.fontFamily}
                      onValueChange={(value) => handleOptionChange('styling.fontFamily', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Arial, sans-serif">Arial</SelectItem>
                        <SelectItem value="Times New Roman, serif">Times New Roman</SelectItem>
                        <SelectItem value="Helvetica, sans-serif">Helvetica</SelectItem>
                        <SelectItem value="Georgia, serif">Georgia</SelectItem>
                        <SelectItem value="Calibri, sans-serif">Calibri</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="paperSize">Paper Size</Label>
                    <Select
                      value={exportOptions.styling?.paperSize}
                      onValueChange={(value: 'a4' | 'letter' | 'legal') => 
                        handleOptionChange('styling.paperSize', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a4">A4</SelectItem>
                        <SelectItem value="letter">Letter</SelectItem>
                        <SelectItem value="legal">Legal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="orientation">Orientation</Label>
                    <Select
                      value={exportOptions.styling?.orientation}
                      onValueChange={(value: 'portrait' | 'landscape') => 
                        handleOptionChange('styling.orientation', value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Colors</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <Label htmlFor="primaryColor" className="text-xs">Primary</Label>
                        <Input
                          id="primaryColor"
                          type="color"
                          value={exportOptions.styling?.colors?.primary}
                          onChange={(e) => handleOptionChange('styling.colors.primary', e.target.value)}
                          className="h-8 p-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="textColor" className="text-xs">Text</Label>
                        <Input
                          id="textColor"
                          type="color"
                          value={exportOptions.styling?.colors?.text}
                          onChange={(e) => handleOptionChange('styling.colors.text', e.target.value)}
                          className="h-8 p-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <Label>Margins (mm)</Label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {['top', 'right', 'bottom', 'left'].map(side => (
                    <div key={side}>
                      <Label htmlFor={`margin-${side}`} className="text-xs capitalize">{side}</Label>
                      <Input
                        id={`margin-${side}`}
                        type="number"
                        min={0}
                        max={50}
                        value={exportOptions.styling?.margins?.[side as keyof typeof exportOptions.styling.margins]}
                        onChange={(e) => handleOptionChange(`styling.margins.${side}`, Number(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-0">
              <div>
                <Label htmlFor="title">Document Title</Label>
                <Input
                  id="title"
                  value={exportOptions.metadata?.title}
                  onChange={(e) => handleOptionChange('metadata.title', e.target.value)}
                  placeholder="Resume"
                />
              </div>

              <div>
                <Label htmlFor="author">Author</Label>
                <Input
                  id="author"
                  value={exportOptions.metadata?.author}
                  onChange={(e) => handleOptionChange('metadata.author', e.target.value)}
                  placeholder="Your Name"
                />
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={exportOptions.metadata?.subject}
                  onChange={(e) => handleOptionChange('metadata.subject', e.target.value)}
                  placeholder="Professional Resume"
                />
              </div>

              <div>
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Input
                  id="keywords"
                  value={exportOptions.metadata?.keywords?.join(', ')}
                  onChange={(e) => handleOptionChange('metadata.keywords', e.target.value.split(', ').filter(Boolean))}
                  placeholder="resume, cv, professional"
                />
              </div>

              <div>
                <Label htmlFor="quality">Export Quality</Label>
                <Select
                  value={exportOptions.quality}
                  onValueChange={(value: 'low' | 'medium' | 'high') => 
                    handleOptionChange('quality', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low (Faster)</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High (Best Quality)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="customCSS">Custom CSS (HTML export only)</Label>
                <Textarea
                  id="customCSS"
                  value={exportOptions.customCSS || ''}
                  onChange={(e) => handleOptionChange('customCSS', e.target.value)}
                  placeholder="/* Add your custom CSS here */"
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-0">
              <div className="border rounded-lg p-4 bg-muted/20">
                <h4 className="font-medium mb-3">Export Preview</h4>
                {exportOptions.format === 'html' && previewContent ? (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: previewContent }}
                  />
                ) : (
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: content }}
                  />
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Export Progress */}
        {exportJobs.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Export Progress</h4>
              {!isExporting && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={downloadAllResults}
                    disabled={exportJobs.filter(j => j.status === 'completed').length === 0}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download All
                  </Button>
                  <Button variant="outline" size="sm" onClick={resetExport}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Clear
                  </Button>
                </div>
              )}
            </div>
            
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {exportJobs.map(job => (
                <div key={job.id} className="flex items-center gap-3 p-2 border rounded">
                  <div className="flex items-center gap-2 flex-1">
                    {getStatusIcon(job.status)}
                    {getFormatIcon(job.format)}
                    <span className="uppercase text-sm font-medium">{job.format}</span>
                    
                    {job.status === 'processing' && (
                      <Progress value={job.progress} className="flex-1 max-w-32" />
                    )}
                    
                    {job.status === 'completed' && job.result && (
                      <Badge variant="secondary" className="text-xs">
                        {getFileSizeString(job.result.size)}
                      </Badge>
                    )}
                  </div>
                  
                  {job.status === 'completed' && job.result && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadResult(job.result!)}
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {job.status === 'error' && (
                    <Badge variant="destructive" className="text-xs">
                      Error
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">Validation Errors</span>
            </div>
            <ul className="space-y-1 text-sm text-red-600">
              {validationErrors.map((error, index) => (
                <li key={index}>• {error}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button 
            onClick={startExport}
            disabled={selectedFormats.length === 0 || validationErrors.length > 0 || isExporting}
          >
            {isExporting ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export ({selectedFormats.length} format{selectedFormats.length !== 1 ? 's' : ''})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}