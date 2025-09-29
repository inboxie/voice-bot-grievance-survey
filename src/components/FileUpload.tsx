'use client'

import { useState, useRef } from 'react'

interface FileUploadProps {
  onFileSelect: (file: File) => void
  isProcessing: boolean
}

export default function FileUpload({ onFileSelect, isProcessing }: FileUploadProps) {
  const [dragOver, setDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelection(files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFileSelection(files[0])
    }
  }

  const handleFileSelection = (file: File) => {
    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ]
    
    if (!validTypes.includes(file.type)) {
      alert('Please upload an Excel file (.xlsx, .xls) or CSV file (.csv)')
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB')
      return
    }

    setSelectedFile(file)
    onFileSelect(file)
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-primary-400 bg-primary-50'
            : isProcessing
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={!isProcessing ? handleClick : undefined}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileInput}
          className="hidden"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <div className="space-y-3">
            <div className="animate-spin mx-auto h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full"></div>
            <p className="text-sm text-gray-600">Processing file...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg className="h-full w-full" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {selectedFile ? 'Click to change file' : 'Upload Excel or CSV file'}
              </p>
              <p className="text-xs text-gray-500">
                Drag and drop or click to browse
              </p>
            </div>
          </div>
        )}
      </div>

      {/* File Requirements */}
      <div className="text-xs text-gray-500 space-y-1">
        <p><strong>Required columns:</strong> Name, Phone Number</p>
        <p><strong>Optional columns:</strong> Reason, Email, Account Number</p>
        <p><strong>Supported formats:</strong> .xlsx, .xls, .csv</p>
        <p><strong>Max file size:</strong> 10MB</p>
      </div>

      {/* Selected File Info */}
      {selectedFile && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="h-8 w-8 bg-success-100 rounded-lg flex items-center justify-center">
                <svg className="h-4 w-4 text-success-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 truncate max-w-xs">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSelectedFile(null)
                if (fileInputRef.current) {
                  fileInputRef.current.value = ''
                }
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
              disabled={isProcessing}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}