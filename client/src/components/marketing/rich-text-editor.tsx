import React, { useRef } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import type { Editor as TinyMCEEditor } from 'tinymce';

// Self-host TinyMCE (no CDN)
import tinymce from 'tinymce/tinymce';
import 'tinymce/icons/default';
import 'tinymce/themes/silver';
import 'tinymce/models/dom';
// Core UI and content styles
import 'tinymce/skins/ui/oxide/skin.css';
import 'tinymce/skins/ui/oxide/content.css';
import 'tinymce/skins/content/default/content.css';
// Common plugins used in init config
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

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  readonly?: boolean;
}

// Type definitions for TinyMCE callback parameters
interface FilePickerCallback {
  (url: string, meta?: { [key: string]: any }): void;
}

interface FilePickerMeta {
  filetype: string;
  [key: string]: any;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Compose your email...",
  height = 400,
  readonly = false
}: RichTextEditorProps) {
  const editorRef = useRef<any | null>(null);

  const handleEditorChange = (content: string) => {
    onChange(content);
  };

  return (
    <div className="rich-text-editor">
      <Editor
        // Self-hosted TinyMCE (no API key or external script)
        onInit={(_evt, editor) => { editorRef.current = editor as any; }}
        value={value}
        onEditorChange={handleEditorChange}
        init={{
          height,
          menubar: false,
          plugins: [
            'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
            'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
            'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount',
            'emoticons', 'template', 'paste', 'textcolor', 'colorpicker'
          ],
          content_style: `
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              font-size: 14px;
              line-height: 1.6;
            }
          `,
          placeholder,
          paste_data_images: true,
          paste_as_text: false,
          paste_webkit_styles: 'all',
          paste_merge_formats: true,
          automatic_uploads: true,
          file_picker_types: 'image',
          file_picker_callback: function (cb: any, value: string, meta: any) {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            
            input.onchange = function () {
              const file = (this as HTMLInputElement).files?.[0];
              if (file) {
                const reader = new FileReader();
                reader.onload = function () {
                  const id = 'blobid' + (new Date()).getTime();
                  const blobCache = (editorRef.current as any).editorUpload.blobCache;
                  const base64 = (reader.result as string).split(',')[1];
                  const blobInfo = blobCache.create(id, file, base64);
                  blobCache.add(blobInfo);
                  cb(blobInfo.blobUri(), { title: file.name });
                };
                reader.readAsDataURL(file);
              }
            };
            
            input.click();
          },
          setup: function (editor: any) {
            (editor as any).ui.registry.addMenuButton('emailtemplates', {
              text: 'Templates',
              fetch: function (callback: (items: any[]) => void) {
                const items = [
                  {
                    type: 'menuitem',
                    text: 'Job Offer',
                    onAction: function () {
                      (editor as any).setContent(`
                        <h2>Job Opportunity</h2>
                        <p>Dear [Candidate Name],</p>
                        <p>We are pleased to offer you the position of <strong>[Job Title]</strong> at [Company Name].</p>
                        <p><strong>Job Details:</strong></p>
                        <ul>
                          <li>Position: [Job Title]</li>
                          <li>Start Date: [Date]</li>
                          <li>Salary: [Amount]</li>
                          <li>Location: [Location]</li>
                        </ul>
                        <p>Please let us know if you have any questions.</p>
                        <p>Best regards,<br>[Your Name]</p>
                      `);
                    }
                  },
                  {
                    type: 'menuitem',
                    text: 'Interview Invitation',
                    onAction: function () {
                      (editor as any).setContent(`
                        <h2>Interview Invitation</h2>
                        <p>Dear [Candidate Name],</p>
                        <p>Thank you for your interest in the <strong>[Job Title]</strong> position at [Company Name].</p>
                        <p>We would like to invite you for an interview:</p>
                        <p><strong>Interview Details:</strong></p>
                        <ul>
                          <li>Date: [Date]</li>
                          <li>Time: [Time]</li>
                          <li>Duration: [Duration]</li>
                          <li>Location/Link: [Details]</li>
                          <li>Interviewer: [Name]</li>
                        </ul>
                        <p>Please confirm your availability.</p>
                        <p>Best regards,<br>[Your Name]</p>
                      `);
                    }
                  },
                  {
                    type: 'menuitem',
                    text: 'Follow-up',
                    onAction: function () {
                      (editor as any).setContent(`
                        <h2>Follow-up</h2>
                        <p>Dear [Candidate Name],</p>
                        <p>I wanted to follow up on our previous conversation regarding the <strong>[Job Title]</strong> position.</p>
                        <p>[Follow-up message details]</p>
                        <p>Please let me know if you have any questions or updates.</p>
                        <p>Best regards,<br>[Your Name]</p>
                      `);
                    }
                  }
                ];
                callback(items);
              }
            });
          },
          toolbar: readonly ? false : 'undo redo | blocks | emailtemplates | ' +
            'bold italic underline strikethrough | forecolor backcolor | ' +
            'alignleft aligncenter alignright alignjustify | ' +
            'bullist numlist outdent indent | ' +
            'removeformat | link image media table | emoticons | code | help',
          readonly,
          resize: 'both',
          min_height: 200,
          max_height: 800,
          branding: false,
          promotion: false,
          valid_elements: '*[*]',
          extended_valid_elements: 'img[class|src|alt|width|height|style]',
          forced_root_block: 'p',
          force_br_newlines: false,
          force_p_newlines: true,
          remove_trailing_brs: true,
        } as any}
      />
    </div>
  );
}