// Generic API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  timestamp: string
}

// Upload API responses
export interface UploadResponse {
  customers: Array<{
    name: string
    phone: string
    reason?: string
    matchedServices?: string[]
  }>
  summary: {
    totalRows: number
    validRows: number
    skippedRows: number
    errors: string[]
  }
  uploadId: string
}

// Campaign start API
export interface StartCampaignRequest {
  customers: Array<{
    name: string
    phone: string
    reason?: string
  }>
  services: string[]
  settings?: {
    maxConcurrentCalls?: number
    retrySettings?: {
      maxRetries: number
      retryDelay: number
    }
    botScript?: string
  }
}

export interface StartCampaignResponse {
  campaignId: string
  callsScheduled: number
  estimatedDuration: number
  status: string
}

// Call status API
export interface CallStatusRequest {
  campaignId?: string
  callId?: string
  status?: string
  limit?: number
  offset?: number
}

export interface CallStatusResponse {
  calls: Array<{
    id: string
    customerName: string
    customerPhone: string
    status: string
    startedAt?: string
    duration?: number
    transcript?: string
    sentiment?: string
  }>
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
  summary: {
    totalCalls: number
    completedCalls: number
    failedCalls: number
    inProgressCalls: number
  }
}

// Transcript API
export interface TranscriptRequest {
  callId: string
}

export interface TranscriptResponse {
  callId: string
  customerName: string
  customerPhone: string
  transcript: string
  summary?: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  keyIssues?: string[]
  duration: number
  timestamp: string
}

// Dashboard Analytics API
export interface AnalyticsRequest {
  campaignId?: string
  dateFrom?: string
  dateTo?: string
  services?: string[]
}

export interface AnalyticsResponse {
  overview: {
    totalCampaigns: number
    totalCalls: number
    successRate: number
    averageDuration: number
  }
  callsByStatus: Record<string, number>
  callsByService: Record<string, number>
  sentimentAnalysis: {
    positive: number
    negative: number
    neutral: number
  }
  topIssues: Array<{
    issue: string
    count: number
    percentage: number
  }>
  timeSeriesData: Array<{
    date: string
    calls: number
    completed: number
    failed: number
  }>
}

// Webhook payload from Twilio
export interface TwilioWebhookPayload {
  AccountSid: string
  CallSid: string
  CallStatus: 'queued' | 'ringing' | 'in-progress' | 'completed' | 'busy' | 'failed' | 'no-answer' | 'cancelled'
  From: string
  To: string
  Direction: 'inbound' | 'outbound'
  Duration?: string
  CallDuration?: string
  RecordingUrl?: string
  RecordingSid?: string
  TranscriptionText?: string
  TranscriptionStatus?: string
  // Custom parameters we add
  campaignId?: string
  customerId?: string
}

// Error types
export interface ApiError {
  code: string
  message: string
  details?: any
  timestamp: string
}

export interface ValidationError {
  field: string
  message: string
  value?: any
}

// Pagination helper
export interface PaginationParams {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
    totalPages: number
    currentPage: number
  }
}

// Real-time updates (for WebSocket or SSE)
export interface RealtimeUpdate {
  type: 'call_update' | 'campaign_update' | 'system_status'
  campaignId?: string
  callId?: string
  data: any
  timestamp: string
}