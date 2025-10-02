import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Separator } from '../components/ui/separator';
import { Badge } from '../components/ui/badge';
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Undo,
  Redo,
  Download,
  Type,
  Palette,
  Image,
  Table,
  Link,
  Copy,
  FileText,
  Eye,
  Save,
} from 'lucide-react';
import { Editor } from '@tinymce/tinymce-react';

// Self-host TinyMCE (prevent CDN load)
import tinymce from 'tinymce/tinymce';
import 'tinymce/icons/default';
import 'tinymce/models/dom';
// Core UI and content styles
import 'tinymce/skins/ui/oxide/skin.css';
import 'tinymce/skins/ui/oxide/content.css';
import 'tinymce/skins/content/default/content.css';
// Common plugins
import 'tinymce/plugins/advlist';
import 'tinymce/plugins/autolink';
import 'tinymce/plugins/lists';
import 'tinymce/plugins/link';
import 'tinymce/plugins/image';
import 'tinymce/plugins/charmap';
import 'tinymce/plugins/preview';
import 'tinymce/plugins/anchor';
import 'tinymce/plugins/searchreplace';
import 'tinymce/plugins/visualblocks';
import 'tinymce/plugins/code';
import 'tinymce/plugins/fullscreen';
import 'tinymce/plugins/insertdatetime';
import 'tinymce/plugins/media';
import 'tinymce/plugins/table';
import 'tinymce/plugins/help';
import 'tinymce/plugins/wordcount';

import type { Resume as SharedResume, PointGroup as SharedPointGroup } from '@shared/schema';

interface AdvancedResumeEditorProps {
  resume: SharedResume;
  pointGroups: SharedPointGroup[];
  content: string;
  onContentChange: (content: string) => void;
  onShowSaveOptions: () => void;
  onSave: () => void;
}

export default function AdvancedResumeEditor({
  resume,
  pointGroups,
  content,
  onContentChange,
  onShowSaveOptions,
  onSave,
}: AdvancedResumeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const tinymceRef = useRef<any>(null);
  const [documentStats, setDocumentStats] = useState({
    pages: 1,
    words: 0,
    characters: 0,
    paragraphs: 0,
  });

  const [currentStyle, setCurrentStyle] = useState({
    fontSize: '11pt',
    fontFamily: 'Calibri',
    textAlign: 'left',
    isBold: false,
    isItalic: false,
    isUnderline: false,
  });

  const [showStylePanel, setShowStylePanel] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Enhanced document stats calculation
  useEffect(() => {
    if (content) {
      // Remove HTML tags for accurate word count
      const textOnly = content
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const words = textOnly.split(' ').filter((word) => word.length > 0);
      const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;

      // Estimate pages (250 words per page average)
      const estimatedPages = Math.max(1, Math.ceil(words.length / 250));

      setDocumentStats({
        pages: estimatedPages,
        words: words.length,
        characters: textOnly.length,
        paragraphs: paragraphs,
      });
    }
  }, [content]);

  // Initialize content from resume
  useEffect(() => {
    if (!content && resume.customizedContent) {
      onContentChange(resume.customizedContent);
    } else if (!content && resume.originalContent) {
      // If we have original DOCX content, use it
      onContentChange(resume.originalContent);
    } else if (!content) {
      // Fallback to default template
      const defaultContent = generateDefaultResumeContent();
      onContentChange(defaultContent);
    }
  }, [resume, content, onContentChange]);

  const generateDefaultResumeContent = () => {
    return `
<div style="font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.15; margin: 0; padding: 40px; max-width: 8.5in; background: white;">
  <!-- Header Section -->
  <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #0066cc; padding-bottom: 16px;">
    <h1 style="font-size: 24pt; font-weight: bold; color: #0066cc; margin: 0 0 8px 0;">Your Name</h1>
    <h2 style="font-size: 14pt; color: #666; margin: 0 0 12px 0;">Professional Title</h2>
    <p style="font-size: 10pt; color: #333; margin: 0;">
      📧 your.email@example.com | 📱 (555) 123-4567 | 
      🔗 <a href="#" style="color: #0066cc; text-decoration: none;">linkedin.com/in/yourname</a>
    </p>
  </div>

  <!-- Professional Summary -->
  <section style="margin-bottom: 20px;">
    <h3 style="font-size: 12pt; font-weight: bold; color: #0066cc; margin: 0 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;">PROFESSIONAL SUMMARY</h3>
    <p style="margin: 0; text-align: justify; line-height: 1.3;">
      Dynamic and results-driven professional with [X] years of experience in [industry/field]. 
      Proven track record of [key achievement]. Seeking to leverage expertise in [skills] to 
      contribute to [target role/company type].
    </p>
  </section>

  <!-- Technical Skills -->
  <section style="margin-bottom: 20px;">
    <h3 style="font-size: 12pt; font-weight: bold; color: #0066cc; margin: 0 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;">TECHNICAL SKILLS</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
      <div>
        <strong style="color: #333;">Programming:</strong>
        <span>JavaScript, Python, Java, C++</span>
      </div>
      <div>
        <strong style="color: #333;">Frameworks:</strong>
        <span>React, Node.js, Django, Spring</span>
      </div>
      <div>
        <strong style="color: #333;">Databases:</strong>
        <span>PostgreSQL, MongoDB, Redis</span>
      </div>
      <div>
        <strong style="color: #333;">Tools:</strong>
        <span>Git, Docker, AWS, Kubernetes</span>
      </div>
    </div>
  </section>

  <!-- Professional Experience -->
  <section style="margin-bottom: 20px;">
    <h3 style="font-size: 12pt; font-weight: bold; color: #0066cc; margin: 0 0 12px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;">PROFESSIONAL EXPERIENCE</h3>
    
    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
        <h4 style="font-size: 11pt; font-weight: bold; margin: 0; color: #333;">Senior Software Engineer</h4>
        <span style="font-size: 9pt; color: #666; font-weight: normal;">2022 - Present</span>
      </div>
      <p style="font-size: 10pt; color: #666; margin: 0 0 8px 0; font-style: italic;">TechCorp Industries • San Francisco, CA</p>
      <ul style="margin: 0 0 0 20px; padding: 0;">
        <li style="margin-bottom: 4px; line-height: 1.3;">Led development of microservices architecture serving 1M+ daily users, improving system reliability by 99.9%</li>
        <li style="margin-bottom: 4px; line-height: 1.3;">Mentored team of 5 junior developers and established coding standards, reducing bug reports by 40%</li>
        <li style="margin-bottom: 4px; line-height: 1.3;">Implemented CI/CD pipeline using Docker and Kubernetes, reducing deployment time from 2 hours to 15 minutes</li>
      </ul>
    </div>

    <div style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
        <h4 style="font-size: 11pt; font-weight: bold; margin: 0; color: #333;">Software Engineer</h4>
        <span style="font-size: 9pt; color: #666; font-weight: normal;">2020 - 2022</span>
      </div>
      <p style="font-size: 10pt; color: #666; margin: 0 0 8px 0; font-style: italic;">StartupXYZ • Remote</p>
      <ul style="margin: 0 0 0 20px; padding: 0;">
        <li style="margin-bottom: 4px; line-height: 1.3;">Built responsive web applications using React and Node.js, serving 50,000+ active users</li>
        <li style="margin-bottom: 4px; line-height: 1.3;">Optimized database queries and API endpoints, improving application response time by 60%</li>
        <li style="margin-bottom: 4px; line-height: 1.3;">Collaborated with design team to implement pixel-perfect UI components</li>
      </ul>
    </div>
  </section>

  <!-- Education -->
  <section style="margin-bottom: 20px;">
    <h3 style="font-size: 12pt; font-weight: bold; color: #0066cc; margin: 0 0 8px 0; border-bottom: 1px solid #ccc; padding-bottom: 4px;">EDUCATION</h3>
    <div style="display: flex; justify-content: space-between; align-items: baseline;">
      <div>
        <h4 style="font-size: 11pt; font-weight: bold; margin: 0; color: #333;">Bachelor of Science in Computer Science</h4>
        <p style="font-size: 10pt; color: #666; margin: 0; font-style: italic;">University of Technology</p>
      </div>
      <span style="font-size: 9pt; color: #666;">2016 - 2020</span>
    </div>
  </section>
</div>
    `.trim();
  };

  const handleEditorInput = () => {
    if (editorRef.current) {
      const htmlContent = editorRef.current.innerHTML || '';
      onContentChange(htmlContent);
    }
  };

  // Map existing toolbar actions to TinyMCE when available
  const execEditorCommand = useCallback((cmd: string, value?: string) => {
    const map: Record<string, string> = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      insertUnorderedList: 'InsertUnorderedList',
      insertOrderedList: 'InsertOrderedList',
      justifyLeft: 'JustifyLeft',
      justifyCenter: 'JustifyCenter',
      justifyRight: 'JustifyRight',
      justifyFull: 'JustifyFull',
      undo: 'Undo',
      redo: 'Redo',
    };
    const editor = tinymceRef.current;
    if (editor && editor.execCommand) {
      const mapped = map[cmd] || cmd;
      try {
        editor.execCommand(mapped, false, value);
        editor.focus();
        return true;
      } catch {}
    }
    return false;
  }, []);

  const execCommand = (command: string, value?: string) => {
    const ok = execEditorCommand(command, value);
    if (!ok) {
      document.execCommand(command, false, value);
      editorRef.current?.focus();
      updateCurrentStyle();
    }
  };

  const updateCurrentStyle = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const element =
        range.commonAncestorContainer.nodeType === 3 // 3 is Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement
          : (range.commonAncestorContainer as Element);

      if (element) {
        const computedStyle = window.getComputedStyle(element);
        setCurrentStyle({
          fontSize: computedStyle.fontSize || '11pt',
          fontFamily: computedStyle.fontFamily || 'Calibri',
          textAlign: computedStyle.textAlign || 'left',
          isBold: computedStyle.fontWeight === 'bold' || parseInt(computedStyle.fontWeight) >= 600,
          isItalic: computedStyle.fontStyle === 'italic',
          isUnderline: computedStyle.textDecoration.includes('underline'),
        });
      }
    }
  };

  const handleFontSizeChange = (size: string) => {
    const editor = tinymceRef.current;
    if (editor) {
      try {
        editor.execCommand('FontSize', false, size);
      } catch {}
      editor.focus();
      setCurrentStyle((prev) => ({ ...prev, fontSize: size }));
      return;
    }
    execCommand('fontSize', '3');
    // Then apply the actual size via CSS
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      span.style.fontSize = size;
      try {
        range.surroundContents(span);
      } catch (e) {
        // Fallback for complex selections
        span.innerHTML = range.toString();
        range.deleteContents();
        range.insertNode(span);
      }
    }
    setCurrentStyle((prev) => ({ ...prev, fontSize: size }));
  };

  const handleFontFamilyChange = (family: string) => {
    const editor = tinymceRef.current;
    if (editor) {
      try {
        editor.execCommand('FontName', false, family);
      } catch {}
      editor.focus();
      setCurrentStyle((prev) => ({ ...prev, fontFamily: family }));
      return;
    }
    execCommand('fontName', family);
    setCurrentStyle((prev) => ({ ...prev, fontFamily: family }));
  };

  const insertTable = () => {
    const tableHTML = `
    <table style="border-collapse: collapse; width: 100%; margin: 10px 0;">
      <tr>
        <td style="border: 1px solid #ccc; padding: 8px;">Cell 1</td>
        <td style="border: 1px solid #ccc; padding: 8px;">Cell 2</td>
      </tr>
      <tr>
        <td style="border: 1px solid #ccc; padding: 8px;">Cell 3</td>
        <td style="border: 1px solid #ccc; padding: 8px;">Cell 4</td>
      </tr>
    </table>
    `;
    const editor = tinymceRef.current;
    if (editor && editor.insertContent) {
      editor.insertContent(tableHTML);
    } else {
      document.execCommand('insertHTML', false, tableHTML);
      handleEditorInput();
    }
  };

  const togglePreview = () => {
    setIsPreviewMode(!isPreviewMode);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Enhanced Toolbar */}
      <div className="bg-white border-b border-gray-200 p-3 flex items-center space-x-2 flex-wrap">
        {/* File Operations */}
        <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
          <Button variant="ghost" size="sm" onClick={onSave} title="Save (Ctrl+S)">
            <Save size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onShowSaveOptions} title="Export">
            <Download size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={togglePreview} title="Toggle Preview">
            <Eye size={16} className={isPreviewMode ? 'text-blue-600' : ''} />
          </Button>
        </div>

        {/* Font Controls */}
        <div className="flex items-center space-x-2 pr-3 border-r border-gray-300">
          <Select value={currentStyle.fontFamily} onValueChange={handleFontFamilyChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Calibri">Calibri</SelectItem>
              <SelectItem value="Arial">Arial</SelectItem>
              <SelectItem value="Times New Roman">Times New Roman</SelectItem>
              <SelectItem value="Georgia">Georgia</SelectItem>
              <SelectItem value="Helvetica">Helvetica</SelectItem>
            </SelectContent>
          </Select>

          <Select value={currentStyle.fontSize} onValueChange={handleFontSizeChange}>
            <SelectTrigger className="w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="8pt">8pt</SelectItem>
              <SelectItem value="9pt">9pt</SelectItem>
              <SelectItem value="10pt">10pt</SelectItem>
              <SelectItem value="11pt">11pt</SelectItem>
              <SelectItem value="12pt">12pt</SelectItem>
              <SelectItem value="14pt">14pt</SelectItem>
              <SelectItem value="16pt">16pt</SelectItem>
              <SelectItem value="18pt">18pt</SelectItem>
              <SelectItem value="20pt">20pt</SelectItem>
              <SelectItem value="24pt">24pt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Formatting Controls */}
        <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
          <Button
            variant={currentStyle.isBold ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('bold')}
            title="Bold (Ctrl+B)"
          >
            <Bold size={16} />
          </Button>
          <Button
            variant={currentStyle.isItalic ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('italic')}
            title="Italic (Ctrl+I)"
          >
            <Italic size={16} />
          </Button>
          <Button
            variant={currentStyle.isUnderline ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('underline')}
            title="Underline (Ctrl+U)"
          >
            <Underline size={16} />
          </Button>
        </div>

        {/* Alignment */}
        <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
          <Button
            variant={currentStyle.textAlign === 'left' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('justifyLeft')}
            title="Align Left"
          >
            <AlignLeft size={16} />
          </Button>
          <Button
            variant={currentStyle.textAlign === 'center' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('justifyCenter')}
            title="Center"
          >
            <AlignCenter size={16} />
          </Button>
          <Button
            variant={currentStyle.textAlign === 'right' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('justifyRight')}
            title="Align Right"
          >
            <AlignRight size={16} />
          </Button>
          <Button
            variant={currentStyle.textAlign === 'justify' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => execCommand('justifyFull')}
            title="Justify"
          >
            <AlignJustify size={16} />
          </Button>
        </div>

        {/* Lists and Insert */}
        <div className="flex items-center space-x-1 pr-3 border-r border-gray-300">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('insertUnorderedList')}
            title="Bullet List"
          >
            <List size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('insertOrderedList')}
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </Button>
          <Button variant="ghost" size="sm" onClick={insertTable} title="Insert Table">
            <Table size={16} />
          </Button>
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center space-x-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('undo')}
            title="Undo (Ctrl+Z)"
          >
            <Undo size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => execCommand('redo')}
            title="Redo (Ctrl+Y)"
          >
            <Redo size={16} />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-100">
          <div className="max-w-4xl mx-auto">
            {/* Page Ruler */}
            <div className="bg-white h-4 shadow-sm mb-4 rounded-t-lg border-l-4 border-r-4 border-gray-200 relative">
              <div className="absolute top-1 left-4 right-4 h-2 bg-gradient-to-r from-transparent via-gray-300 to-transparent"></div>
            </div>

            {/* Document */}
            <div className="bg-white shadow-lg rounded-lg border border-gray-200">
              <Editor
                apiKey="no-api-key"
                onInit={(_evt: any, editor: any) => (tinymceRef.current = editor)}
                value={content}
                onEditorChange={(html: string) => onContentChange(html)}
                init={{
                  height: 900,
                  menubar: false,
                  plugins: [
                    'advlist', 'lists', 'link', 'image', 'table', 'code', 'fullscreen', 'preview', 'searchreplace', 'wordcount'
                  ],
                  toolbar:
                    'undo redo | blocks | fontfamily fontsize | bold italic underline | ' +
                    'alignleft aligncenter alignright alignjustify | bullist numlist | ' +
                    'table image | removeformat | code fullscreen',
                  content_style: `
                    body { background: #f3f4f6; }
                    .doc-page { width: 8.5in; min-height: 11in; margin: 0 auto; padding: 1in; background: #ffffff; font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.15; }
                    img { max-width: 100%; height: auto; }
                    table { width: 100%; border-collapse: collapse; }
                    td, th { border: 1px solid #ddd; padding: 4px; }
                    h1,h2,h3 { margin-top: 0.5em; }
                    ul,ol { margin-left: 1.2em; }
                  `,
                  valid_elements: '*[*]',
                  extended_valid_elements: 'img[class|src|alt|width|height|style],table[class|style],td[class|style],th[class|style],span[class|style],div[class|style]'
                }}
              />
            </div>

            {/* Page Shadow */}
            <div className="bg-white h-4 shadow-sm mt-4 rounded-b-lg border-l-4 border-r-4 border-gray-200"></div>
          </div>
        </div>

        {/* Enhanced Sidebar */}
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          {/* Document Statistics */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <FileText className="mr-2" size={16} />
              Document Statistics
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Pages:</span>
                <Badge variant="secondary">{documentStats.pages}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Words:</span>
                <Badge variant="secondary">{documentStats.words}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Characters:</span>
                <Badge variant="secondary">{documentStats.characters}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Paragraphs:</span>
                <Badge variant="secondary">{documentStats.paragraphs}</Badge>
              </div>
            </div>
          </div>

          {/* Current Style Info */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <Type className="mr-2" size={16} />
              Current Style
            </h4>
            <div className="space-y-2 text-xs">
              <div>Font: {currentStyle.fontFamily}</div>
              <div>Size: {currentStyle.fontSize}</div>
              <div>Alignment: {currentStyle.textAlign}</div>
              <div className="flex space-x-2">
                {currentStyle.isBold && <Badge className="text-xs">Bold</Badge>}
                {currentStyle.isItalic && <Badge className="text-xs">Italic</Badge>}
                {currentStyle.isUnderline && <Badge className="text-xs">Underline</Badge>}
              </div>
            </div>
          </div>

          {/* Point Groups Integration */}
          {Array.isArray(pointGroups) && pointGroups.length > 0 && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-900 mb-3">Point Groups</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {pointGroups.map((group, index) => (
                  <div
                    key={group.id || index}
                    className="p-2 bg-gray-50 rounded cursor-pointer hover:bg-gray-100 text-xs"
                    title="Click to insert points"
                  >
                    <strong>{group.name || 'Unnamed Group'}</strong>
                    <div className="text-gray-500">
                      {Array.isArray(group.points) ? group.points.length : 0} points
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Quick Actions</h4>
            <div className="space-y-2">
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Palette className="mr-2" size={14} />
                Change Theme
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Image className="mr-2" size={14} />
                Insert Image
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start">
                <Link className="mr-2" size={14} />
                Insert Link
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
