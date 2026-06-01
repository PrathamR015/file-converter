import { useState, useRef, useEffect } from 'react';
import { 
  ArrowRight, 
  X, 
  Check, 
  Download, 
  RefreshCw, 
  AlertCircle,
  Plus
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionResult, setConversionResult] = useState(null);
  const [error, setError] = useState('');
  const [conversionTime, setConversionTime] = useState(null);
  const [activeTab, setActiveTab] = useState('Tools');
  const fileInputRef = useRef(null);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.preview) {
          URL.revokeObjectURL(f.preview);
        }
      });
    };
  }, [files]);

  // Clean error after 6 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const validateAndAddFiles = (selectedFiles) => {
    setError('');
    setConversionResult(null);
    setConversionTime(null);

    const validFiles = [];
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB per file limit

    Array.from(selectedFiles).forEach(file => {
      // Check file size
      if (file.size > MAX_SIZE) {
        setError(`File ${file.name} exceeds the 5MB size limit.`);
        return;
      }

      // Check file type (allow images)
      const ext = file.name.split('.').pop().toLowerCase();
      const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'avif'];
      
      if (!imageExtensions.includes(ext)) {
        setError(`File ${file.name} is not a supported image format.`);
        return;
      }

      // Create a unique preview object
      validFiles.push({
        id: Math.random().toString(36).substring(2, 9) + Date.now(),
        file: file,
        name: file.name,
        size: file.size,
        preview: URL.createObjectURL(file)
      });
    });

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
  };

  const handleRemoveFile = (idToRemove) => {
    const fileToRemove = files.find(f => f.id === idToRemove);
    if (fileToRemove && fileToRemove.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    setFiles(prev => prev.filter(f => f.id !== idToRemove));
    setConversionResult(null);
    setConversionTime(null);
  };

  const handleReset = () => {
    files.forEach(f => {
      if (f.preview) {
        URL.revokeObjectURL(f.preview);
      }
    });
    setFiles([]);
    setConversionResult(null);
    setConversionTime(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConvert = async () => {
    if (files.length === 0) return;

    setIsConverting(true);
    setError('');
    const startTime = performance.now();

    const formData = new FormData();
    files.forEach(fileObj => {
      formData.append('files', fileObj.file);
    });
    formData.append('targetFormat', 'pdf');

    try {
      const response = await fetch(`${API_URL}/api/convert-multiple`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to compile images into PDF.');
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

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <>
      {/* Navigation Header */}
      <header className="navbar">
        <div className="nav-left">
          <a href="#" className="nav-brand">
            JPG to PDF
          </a>
          <ul className="nav-links">
            {['Tools', 'Compress', 'Merge', 'Help'].map((tab) => (
              <li 
                key={tab} 
                className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </li>
            ))}
          </ul>
        </div>
        <div className="nav-right">
          <button className="btn-signin">Sign In</button>
          <button className="btn-getstarted">Get Started</button>
        </div>
      </header>

      {/* Main Container */}
      <div className="app-container">
        
        {/* Upload dropzone (Visible when not showing results or loading) */}
        {!conversionResult && !isConverting && (
          <div 
            className={`dropzone-container transition-all ${dragActive ? 'active' : ''}`}
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
              multiple
              accept="image/*"
              className="dropzone-input"
            />
            <div className="dropzone-plus-btn">
              <Plus size={24} />
            </div>
            <h3 className="dropzone-text">Drag & drop JPG images here</h3>
            <p className="dropzone-subtext">or Click to select</p>
          </div>
        )}

        {/* Selected Images Management (Visible when files exist and not in results/loading) */}
        {files.length > 0 && !conversionResult && !isConverting && (
          <section className="manage-section">
            <div className="manage-header">
              <h2 className="manage-title">Manage Images</h2>
              <span className="selected-count-pill">
                {files.length} {files.length === 1 ? 'Image' : 'Images'} Selected
              </span>
            </div>

            <div className="images-grid">
              {files.map((fileObj) => (
                <div key={fileObj.id} className="image-card animate-fade-in">
                  <button 
                    className="card-close-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(fileObj.id);
                    }}
                    title="Remove Image"
                  >
                    <X size={14} />
                  </button>
                  <div className="image-wrapper">
                    <img src={fileObj.preview} alt={fileObj.name} className="card-image" />
                  </div>
                  <div className="card-details">
                    <h4 className="card-filename" title={fileObj.name}>{fileObj.name}</h4>
                    <span className="card-filesize">{formatBytes(fileObj.size)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Convert Actions */}
            <div className="action-container">
              <button 
                className="btn-convert transition-all" 
                onClick={handleConvert}
                disabled={files.length === 0}
              >
                <span>Convert to PDF</span>
                <ArrowRight size={18} className="arrow-icon" />
              </button>
            </div>
          </section>
        )}

        {/* Processing Loader */}
        {isConverting && (
          <div className="loading-box">
            <div className="loading-spinner" />
            <h3 className="loading-title">Converting Images</h3>
            <p className="loading-text">Combining your images into a single premium PDF document in memory...</p>
          </div>
        )}

        {/* Conversion Success View */}
        {conversionResult && !isConverting && (
          <div className="results-card">
            <div className="results-top">
              <div className="success-header">
                <div className="check-badge">
                  <Check size={18} strokeWidth={3} />
                </div>
                <h3 className="success-title">PDF Ready for Download</h3>
              </div>
              <span className="badge-time">{conversionTime}s</span>
            </div>

            {/* Compares & Savings */}
            <div className="savings-box">
              <div className="savings-info">
                <span>{formatBytes(conversionResult.originalSize)}</span>
                <ArrowRight size={14} />
                <span>{formatBytes(conversionResult.convertedSize)}</span>
              </div>
              {conversionResult.originalSize > conversionResult.convertedSize && (
                <div className="savings-tag animate-fade-in">
                  Saved {((1 - (conversionResult.convertedSize / conversionResult.originalSize)) * 100).toFixed(0)}%
                </div>
              )}
            </div>

            {/* Document Preview Viewport */}
            <div className="preview-section">
              <span className="preview-title">Output Preview</span>
              <div className="preview-frame-container">
                <iframe 
                  className="preview-iframe" 
                  src={conversionResult.fileData} 
                  title="PDF Output Preview" 
                />
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="results-actions">
              <button className="btn-reset" onClick={handleReset}>
                Reset
              </button>
              <button className="btn-download" onClick={handleDownload}>
                <Download size={16} />
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* Muted Error Toast Alert */}
        {error && (
          <div className="toast-alert">
            <AlertCircle size={16} className="toast-icon" />
            <span>{error}</span>
          </div>
        )}

      </div>

      {/* Footer */}
      <footer className="footer">
        <span className="footer-copy">© 2024 JPG to PDF Converter. All rights reserved.</span>
        <ul className="footer-links">
          <li><a href="#" className="footer-link">Privacy Policy</a></li>
          <li><a href="#" className="footer-link">Terms of Service</a></li>
          <li><a href="#" className="footer-link">Contact Support</a></li>
        </ul>
      </footer>
    </>
  );
}
