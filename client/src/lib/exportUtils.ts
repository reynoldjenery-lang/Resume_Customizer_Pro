import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, UnderlineType, Table, TableRow, TableCell, WidthType } from 'docx';

export type ExportFormat = 'pdf' | 'docx' | 'txt' | 'html' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  styling?: {
    fontSize?: number;
    fontFamily?: string;
    lineHeight?: number;
    margins?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    colors?: {
      primary: string;
      secondary: string;
      text: string;
      background: string;
    };
    paperSize?: 'a4' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
  };
  metadata?: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string[];
    creator?: string;
  };
  includeStyles?: boolean;
  customCSS?: string;
  quality?: 'low' | 'medium' | 'high';
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  size: number;
  format: ExportFormat;
  timestamp: Date;
}

// Default export options
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'pdf',
  styling: {
    fontSize: 12,
    fontFamily: 'Arial, sans-serif',
    lineHeight: 1.5,
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    colors: {
      primary: '#2563eb',
      secondary: '#64748b',
      text: '#1e293b',
      background: '#ffffff'
    },
    paperSize: 'a4',
    orientation: 'portrait'
  },
  metadata: {
    title: 'Resume',
    author: 'Resume Customizer Pro',
    subject: 'Professional Resume',
    keywords: ['resume', 'cv', 'professional'],
    creator: 'Resume Customizer Pro'
  },
  includeStyles: true,
  quality: 'high'
};

// Export manager class
export class ExportManager {
  private options: ExportOptions;

  constructor(options: Partial<ExportOptions> = {}) {
    this.options = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  }

  // Main export method
  async exportContent(
    content: string, 
    filename: string, 
    customOptions?: Partial<ExportOptions>
  ): Promise<ExportResult> {
    const finalOptions = { ...this.options, ...customOptions };
    
    switch (finalOptions.format) {
      case 'pdf':
        return await this.exportToPDF(content, filename, finalOptions);
      case 'docx':
        return await this.exportToDOCX(content, filename, finalOptions);
      case 'txt':
        return await this.exportToTXT(content, filename, finalOptions);
      case 'html':
        return await this.exportToHTML(content, filename, finalOptions);
      case 'json':
        return await this.exportToJSON(content, filename, finalOptions);
      default:
        throw new Error(`Unsupported export format: ${finalOptions.format}`);
    }
  }

  // PDF Export
  private async exportToPDF(
    content: string, 
    filename: string, 
    options: ExportOptions
  ): Promise<ExportResult> {
    const pdf = new jsPDF({
      orientation: options.styling?.orientation || 'portrait',
      unit: 'mm',
      format: options.styling?.paperSize || 'a4'
    });

    // Set metadata
    if (options.metadata) {
      pdf.setProperties({
        title: options.metadata.title || 'Resume',
        subject: options.metadata.subject || 'Professional Resume',
        author: options.metadata.author || 'Resume Customizer Pro',
        keywords: options.metadata.keywords?.join(', ') || 'resume, cv',
        creator: options.metadata.creator || 'Resume Customizer Pro'
      });
    }

    // Create a temporary div for rendering
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '210mm'; // A4 width
    tempDiv.style.backgroundColor = options.styling?.colors?.background || '#ffffff';
    tempDiv.style.fontFamily = options.styling?.fontFamily || 'Arial, sans-serif';
    tempDiv.style.fontSize = `${options.styling?.fontSize || 12}px`;
    tempDiv.style.lineHeight = `${options.styling?.lineHeight || 1.5}`;
    tempDiv.style.color = options.styling?.colors?.text || '#1e293b';
    tempDiv.style.padding = `${options.styling?.margins?.top || 20}mm`;

    document.body.appendChild(tempDiv);

    try {
      // Convert to canvas and then to PDF
      const canvas = await html2canvas(tempDiv, {
        scale: options.quality === 'high' ? 2 : options.quality === 'medium' ? 1.5 : 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: options.styling?.colors?.background || '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);

      const pdfBlob = pdf.output('blob');
      
      return {
        blob: pdfBlob,
        filename: `${filename}.pdf`,
        size: pdfBlob.size,
        format: 'pdf',
        timestamp: new Date()
      };
    } finally {
      document.body.removeChild(tempDiv);
    }
  }

  // DOCX Export
  private async exportToDOCX(
    content: string, 
    filename: string, 
    options: ExportOptions
  ): Promise<ExportResult> {
    // Parse HTML content to extract structured data
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    const docxElements: any[] = [];
    
    // Process each element in the document
    const processElement = (element: Element, level = 0): void => {
      const tagName = element.tagName.toLowerCase();
      const text = element.textContent?.trim() || '';
      
      if (!text) return;
      
      switch (tagName) {
        case 'h1':
          docxElements.push(
            new Paragraph({
              text,
              heading: HeadingLevel.HEADING_1,
              alignment: AlignmentType.CENTER
            })
          );
          break;
        case 'h2':
          docxElements.push(
            new Paragraph({
              text,
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.LEFT
            })
          );
          break;
        case 'h3':
          docxElements.push(
            new Paragraph({
              text,
              heading: HeadingLevel.HEADING_3,
              alignment: AlignmentType.LEFT
            })
          );
          break;
        case 'p':
          docxElements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  size: (options.styling?.fontSize || 12) * 2, // DOCX uses half-points
                })
              ],
              spacing: { after: 200 }
            })
          );
          break;
        case 'li':
          docxElements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `• ${text}`,
                  size: (options.styling?.fontSize || 12) * 2,
                })
              ],
              spacing: { after: 100 }
            })
          );
          break;
        default:
          if (text && element.children.length === 0) {
            docxElements.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text,
                    size: (options.styling?.fontSize || 12) * 2,
                  })
                ],
                spacing: { after: 100 }
              })
            );
          } else {
            // Process children
            Array.from(element.children).forEach(child => 
              processElement(child, level + 1)
            );
          }
          break;
      }
    };

    Array.from(doc.body.children).forEach(element => 
      processElement(element)
    );

    const docxDoc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: (options.styling?.margins?.top || 20) * 56.7, // Convert mm to twips
              right: (options.styling?.margins?.right || 20) * 56.7,
              bottom: (options.styling?.margins?.bottom || 20) * 56.7,
              left: (options.styling?.margins?.left || 20) * 56.7,
            }
          }
        },
        children: docxElements
      }]
    });

    const buffer = await Packer.toBuffer(docxDoc);
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
    });

    return {
      blob,
      filename: `${filename}.docx`,
      size: blob.size,
      format: 'docx',
      timestamp: new Date()
    };
  }

  // TXT Export
  private async exportToTXT(
    content: string, 
    filename: string, 
    options: ExportOptions
  ): Promise<ExportResult> {
    // Strip HTML tags and format as plain text
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'text/html');
    
    let textContent = '';
    
    const processElement = (element: Element, level = 0): void => {
      const tagName = element.tagName.toLowerCase();
      const text = element.textContent?.trim() || '';
      const indent = '  '.repeat(level);
      
      if (!text && element.children.length === 0) return;
      
      switch (tagName) {
        case 'h1':
          textContent += `\n${'='.repeat(text.length)}\n${text.toUpperCase()}\n${'='.repeat(text.length)}\n\n`;
          break;
        case 'h2':
          textContent += `\n${text}\n${'-'.repeat(text.length)}\n\n`;
          break;
        case 'h3':
          textContent += `\n${text}:\n\n`;
          break;
        case 'p':
          if (text) {
            textContent += `${text}\n\n`;
          }
          break;
        case 'li':
          textContent += `${indent}• ${text}\n`;
          break;
        case 'ul':
        case 'ol':
          Array.from(element.children).forEach(child => 
            processElement(child, level + 1)
          );
          textContent += '\n';
          break;
        case 'div':
          if (element.children.length > 0) {
            Array.from(element.children).forEach(child => 
              processElement(child, level)
            );
          } else if (text) {
            textContent += `${text}\n`;
          }
          break;
        default:
          if (text && element.children.length === 0) {
            textContent += `${text}\n`;
          } else {
            Array.from(element.children).forEach(child => 
              processElement(child, level)
            );
          }
          break;
      }
    };

    Array.from(doc.body.children).forEach(element => 
      processElement(element)
    );

    // Clean up extra newlines
    textContent = textContent.replace(/\n{3,}/g, '\n\n').trim();
    
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });

    return {
      blob,
      filename: `${filename}.txt`,
      size: blob.size,
      format: 'txt',
      timestamp: new Date()
    };
  }

  // HTML Export
  private async exportToHTML(
    content: string, 
    filename: string, 
    options: ExportOptions
  ): Promise<ExportResult> {
    const css = options.customCSS || this.generateDefaultCSS(options.styling);
    
    const htmlDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.metadata?.title || 'Resume'}</title>
    <meta name="author" content="${options.metadata?.author || 'Resume Customizer Pro'}">
    <meta name="description" content="${options.metadata?.subject || 'Professional Resume'}">
    <meta name="keywords" content="${options.metadata?.keywords?.join(', ') || 'resume, cv'}">
    ${options.includeStyles ? `<style>${css}</style>` : ''}
</head>
<body>
    <div class="resume-container">
        ${content}
    </div>
</body>
</html>
    `.trim();

    const blob = new Blob([htmlDocument], { type: 'text/html;charset=utf-8' });

    return {
      blob,
      filename: `${filename}.html`,
      size: blob.size,
      format: 'html',
      timestamp: new Date()
    };
  }

  // JSON Export (for data portability)
  private async exportToJSON(
    content: string, 
    filename: string, 
    options: ExportOptions
  ): Promise<ExportResult> {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      content,
      options: options,
      metadata: {
        ...options.metadata,
        exportedBy: 'Resume Customizer Pro',
        format: 'json'
      }
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });

    return {
      blob,
      filename: `${filename}.json`,
      size: blob.size,
      format: 'json',
      timestamp: new Date()
    };
  }

  // Generate default CSS for HTML export
  private generateDefaultCSS(styling?: ExportOptions['styling']): string {
    const s = styling || DEFAULT_EXPORT_OPTIONS.styling!;
    
    return `
      @media print {
        @page {
          size: ${s.paperSize || 'A4'};
          margin: ${s.margins?.top || 20}mm ${s.margins?.right || 20}mm ${s.margins?.bottom || 20}mm ${s.margins?.left || 20}mm;
        }
        body { print-color-adjust: exact; }
      }
      
      body {
        font-family: ${s.fontFamily || 'Arial, sans-serif'};
        font-size: ${s.fontSize || 12}px;
        line-height: ${s.lineHeight || 1.5};
        color: ${s.colors?.text || '#1e293b'};
        background-color: ${s.colors?.background || '#ffffff'};
        margin: 0;
        padding: ${s.margins?.top || 20}mm;
      }
      
      .resume-container {
        max-width: 210mm;
        margin: 0 auto;
        background: ${s.colors?.background || '#ffffff'};
      }
      
      h1, h2, h3, h4, h5, h6 {
        color: ${s.colors?.primary || '#2563eb'};
        margin-top: 0;
        margin-bottom: 0.5em;
      }
      
      h1 {
        font-size: 2em;
        text-align: center;
        border-bottom: 2px solid ${s.colors?.primary || '#2563eb'};
        padding-bottom: 0.25em;
      }
      
      h2 {
        font-size: 1.5em;
        border-bottom: 1px solid ${s.colors?.secondary || '#64748b'};
        padding-bottom: 0.25em;
      }
      
      h3 {
        font-size: 1.25em;
        margin-bottom: 0.25em;
      }
      
      p {
        margin: 0 0 1em 0;
      }
      
      ul, ol {
        margin: 0 0 1em 0;
        padding-left: 1.5em;
      }
      
      li {
        margin-bottom: 0.25em;
      }
      
      strong {
        color: ${s.colors?.primary || '#2563eb'};
      }
      
      .text-center { text-align: center; }
      .text-right { text-align: right; }
      
      .border-b {
        border-bottom: 1px solid ${s.colors?.secondary || '#64748b'};
        padding-bottom: 0.5em;
        margin-bottom: 1em;
      }
      
      .space-y-2 > * + * { margin-top: 0.5em; }
      .space-y-4 > * + * { margin-top: 1em; }
      
      .text-sm { font-size: 0.875em; }
      .text-lg { font-size: 1.125em; }
      .text-xl { font-size: 1.25em; }
      
      .text-gray-500 { color: ${s.colors?.secondary || '#64748b'}; }
      .text-gray-600 { color: ${s.colors?.text || '#1e293b'}; }
      .text-blue-600 { color: ${s.colors?.primary || '#2563eb'}; }
    `;
  }

  // Download helper method
  static downloadFile(result: ExportResult): void {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Batch export method
  async exportMultipleFormats(
    content: string,
    baseFilename: string,
    formats: ExportFormat[]
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];
    
    for (const format of formats) {
      try {
        const result = await this.exportContent(content, baseFilename, { format });
        results.push(result);
      } catch (error) {
        console.error(`Failed to export ${format}:`, error);
        // Continue with other formats
      }
    }
    
    return results;
  }

  // Update export options
  updateOptions(newOptions: Partial<ExportOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  // Get current options
  getOptions(): ExportOptions {
    return { ...this.options };
  }
}

// Utility functions
export const createExportManager = (options?: Partial<ExportOptions>): ExportManager => {
  return new ExportManager(options);
};

export const getFileSizeString = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (bytes === 0) return '0 Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

export const validateExportOptions = (options: Partial<ExportOptions>): string[] => {
  const errors: string[] = [];
  
  if (options.format && !['pdf', 'docx', 'txt', 'html', 'json'].includes(options.format)) {
    errors.push(`Unsupported format: ${options.format}`);
  }
  
  if (options.styling?.fontSize && (options.styling.fontSize < 6 || options.styling.fontSize > 72)) {
    errors.push('Font size must be between 6 and 72');
  }
  
  if (options.styling?.margins) {
    const { top, right, bottom, left } = options.styling.margins;
    if ([top, right, bottom, left].some(margin => margin < 0 || margin > 50)) {
      errors.push('Margins must be between 0 and 50mm');
    }
  }
  
  return errors;
};

// Export format presets
export const EXPORT_PRESETS = {
  standard: DEFAULT_EXPORT_OPTIONS,
  compact: {
    ...DEFAULT_EXPORT_OPTIONS,
    styling: {
      ...DEFAULT_EXPORT_OPTIONS.styling,
      fontSize: 10,
      lineHeight: 1.3,
      margins: { top: 15, right: 15, bottom: 15, left: 15 }
    }
  },
  presentation: {
    ...DEFAULT_EXPORT_OPTIONS,
    styling: {
      ...DEFAULT_EXPORT_OPTIONS.styling,
      fontSize: 14,
      lineHeight: 1.6,
      margins: { top: 25, right: 25, bottom: 25, left: 25 }
    }
  }
} as const;