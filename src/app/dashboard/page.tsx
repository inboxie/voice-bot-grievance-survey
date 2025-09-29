'use client'

import { useState, useEffect } from 'react'
import CallStatus from '@/components/CallStatus'
import TranscriptViewer from '@/components/TranscriptViewer'

interface DashboardData {
  summary: {
    totalCalls: number
    completedCalls: number
    failedCalls: number
    inProgressCalls: number
  }
  calls: Array<{
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
    sentiment?: string
    keyIssues?: string[]
    errorMessage?: string
    campaignId: string
  }>
  campaigns: Array<{
    id: string
    name: string
    status: string
    totalCalls: number
    completedCalls: number
    failedCalls: number
    inProgressCalls: number
  }>
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  // Fetch dashboard data
  const fetchData = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (campaignFilter !== 'all') params.set('campaignId', campaignFilter)
      params.set('limit', '100')

      const response = await fetch(`/api/calls/status?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        // Fetch campaign data separately
        const campaignData = await fetchCampaignData()
        
        setData({
          summary: result.data.summary,
          calls: result.data.calls,
          campaigns: campaignData
        })
      } else {
        console.error('Failed to fetch dashboard data:', result.error)
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error)
    } finally {
      setLoading(false)
      setLastRefresh(new Date())
    }
  }

  // Fetch campaign summaries
  const fetchCampaignData = async () => {
    try {
      // This would need a campaigns API endpoint, for now return mock data
      return []
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
      return []
    }
  }

  // Auto refresh every 10 seconds
  useEffect(() => {
    fetchData()
    
    if (autoRefresh) {
      const interval = setInterval(fetchData, 10000)
      return () => clearInterval(interval)
    }
  }, [statusFilter, campaignFilter, autoRefresh])

  const handleRefresh = () => {
    setLoading(true)
    fetchData()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-success-600 bg-success-100'
      case 'failed': case 'cancelled': return 'text-error-600 bg-error-100'
      case 'calling': case 'ringing': case 'answered': return 'text-primary-600 bg-primary-100'
      case 'pending': return 'text-warning-600 bg-warning-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'text-success-600'
      case 'negative': return 'text-error-600'
      case 'neutral': return 'text-gray-600'
      default: return 'text-gray-400'
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds) return 'N/A'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTime = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleTimeString()
  }

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Call Campaign Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Monitor your voice survey campaigns in real-time
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="autoRefresh" className="text-sm text-gray-700">
              Auto-refresh
            </label>
          </div>
          
          <button
            onClick={handleRefresh}
            disabled={loading}
            className={`btn-secondary ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          
          <p className="text-xs text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Total Calls</h3>
            <p className="text-3xl font-bold text-gray-900">{data.summary.totalCalls}</p>
          </div>
          
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Completed</h3>
            <p className="text-3xl font-bold text-success-600">{data.summary.completedCalls}</p>
            <p className="text-sm text-gray-500 mt-1">
              {data.summary.totalCalls > 0 
                ? `${Math.round((data.summary.completedCalls / data.summary.totalCalls) * 100)}%`
                : '0%'
              }
            </p>
          </div>
          
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-2">In Progress</h3>
            <p className="text-3xl font-bold text-primary-600">{data.summary.inProgressCalls}</p>
            <div className="flex items-center mt-1">
              <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse mr-2"></div>
              <span className="text-sm text-gray-500">Active</span>
            </div>
          </div>
          
          <div className="card">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Failed</h3>
            <p className="text-3xl font-bold text-error-600">{data.summary.failedCalls}</p>
            <p className="text-sm text-gray-500 mt-1">
              {data.summary.totalCalls > 0 
                ? `${Math.round((data.summary.failedCalls / data.summary.totalCalls) * 100)}%`
                : '0%'
              }
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4 items-center">
          <div>
            <label htmlFor="statusFilter" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Status
            </label>
            <select
              id="statusFilter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="select-field"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="calling">Calling</option>
              <option value="ringing">Ringing</option>
              <option value="answered">Answered</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="campaignFilter" className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Campaign
            </label>
            <select
              id="campaignFilter"
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="select-field"
            >
              <option value="all">All Campaigns</option>
              {data?.campaigns.map(campaign => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Calls Table */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Recent Calls</h2>
          <span className="text-sm text-gray-500">
            {data?.calls.length || 0} calls
          </span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Started
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sentiment
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.calls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {call.customerName}
                      </div>
                      <div className="text-sm text-gray-500">
                        {call.customerPhone}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(call.status)}`}>
                      {call.status}
                    </span>
                    {call.errorMessage && (
                      <div className="text-xs text-error-600 mt-1">
                        {call.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatTime(call.startedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDuration(call.duration)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm font-medium ${getSentimentColor(call.sentiment)}`}>
                      {call.sentiment || 'N/A'}
                    </span>
                    {call.keyIssues && call.keyIssues.length > 0 && (
                      <div className="text-xs text-gray-400 mt-1">
                        {call.keyIssues.length} issue{call.keyIssues.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {call.transcript && (
                      <button
                        onClick={() => setSelectedCallId(call.id)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        View Transcript
                      </button>
                    )}
                    {call.status === 'calling' && (
                      <button className="text-error-600 hover:text-error-900">
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {(!data?.calls || data.calls.length === 0) && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-2">No calls found</div>
              <p className="text-gray-500">
                {statusFilter !== 'all' || campaignFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Start a new campaign to see calls here'
                }
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Transcript Modal */}
      {selectedCallId && (
        <TranscriptViewer
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}
    </div>
  )
}