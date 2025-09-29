'use client'

import { useState, useEffect } from 'react'

interface TranscriptData {
  callId: string
  customerName: string
  customerPhone: string
  transcript: string
  summary?: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  keyIssues?: string[]
  duration: number
  timestamp: string
  startedAt?: string
  endedAt?: string
}

interface TranscriptViewerProps {
  callId: string
  onClose: () => void
}

export default function TranscriptViewer({ callId, onClose }: TranscriptViewerProps) {
  const [transcript, setTranscript] = useState<TranscriptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRawTranscript, setShowRawTranscript] = useState(false)
  const [exportFormat, setExportFormat] = useState<'txt' | 'json'>('txt')

  // Fetch transcript data
  useEffect(() => {
    fetchTranscript()
  }, [callId])

  const fetchTranscript = async () => {
    try {
      setLoading(true)
      
      // First get call details
      const callResponse = await fetch(`/api/calls/status?callId=${callId}`)
      const callResult = await callResponse.json()
      
      if (!callResult.success) {
        throw new Error(callResult.error || 'Failed to fetch call details')
      }
      
      const callData = callResult.data.call
      
      // Format transcript data
      const transcriptData: TranscriptData = {
        callId: callData.id,
        customerName: callData.customerName,
        customerPhone: callData.customerPhone,
        transcript: callData.transcript || '',
        summary: callData.summary,
        sentiment: callData.sentiment,
        keyIssues: callData.keyIssues,
        duration: callData.duration || 0,
        timestamp: callData.endedAt || callData.startedAt || new Date().toISOString(),
        startedAt: callData.startedAt,
        endedAt: callData.endedAt
      }
      
      setTranscript(transcriptData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transcript')
    } finally {
      setLoading(false)
    }
  }

  // Parse transcript into conversation turns
  const parseTranscript = (rawTranscript: string) => {
    if (!rawTranscript) return []
    
    const lines = rawTranscript.split('\n').filter(line => line.trim())
    const conversation: Array<{
      speaker: 'customer' | 'ai'
      message: string
      timestamp?: string
    }> = []
    
    for (const line of lines) {
      if (line.includes('Customer:')) {
        conversation.push({
          speaker: 'customer',
          message: line.replace('Customer:', '').trim()
        })
      } else if (line.includes('AI Assistant:')) {
        conversation.push({
          speaker: 'ai',
          message: line.replace('AI Assistant:', '').trim()
        })
      } else if (line.trim() && conversation.length === 0) {
        // If no speaker prefix, assume it's part of the conversation
        conversation.push({
          speaker: 'customer',
          message: line.trim()
        })
      }
    }
    
    return conversation
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'text-success-600 bg-success-100'
      case 'negative': return 'text-error-600 bg-error-100'
      case 'neutral': return 'text-gray-600 bg-gray-100'
      default: return 'text-gray-500 bg-gray-100'
    }
  }

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '😊'
      case 'negative': return '😞'
      case 'neutral': return '😐'
      default: return '❓'
    }
  }

  const exportTranscript = () => {
    if (!transcript) return
    
    let content: string
    let filename: string
    let mimeType: string
    
    if (exportFormat === 'json') {
      content = JSON.stringify(transcript, null, 2)
      filename = `transcript-${transcript.callId}.json`
      mimeType = 'application/json'
    } else {
      content = `Call Transcript
Customer: ${transcript.customerName}
Phone: ${transcript.customerPhone}
Duration: ${formatDuration(transcript.duration)}
Date: ${new Date(transcript.timestamp).toLocaleString()}
Sentiment: ${transcript.sentiment || 'N/A'}

${transcript.summary ? `Summary:\n${transcript.summary}\n\n` : ''}${transcript.keyIssues && transcript.keyIssues.length > 0 ? `Key Issues:\n${transcript.keyIssues.map(issue => `- ${issue}`).join('\n')}\n\n` : ''}Transcript:
${transcript.transcript}`
      filename = `transcript-${transcript.callId}.txt`
      mimeType = 'text/plain'
    }
    
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const conversation = transcript ? parseTranscript(transcript.transcript) : []

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Call Transcript</h2>
            {transcript && (
              <p className="text-sm text-gray-600 mt-1">
                {transcript.customerName} • {new Date(transcript.timestamp).toLocaleString()}
              </p>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            {transcript && (
              <>
                <div className="flex items-center space-x-2">
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value as 'txt' | 'json')}
                    className="text-xs border border-gray-300 rounded px-2 py-1"
                  >
                    <option value="txt">Text</option>
                    <option value="json">JSON</option>
                  </select>
                  <button
                    onClick={exportTranscript}
                    className="text-xs btn-secondary"
                  >
                    Export
                  </button>
                </div>
                
                <button
                  onClick={() => setShowRawTranscript(!showRawTranscript)}
                  className="text-xs btn-secondary"
                >
                  {showRawTranscript ? 'Formatted' : 'Raw'}
                </button>
              </>
            )}
            
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="text-error-600 text-lg mb-2">Error Loading Transcript</div>
                <p className="text-gray-600">{error}</p>
                <button
                  onClick={fetchTranscript}
                  className="btn-primary mt-4"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : !transcript ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-gray-500">
                No transcript available
              </div>
            </div>
          ) : (
            <div className="flex h-full">
              {/* Sidebar with call details */}
              <div className="w-80 bg-gray-50 p-6 border-r border-gray-200 overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Call Details</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Customer</label>
                    <p className="text-sm text-gray-900">{transcript.customerName}</p>
                    <p className="text-xs text-gray-500">{transcript.customerPhone}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Duration</label>
                    <p className="text-sm text-gray-900">{formatDuration(transcript.duration)}</p>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700">Call Time</label>
                    <p className="text-sm text-gray-900">
                      {transcript.startedAt && new Date(transcript.startedAt).toLocaleString()}
                    </p>
                  </div>
                  
                  {transcript.sentiment && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Sentiment</label>
                      <div className="flex items-center mt-1">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSentimentColor(transcript.sentiment)}`}>
                          {getSentimentIcon(transcript.sentiment)} {transcript.sentiment}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {transcript.keyIssues && transcript.keyIssues.length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">Key Issues</label>
                      <div className="mt-2 space-y-1">
                        {transcript.keyIssues.map((issue, index) => (
                          <span
                            key={index}
                            className="inline-block px-2 py-1 text-xs bg-warning-100 text-warning-800 rounded mr-1 mb-1"
                          >
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {transcript.summary && (
                    <div>
                      <label className="text-sm font-medium text-gray-700">AI Summary</label>
                      <div className="mt-2 p-3 bg-white rounded border text-sm text-gray-700">
                        {transcript.summary}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Main transcript area */}
              <div className="flex-1 overflow-y-auto p-6">
                {showRawTranscript ? (
                  <div className="font-mono text-sm whitespace-pre-wrap bg-gray-100 p-4 rounded">
                    {transcript.transcript}
                  </div>
                ) : conversation.length > 0 ? (
                  <div className="space-y-4">
                    {conversation.map((turn, index) => (
                      <div
                        key={index}
                        className={`flex ${turn.speaker === 'customer' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            turn.speaker === 'customer'
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-200 text-gray-900'
                          }`}
                        >
                          <div className="text-xs opacity-75 mb-1">
                            {turn.speaker === 'customer' ? 'Customer' : 'AI Assistant'}
                          </div>
                          <div className="text-sm">{turn.message}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <p>No conversation data available</p>
                    <button
                      onClick={() => setShowRawTranscript(true)}
                      className="text-primary-600 hover:text-primary-700 text-sm mt-2"
                    >
                      View raw transcript
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {transcript && (
              <span>Call ID: {transcript.callId}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}