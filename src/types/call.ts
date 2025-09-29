export interface Call {
  id: string
  customerId: string
  customerName: string
  customerPhone: string
  status: CallStatus
  // Twilio specific
  twilioSid?: string
  // Call timing
  scheduledAt: Date
  startedAt?: Date
  endedAt?: Date
  duration?: number // in seconds
  // Call content
  transcript?: string
  summary?: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  keyIssues?: string[]
  resolution?: string
  // Technical details
  errorMessage?: string
  retryCount: number
  maxRetries: number
  // Metadata
  campaignId: string
  services: string[]
  createdAt: Date
  updatedAt: Date
}

export type CallStatus = 
  | 'pending'     // Scheduled but not started
  | 'calling'     // Currently in progress
  | 'ringing'     // Phone is ringing
  | 'answered'    // Call was answered
  | 'completed'   // Call finished successfully
  | 'failed'      // Call failed (busy, no answer, error)
  | 'cancelled'   // Cancelled by system or user
  | 'voicemail'   // Went to voicemail
  | 'retry'       // Scheduled for retry

export interface CallCampaign {
  id: string
  name: string
  status: CampaignStatus
  totalCalls: number
  completedCalls: number
  successfulCalls: number
  failedCalls: number
  services: string[]
  customerCount: number
  // Timing
  startedAt: Date
  completedAt?: Date
  estimatedDuration?: number
  // Configuration
  maxConcurrentCalls: number
  retrySettings: RetrySettings
  botScript: string
  // Metadata
  createdBy?: string
  createdAt: Date
  updatedAt: Date
}

export type CampaignStatus = 
  | 'draft'       // Campaign created but not started
  | 'running'     // Currently making calls
  | 'paused'      // Temporarily paused
  | 'completed'   // All calls finished
  | 'cancelled'   // Stopped by user
  | 'error'       // System error

export interface RetrySettings {
  maxRetries: number
  retryDelay: number // minutes
  retryOnBusy: boolean
  retryOnNoAnswer: boolean
  retryOnFailed: boolean
}

export interface CallAnalytics {
  totalCalls: number
  completedCalls: number
  successRate: number
  averageDuration: number
  sentimentBreakdown: {
    positive: number
    negative: number
    neutral: number
  }
  topIssues: Array<{
    issue: string
    count: number
    percentage: number
  }>
  callsByStatus: Record<CallStatus, number>
  callsByService: Record<string, number>
}

export interface CallWebhookPayload {
  CallSid: string
  CallStatus: string
  From: string
  To: string
  Duration?: string
  RecordingUrl?: string
  TranscriptionText?: string
  // Custom parameters
  campaignId?: string
  customerId?: string
}

// Real-time call updates
export interface CallUpdate {
  callId: string
  status: CallStatus
  message?: string
  timestamp: Date
  data?: any
}