/**
 * components/ImageUploadField.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable product image upload and URL management component.
 * Features:
 * - Segmented toggle between "Upload" (default) and "Image URL".
 * - Upload mode: Dashed drop zone supporting drag-and-drop, browse, and paste.
 * - Client-side validation for file size (<= 5 MB) and MIME types (PNG, JPG, WebP).
 * - Real-time upload with progress bar, retry capability, and inline error feedback.
 * - URL mode: Live preview verification with graceful broken image handling.
 * - 96x96 rounded thumbnail preview with file metadata, "Replace", and "Remove" actions.
 * - Safe object URL creation and revocation (URL.revokeObjectURL).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { UploadCloud, Link2, X, RefreshCw, AlertCircle, Check, Image as ImageIcon } from 'lucide-react';
import { uploadProductImage } from '../api/productApi';

const DEFAULT_MAX_SIZE_MB = 5;
const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp';
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageUploadField({
  value = '',
  onChange,
  onUploadStateChange,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  accept = DEFAULT_ACCEPT,
  disabled = false,
}) {
  // Determine initial mode: if initial value is an external HTTP URL and not an uploaded path, default to URL mode, else Upload
  const isExistingExternalUrl = Boolean(value && !value.startsWith('/products/uploads/') && !value.startsWith('/uploads/') && value.startsWith('http'));
  const [mode, setMode] = useState(isExistingExternalUrl ? 'url' : 'upload');

  // URL mode input state
  const [urlInput, setUrlInput] = useState(mode === 'url' ? value : '');
  const [urlTesting, setUrlTesting] = useState(false);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFileMeta, setSelectedFileMeta] = useState(null); // { name, size, objectUrl, rawFile }

  // Error state
  const [error, setError] = useState(null); // string error message
  const [canRetry, setCanRetry] = useState(false);

  const fileInputRef = useRef(null);
  const activeObjectUrlRef = useRef(null);

  // Notify parent of upload state so form submission can be blocked while uploading
  useEffect(() => {
    if (onUploadStateChange) {
      onUploadStateChange(uploading);
    }
  }, [uploading, onUploadStateChange]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (activeObjectUrlRef.current) {
        URL.revokeObjectURL(activeObjectUrlRef.current);
        activeObjectUrlRef.current = null;
      }
    };
  }, []);

  // Update object URL reference when meta changes
  const setCleanObjectUrl = useCallback((newUrl) => {
    if (activeObjectUrlRef.current && activeObjectUrlRef.current !== newUrl) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
    }
    activeObjectUrlRef.current = newUrl;
  }, []);

  // Helper to clear everything
  const handleClearImage = useCallback(() => {
    if (activeObjectUrlRef.current) {
      URL.revokeObjectURL(activeObjectUrlRef.current);
      activeObjectUrlRef.current = null;
    }
    setSelectedFileMeta(null);
    setUrlInput('');
    setError(null);
    setCanRetry(false);
    setUploadProgress(0);
    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (onChange) {
      onChange('');
    }
  }, [onChange]);

  // Handle switching segmented toggle
  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    handleClearImage();
    setMode(newMode);
  };

  // Perform upload
  const executeUpload = async (file) => {
    setError(null);
    setCanRetry(false);
    setUploading(true);
    setUploadProgress(10);

    try {
      const result = await uploadProductImage(file, (percent) => {
        setUploadProgress(percent);
      });

      setUploadProgress(100);
      setUploading(false);

      if (result && result.url) {
        if (onChange) {
          onChange(result.url);
        }
      }
    } catch (err) {
      setUploading(false);
      setCanRetry(true);
      const serverMsg = err?.response?.data?.detail;
      if (serverMsg) {
        setError(serverMsg);
      } else {
        setError('Upload failed. Please try again.');
      }
    }
  };

  // Process and validate an image file (from drop, file input, or paste)
  const processFile = (file) => {
    if (!file) return;

    setError(null);
    setCanRetry(false);

    // 1. Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Unsupported file type. Use PNG, JPG or WebP.');
      return;
    }

    // 2. Validate Size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File is too large. Maximum size is ${maxSizeMB} MB.`);
      return;
    }

    // Create object URL for instant UI preview
    const objUrl = URL.createObjectURL(file);
    setCleanObjectUrl(objUrl);

    setSelectedFileMeta({
      name: file.name,
      size: file.size,
      objectUrl: objUrl,
      rawFile: file,
    });

    // Start upload immediately
    executeUpload(file);
  };

  // File input change handler
  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  // Paste handler
  const handlePaste = useCallback((e) => {
    if (disabled || mode !== 'upload') return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processFile(file);
          break;
        }
      }
    }
  }, [disabled, mode]);

  // Attach paste listener to dropzone
  const dropzoneRef = useRef(null);
  useEffect(() => {
    const el = dropzoneRef.current;
    if (!el) return;
    el.addEventListener('paste', handlePaste);
    return () => el.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // URL mode: Validate and set URL
  const testAndCommitUrl = (urlToTest) => {
    const trimmed = urlToTest.trim();
    if (!trimmed) {
      handleClearImage();
      return;
    }

    // Quick regex check
    if (!/^https?:\/\/.+/i.test(trimmed)) {
      setError("We couldn't load this image. Please enter a valid http(s) URL.");
      return;
    }

    setError(null);
    setUrlTesting(true);

    const testImg = new window.Image();
    testImg.onload = () => {
      setUrlTesting(false);
      setError(null);
      if (onChange) {
        onChange(trimmed);
      }
    };
    testImg.onerror = () => {
      setUrlTesting(false);
      setError("We couldn't load this image.");
    };
    testImg.src = trimmed;
  };

  const handleUrlInputChange = (e) => {
    const val = e.target.value;
    setUrlInput(val);
    setError(null);
  };

  const handleUrlBlur = () => {
    if (urlInput.trim() && urlInput.trim() !== value) {
      testAndCommitUrl(urlInput);
    }
  };

  const handleUrlKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      testAndCommitUrl(urlInput);
    }
  };

  // Determine what to display in preview state
  const hasActiveImage = Boolean(value || selectedFileMeta?.objectUrl);

  const previewSrc = selectedFileMeta?.objectUrl || (
    value.startsWith('/products/uploads/') || value.startsWith('/uploads/')
      ? `${(import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')}${value}`
      : value
  );

  const previewName = selectedFileMeta?.name || (
    value
      ? value.split('/').pop().split('?')[0] || 'Image URL'
      : 'Product image'
  );

  const previewSizeText = selectedFileMeta?.size
    ? formatBytes(selectedFileMeta.size)
    : (mode === 'url' ? 'External link' : 'Uploaded file');

  return (
    <div className="space-y-3">
      {/* ── Segmented Toggle (Upload vs Image URL) ── */}
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-semibold text-[#0f2a21]">
          Product image <span className="text-[#56675f] font-normal">(optional)</span>
        </label>

        <div className="inline-flex p-0.5 rounded-lg bg-[#edf2ef] border border-[#dbe6e0] text-xs font-medium">
          <button
            type="button"
            onClick={() => handleModeChange('upload')}
            disabled={disabled}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
              mode === 'upload'
                ? 'bg-white text-[#0f2a21] font-bold shadow-xs'
                : 'text-[#56675f] hover:text-[#0f2a21]'
            }`}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('url')}
            disabled={disabled}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
              mode === 'url'
                ? 'bg-white text-[#0f2a21] font-bold shadow-xs'
                : 'text-[#56675f] hover:text-[#0f2a21]'
            }`}
          >
            Image URL
          </button>
        </div>
      </div>

      {/* ── Active Preview State (both Upload and URL mode) ── */}
      {hasActiveImage && !error && (
        <div className="bg-white rounded-[14px] border border-[#dbe6e0] p-3 flex items-center gap-3.5 shadow-2xs">
          {/* 96x96 rounded thumbnail */}
          <div className="w-24 h-24 rounded-xl overflow-hidden border border-[#dbe6e0] shrink-0 bg-[#f3f7f5] relative flex items-center justify-center">
            <img
              src={previewSrc}
              alt="Product thumbnail preview"
              className="w-full h-full object-cover"
              onError={() => setError("We couldn't load this image.")}
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-2xs flex items-center justify-center text-white">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>

          {/* Details & Actions */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-[#0f2a21] font-bold truncate">
              <span className="truncate" title={previewName}>{previewName}</span>
            </div>
            <p className="text-[11px] text-[#56675f] mt-0.5 font-mono">
              {previewSizeText}
            </p>

            {/* Upload progress bar if uploading */}
            {uploading && (
              <div className="mt-2 space-y-1">
                <div className="w-full h-1.5 bg-[#edf2ef] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#14b87a] rounded-full transition-all duration-200"
                    style={{ width: `${Math.max(10, uploadProgress)}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#14b87a] font-mono font-bold">
                  Uploading... {uploadProgress}%
                </p>
              </div>
            )}

            {/* Action buttons: Replace and Remove */}
            {!uploading && (
              <div className="flex items-center gap-2 mt-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (mode === 'upload') {
                      fileInputRef.current?.click();
                    } else {
                      handleClearImage();
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[#dbe6e0] bg-white hover:bg-[#f3f7f5] text-[#0f2a21] transition-colors cursor-pointer"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleClearImage}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-[#a3122f] hover:bg-[#fde8ec] transition-colors cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Upload Mode: Dropzone when no image is present ── */}
      {mode === 'upload' && !hasActiveImage && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileInputChange}
            className="hidden"
            id="product-image-file-input"
            disabled={disabled || uploading}
          />

          <label
            ref={dropzoneRef}
            htmlFor="product-image-file-input"
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex flex-col items-center justify-center p-6 rounded-[14px] border-2 border-dashed transition-all duration-150 cursor-pointer select-none text-center outline-none focus-visible:ring-2 focus-visible:ring-[#14b87a] focus-visible:ring-offset-2 ${
              isDragging
                ? 'bg-[#e9f7f1] border-[#14b87a]'
                : 'bg-[#f3f7f5] border-[#cfe0d7] hover:bg-[#e9f7f1] hover:border-[#14b87a]'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-white shadow-xs border border-[#cfe0d7] flex items-center justify-center text-[#14b87a] mb-2.5">
              <UploadCloud className="w-5 h-5 stroke-[2]" />
            </div>

            <p className="text-xs font-semibold text-[#0f2a21]">
              Drag and drop an image here, or <span className="text-[#14b87a] underline font-bold">browse</span>
            </p>
            <p className="text-[11px] text-[#56675f] mt-1">
              PNG, JPG or WebP, up to {maxSizeMB} MB
            </p>
          </label>
        </div>
      )}

      {/* ── URL Mode: Input when no active image is present ── */}
      {mode === 'url' && !hasActiveImage && (
        <div className="space-y-2">
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#56675f] pointer-events-none">
              <Link2 className="w-4 h-4" />
            </span>
            <input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={urlInput}
              onChange={handleUrlInputChange}
              onBlur={handleUrlBlur}
              onKeyDown={handleUrlKeyDown}
              disabled={disabled || urlTesting}
              className="w-full h-11 pl-10 pr-20 bg-white border border-[#dbe6e0] rounded-[10px] text-[#0f2a21] placeholder-[#56675f] text-sm focus:outline-none focus:ring-2 focus:ring-[#14b87a] focus:border-[#14b87a] transition-all"
            />
            {urlInput && (
              <button
                type="button"
                onClick={() => testAndCommitUrl(urlInput)}
                disabled={urlTesting}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md text-xs font-bold bg-[#14b87a] text-[#04261a] hover:bg-[#2bcb8e] transition-colors cursor-pointer"
              >
                {urlTesting ? 'Checking...' : 'Preview'}
              </button>
            )}
          </div>
          <p className="text-[11px] text-[#56675f]">
            Paste a direct link to an image. We will verify and display a live preview.
          </p>
        </div>
      )}

      {/* ── Inline Errors in #a3122f ── */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center justify-between text-xs font-medium text-[#a3122f] bg-[#fde8ec] border border-[#fbd0d8] p-2.5 rounded-xl animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-[#a3122f]" />
            <span>{error}</span>
          </div>

          <div className="flex items-center gap-2">
            {canRetry && selectedFileMeta?.rawFile && (
              <button
                type="button"
                onClick={() => executeUpload(selectedFileMeta.rawFile)}
                className="text-xs font-bold underline hover:text-[#880e26] cursor-pointer"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={handleClearImage}
              aria-label="Dismiss error"
              className="p-0.5 rounded text-[#a3122f] hover:bg-[#fadce2] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
