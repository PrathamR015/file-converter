import { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, 
  FileCode, 
  FileImage, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Download, 
  RefreshCw, 
  Zap, 
  ShieldAlert, 
  ArrowRight, 
  Copy, 
  Check,
  FileCheck
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [file, setFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [targetFormat, setTargetFormat] = useState('');
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [conversionTime, setConversionTime] = useState(null);
  const fileInputRef = useRef(null);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  // Clean error after 6 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const getFileExtension = (filename) => {
    return filename.split('.').pop().toLowerCase();
  };

  const getFileCategory = (ext) => {
    const images = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'avif'];
    const data = ['csv', 'json'];
    const docs = ['txt', 'html', 'md', 'pdf'];

    if (images.includes(ext)) return 'image';
    if (data.includes(ext)) return 'data';
    if (docs.includes(ext)) return 'document';
    return 'unknown';
  };

  const getCompatibleFormats = (ext) => {
    const category = getFileCategory(ext);
    if (category === 'image') {
      const imageFormats = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'avif', 'pdf'];
      return imageFormats.filter(f => f !== ext && !(ext === 'jpeg' && f === 'jpg') && !(ext === 'jpg' && f === 'jpeg'));
    }
    if (ext === 'csv') return ['json'];
    if (ext === 'json') return ['csv'];
    if (ext === 'txt' || ext === 'md') return ['html', 'pdf'];
    if (ext === 'html') return ['txt', 'pdf'];
    return [];
  };

  const validateAndSetFile = (selectedFile) => {
    setError('');
    setConversionResult(null);
    setConversionTime(null);

    if (!selectedFile) return;

    // 5MB Limit check (5 * 1024 * 1024 bytes)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      setError(`File size (${(selectedFile.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 5MB limit.`);
      return;
    }

    const ext = getFileExtension(selectedFile.name);
    const category = getFileCategory(ext);

    if (category === 'unknown') {
      setError(`Unsupported file type (.${ext}). Supports Image, CSV, JSON, TXT, MD, HTML.`);
      return;
    }

    const compatible = getCompatibleFormats(ext);
    if (compatible.length > 0) {
      setTargetFormat(compatible[0]);
    } else {
      setTargetFormat('');
    }

    setFile(selectedFile);

    if (category === 'image') {
      const url = URL.createObjectURL(selectedFile);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl('');
    }
  };

  // Drag & Drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setTargetFormat('');
    setConversionResult(null);
    setConversionTime(null);
    setError('');
    if (filePreviewUrl) {
      URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl('');
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConvert = async () => {
    if (!file || !targetFormat) return;

    setIsConverting(true);
    setError('');
    const startTime = performance.now();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetFormat', targetFormat);

    try {
      const response = await fetch(`${API_URL}/api/convert`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to convert file.');
      }

      const endTime = performance.now();
      setConversionTime(((endTime - startTime) / 1000).toFixed(2));
      setConversionResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Server connection error. Please ensure the backend is running.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleDownload = () => {
    if (!conversionResult) return;
    const link = document.createElement('a');
    link.href = conversionResult.fileData;
    link.download = conversionResult.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyToClipboard = () => {
    if (!conversionResult) return;
    const base64Content = conversionResult.fileData.split(',')[1];
    const decodedText = atob(base64Content);
    
    navigator.clipboard.writeText(decodedText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        setError('Failed to copy contents to clipboard.');
      });
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const fileExt = file ? getFileExtension(file.name) : '';
  const fileCategory = file ? getFileCategory(fileExt) : '';
  const compatibleFormats = file ? getCompatibleFormats(fileExt) : [];
  const sizePercentage = file ? Math.min((file.size / (5 * 1024 * 1024)) * 100, 100) : 0;
  const isSizeCritical = sizePercentage > 85;

  return (
    <div className="app-container">
      <div className="converter-card animate-slide-in">
        {/* Simplified Header inside the Card */}
        <div className="card-header">
          <div className="brand">
            <Zap size={18} className="brand-icon" />
            <h2>File Converter</h2>
          </div>
          <div className="limit-badge">
            <ShieldAlert size={12} />
            <span>Max 5MB</span>
          </div>
        </div>

        {/* Upload area or File summary */}
        <div className="converter-body">
          {!file ? (
            <div 
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect}
                accept=".png,.jpg,.jpeg,.webp,.gif,.tiff,.avif,.csv,.json,.txt,.html,.md"
              />
              <UploadCloud className="dropzone-icon" size={40} strokeWidth={1.5} />
              <h3>Choose a file or drag it here</h3>
              <p>Supports Images, CSV, JSON, TXT, MD, HTML (up to 5MB)</p>
            </div>
          ) : (
            <div className="selected-file-container">
              <div className="file-details">
                <div className="file-icon-wrapper">
                  {fileCategory === 'image' && <FileImage size={20} />}
                  {fileCategory === 'data' && <FileCode size={20} />}
                  {fileCategory === 'document' && <FileText size={20} />}
                </div>
                <div className="file-meta">
                  <h4>{file.name}</h4>
                  <p>{formatBytes(file.size)} • .{fileExt.toUpperCase()}</p>
                </div>
                <button className="remove-btn" onClick={handleRemoveFile} title="Remove File">
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Progress bar tracker for size */}
              <div className="size-bar-container">
                <div className="size-labels">
                  <span>File Size</span>
                  <span style={{ color: isSizeCritical ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                    {sizePercentage.toFixed(0)}% of 5MB limit
                  </span>
                </div>
                <div className="size-track">
                  <div 
                    className={`size-fill ${isSizeCritical ? 'critical' : ''}`} 
                    style={{ width: `${sizePercentage}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Formats and Conversion trigger */}
          {file && (
            <div className="format-selection-area">
              <span className="section-label">Convert to</span>
              {compatibleFormats.length > 0 ? (
                <div className="format-options">
                  {compatibleFormats.map((fmt) => (
                    <button
                      key={fmt}
                      className={`format-option-btn ${targetFormat === fmt ? 'active' : ''}`}
                      onClick={() => { setTargetFormat(fmt); setConversionResult(null); }}
                    >
                      .{fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="warning-box">
                  <AlertTriangle size={14} />
                  <span>No compatible conversions for .{fileExt.toUpperCase()}</span>
                </div>
              )}

              <button
                className="convert-btn"
                disabled={!targetFormat || isConverting}
                onClick={handleConvert}
              >
                {isConverting ? (
                  <>
                    <RefreshCw className="spin" size={16} />
                    <span>Converting...</span>
                  </>
                ) : (
                  <>
                    <Zap size={16} fill="white" />
                    <span>Convert Now</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Loading Spinner */}
        {isConverting && (
          <div className="loader-overlay">
            <div className="spinner" />
            <p>Processing conversion in memory...</p>
          </div>
        )}

        {/* Direct Output / Results Preview */}
        {conversionResult && !isConverting && (
          <div className="results-panel">
            <div className="results-panel">
              <div className="results-summary">
                <div className="summary-title">
                  <CheckCircle2 size={16} className="success-icon" />
                  <h3>Conversion Successful</h3>
                </div>
                <span className="time-badge">{conversionTime}s</span>
              </div>

              {/* Savings & Comparisons */}
              <div className="savings-meter">
                <div className="size-compare">
                  <span>{formatBytes(conversionResult.originalSize)}</span>
                  <ArrowRight size={14} />
                  <span>{formatBytes(conversionResult.convertedSize)}</span>
                </div>
                {conversionResult.originalSize > conversionResult.convertedSize && (
                  <div className="savings-badge">
                    Saved {((1 - (conversionResult.convertedSize / conversionResult.originalSize)) * 100).toFixed(0)}%
                  </div>
                )}
              </div>

              {/* Compact Integrated Previewer */}
              <div className="output-preview">
                <div className="preview-header">
                  <span>Output Preview</span>
                </div>
                <div className="preview-viewport">
                  {getFileCategory(targetFormat) === 'image' && (
                    <img src={conversionResult.fileData} alt="Converted result" className="viewport-img" />
                  )}
                  {getFileCategory(targetFormat) === 'data' && (
                    <textarea 
                      className="viewport-code" 
                      readOnly 
                      value={atob(conversionResult.fileData.split(',')[1])}
                    />
                  )}
                  {getFileCategory(targetFormat) === 'document' && (
                    targetFormat === 'html' ? (
                      <iframe 
                        className="viewport-iframe" 
                        srcDoc={atob(conversionResult.fileData.split(',')[1])}
                        title="HTML Preview"
                      />
                    ) : targetFormat === 'pdf' ? (
                      <iframe 
                        className="viewport-iframe" 
                        src={conversionResult.fileData}
                        title="PDF Preview"
                      />
                    ) : (
                      <textarea 
                        className="viewport-code" 
                        readOnly 
                        value={atob(conversionResult.fileData.split(',')[1])}
                      />
                    )
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="action-buttons">
                {['data', 'document'].includes(getFileCategory(targetFormat)) && targetFormat !== 'pdf' && (
                  <button className="btn-secondary" onClick={handleCopyToClipboard}>
                    {copied ? (
                      <>
                        <Check size={14} style={{ color: 'var(--accent-green)' }} />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                )}
                <button className="btn-secondary" onClick={handleRemoveFile}>
                  Reset
                </button>
                <button className="btn-primary" onClick={handleDownload}>
                  <Download size={14} />
                  <span>Download</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="error-toast">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
