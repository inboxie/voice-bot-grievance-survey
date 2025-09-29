'use client'

import { useState, useEffect } from 'react'

interface Call {
  id: string
  customerName: string
  customerPhone: string
  status: string
  scheduledAt: string
  startedAt?: string
  endedAt?: string
  duration?: number
  transcript?: string
  summary?: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  keyIssues?: string[]
  errorMessage?: string
  campaignId: string
  retryCount?: number
  maxRetries?: number
}

interface CallStatusProps {
  campaignId?: string
  refreshInterval?: number
  onCallSelect?: (call: Call) => void
  maxCalls?: number
  statusFilter?: string
}

export default function CallStatus({
  campaignId,
  refreshInterval = 5000,
  onCallSelect,
  maxCalls = 50,
  statusFilter = 'all'
}: CallStatusProps) {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Fetch calls data
  const fetchCalls = async () => {
    try {
      const params = new URLSearchParams()
      if (campaignId) params.set('campaignId', campaignId)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('limit', maxCalls.toString())
      params.set('sortBy', 'scheduledAt')
      params.set('sortOrder', 'desc')

      const response = await fetch(`/api/calls/status?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setCalls(result.data.calls || [])
        setError(null)
      } else {
        setError(result.error || 'Failed to fetch calls')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setLoading(false)
      setLastUpdate(new Date())
    }
  }

  // Auto refresh
  useEffect(() => {
    fetchCalls()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchCalls, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [campaignId, statusFilter, refreshInterval, maxCalls])

  // Cancel individual call
  const handleCancelCall = async (callId: string) => {
    try {
      const response = await fetch('/api/calls/status', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ callIds: [callId] }),
      })

      const result = await response.json()
      
      if (result.success) {
        // Refresh calls list
        fetchCalls()
      } else {
        setError(result.error || 'Failed to cancel call')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel call')
    }
  }

  // Retry failed call
  const handleRetryCall = async (callId: string) => {
    try {
      const response = await fetch('/api/calls/status', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          callId, 
          status: 'pending',
          reason: 'Manual retry'
        }),
      })

      const result = await response.json()
      
      if (result.success) {
        fetchCalls()
      } else {
        setError(result.error || 'Failed to retry call')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry call')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <div className="w-4 h-4 border-2 border-warning-500 border-t-transparent rounded-full animate-spin"></div>
        )
      case 'calling':
      case 'ringing':
        return (
          <div className="w-4 h-4 bg-primary-500 rounded-full animate-pulse"></div>
        )
      case 'answered':
        return (
          <div className="w-4 h-4 bg-primary-600 rounded-full">
            <div className="w-2 h-2 bg-white rounded-full mx-auto mt-1"></div>
          </div>
        )
      case 'completed':
        return (
          <div className="w-4 h-4 bg-success-500 rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )
      case 'failed':
      case 'cancelled':
        return (
          <div className="w-4 h-4 bg-error-500 rounded-full flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        )
      default:
        return <div className="w-4 h-4 bg-gray-400 rounded-full"></div>
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'status-completed'
      case 'failed': case 'cancelled': return 'status-failed'
      case 'calling': case 'ringing': case 'answered': return 'status-calling'
      case 'pending': return 'status-pending'
      default: return 'status-badge bg-gray-100 text-gray-800'
    }
  }

  const getSentimentEmoji = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return '😊'
      case 'negative': return '😞'
      case 'neutral': return '😐'
      default: return '❓'
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTime = (dateString?: string) => {
    if (!dateString) return null
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return `${Math.floor(diffHours / 24)}d ago`
  }

  if (loading && calls.length === 0) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">
          Call Status {campaignId && '- Campaign'} {calls.length > 0 && `(${calls.length})`}
        </h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">
            Updated {formatTime(lastUpdate.toISOString())}
          </span>
          <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse"></div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-error-50 border border-error-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-error-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-error-800">Error loading calls</h3>
              <p className="text-sm text-error-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Calls List */}
      <div className="space-y-2">
        {calls.length === 0 ? (
          <div className="card text-center py-8">
            <div className="text-gray-400 text-lg mb-2">No calls found</div>
            <p className="text-gray-500">
              {statusFilter !== 'all' 
                ? `No calls with status "${statusFilter}"` 
                : 'No calls have been scheduled yet'
              }
            </p>
          </div>
        ) : (
          calls.map((call) => (
            <div 
              key={call.id} 
              className="card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onCallSelect?.(call)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                  {/* Status Icon */}
                  <div className="flex-shrink-0">
                    {getStatusIcon(call.status)}
                  </div>
                  
                  {/* Customer Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {call.customerName}
                      </h4>
                      <span className={`${getStatusColor(call.status)} text-xs`}>
                        {call.status}
                      </span>
                      {call.sentiment && (
                        <span className="text-sm" title={`Sentiment: ${call.sentiment}`}>
                          {getSentimentEmoji(call.sentiment)}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                      <span>{call.customerPhone}</span>
                      
                      {call.startedAt && (
                        <span>Started: {formatTime(call.startedAt)}</span>
                      )}
                      
                      {call.duration && (
                        <span>Duration: {formatDuration(call.duration)}</span>
                      )}
                      
                      <span>{getTimeSince(call.scheduledAt)}</span>
                    </div>
                    
                    {/* Error Message */}
                    {call.errorMessage && (
                      <div className="text-xs text-error-600 mt-1 bg-error-50 px-2 py-1 rounded">
                        {call.errorMessage}
                        {call.retryCount && call.maxRetries && (
                          <span className="ml-2">
                            (Retry {call.retryCount}/{call.maxRetries})
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Key Issues */}
                    {call.keyIssues && call.keyIssues.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {call.keyIssues.slice(0, 3).map((issue, index) => (
                          <span 
                            key={index}
                            className="inline-block px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded"
                          >
                            {issue}
                          </span>
                        ))}
                        {call.keyIssues.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{call.keyIssues.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center space-x-2">
                    {/* Calling/In Progress - Cancel button */}
                    {['calling', 'ringing', 'answered'].includes(call.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCancelCall(call.id)
                        }}
                        className="text-xs text-error-600 hover:text-error-800 px-2 py-1 border border-error-300 rounded hover:bg-error-50"
                      >
                        Cancel
                      </button>
                    )}
                    
                    {/* Failed - Retry button */}
                    {call.status === 'failed' && call.retryCount !== undefined && call.retryCount < (call.maxRetries || 3) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRetryCall(call.id)
                        }}
                        className="text-xs text-primary-600 hover:text-primary-800 px-2 py-1 border border-primary-300 rounded hover:bg-primary-50"
                      >
                        Retry
                      </button>
                    )}
                    
                    {/* Completed - View details */}
                    {call.status === 'completed' && call.transcript && (
                      <div className="text-xs text-success-600">
                        📄 Transcript
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}