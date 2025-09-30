import { v4 as uuidv4 } from 'uuid'
import Database from './database'
import { TwilioClient } from './twilio-client'
import OpenAIClient, { ConversationContext } from './openai-client'
import { ProcessedCustomer } from '@/types/customer'
import { Call, CallCampaign, CallStatus, CampaignStatus } from '@/types/call'

export interface CampaignConfig {
  name: string
  services: string[]
  customers: ProcessedCustomer[]
  maxConcurrentCalls?: number
  retrySettings?: {
    maxRetries: number
    retryDelay: number
    retryOnBusy: boolean
    retryOnNoAnswer: boolean
    retryOnFailed: boolean
  }
  botScript?: string
}

export class CallOrchestrator {
  private db: Database
  private twilioClient: TwilioClient
  private openaiClient: OpenAIClient
  private activeCalls: Map<string, ConversationContext> = new Map()
  private processingQueue: Map<string, NodeJS.Timeout> = new Map()
  
  constructor() {
    this.db = Database.getInstance()
    this.twilioClient = new TwilioClient()
    this.openaiClient = new OpenAIClient()
  }
  
  /**
   * Start a new calling campaign
   */
  async startCampaign(config: CampaignConfig): Promise<{ campaignId: string; callsScheduled: number }> {
    await this.db.connect()
    
    // Create campaign record
    const campaign: CallCampaign = {
      id: uuidv4(),
      name: config.name,
      status: 'running',
      totalCalls: config.customers.length,
      completedCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      services: config.services,
      customerCount: config.customers.length,
      startedAt: new Date(),
      maxConcurrentCalls: config.maxConcurrentCalls || 5,
      retrySettings: config.retrySettings || {
        maxRetries: 3,
        retryDelay: 5,
        retryOnBusy: true,
        retryOnNoAnswer: true,
        retryOnFailed: true
      },
      botScript: config.botScript || '',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    await this.db.insertCampaign(campaign)
    
    // Store customers in database
    await this.db.insertCustomers(config.customers)
    
    // Create call records
    const calls: Call[] = config.customers.map(customer => ({
      id: uuidv4(),
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      campaignId: campaign.id,
      status: 'pending' as CallStatus,
      scheduledAt: new Date(),
      retryCount: 0,
      maxRetries: campaign.retrySettings.maxRetries,
      services: customer.matchedServices,
      createdAt: new Date(),
      updatedAt: new Date()
    }))
    
    // Insert calls into database
    for (const call of calls) {
      await this.db.insertCall(call)
    }
    
    // Start processing calls
    this.processCampaignCalls(campaign.id)
    
    return {
      campaignId: campaign.id,
      callsScheduled: calls.length
    }
  }
  
  /**
   * Process calls for a campaign with concurrency control
   */
  private async processCampaignCalls(campaignId: string): Promise<void> {
    const campaign = await this.db.getCampaignById(campaignId)
    if (!campaign || campaign.status !== 'running') return
    
    const pendingCalls = await this.db.getCallsByStatus('pending')
    const campaignCalls = pendingCalls.filter(call => call.campaignId === campaignId)
    
    // Process calls with concurrency limit
    const concurrentLimit = campaign.maxConcurrentCalls
    let activeCount = 0
    
    for (const call of campaignCalls) {
      if (activeCount >= concurrentLimit) {
        // Schedule remaining calls with delay
        setTimeout(() => {
          this.processCampaignCalls(campaignId)
        }, 10000) // Check again in 10 seconds
        break
      }
      
      activeCount++
      this.processIndividualCall(call)
        .finally(() => {
          activeCount--
          // Continue processing remaining calls
          setTimeout(() => {
            this.processCampaignCalls(campaignId)
          }, 2000)
        })
    }
  }
  
  /**
   * Process an individual call
   */
  private async processIndividualCall(call: Call): Promise<void> {
    try {
      // Update call status to calling
      await this.db.updateCallStatus(call.id, 'calling', {
        startedAt: new Date()
      })
      
      // Get customer data
      const customer = await this.db.getCustomerById(call.customerId)
      if (!customer) {
        await this.db.updateCallStatus(call.id, 'failed', {
          errorMessage: 'Customer data not found'
        })
        return
      }
      
      // Format phone number
      const formattedPhone = TwilioClient.formatPhoneNumber(call.customerPhone)
      
      // Initialize conversation context
      const context: ConversationContext = {
        callId: call.id,
        campaignId: call.campaignId,
        customerName: customer.name,
        customerReason: customer.reason || '',
        services: call.services,
        bankName: process.env.BANK_NAME || 'Your Bank',
        botName: process.env.BOT_NAME || 'Customer Care Assistant',
        conversationHistory: []
      }
      
      this.activeCalls.set(call.id, context)
      
      // Initiate Twilio call
      const twilioResult = await this.twilioClient.makeCall({
        ...call,
        customerPhone: formattedPhone
      })
      
      if (twilioResult.success && twilioResult.twilioSid) {
        await this.db.updateCallStatus(call.id, 'ringing', {
          twilioSid: twilioResult.twilioSid
        })
      } else {
        await this.db.updateCallStatus(call.id, 'failed', {
          errorMessage: twilioResult.error
        })
        this.activeCalls.delete(call.id)
      }
      
    } catch (error) {
      console.error(`Failed to process call ${call.id}:`, error)
      await this.db.updateCallStatus(call.id, 'failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
      this.activeCalls.delete(call.id)
    }
  }
  
  /**
   * Handle Twilio webhook updates
   */
  async handleTwilioWebhook(payload: any): Promise<void> {
    const { CallSid, CallStatus, Duration, From, To } = payload
    
    // Find call by Twilio SID
    const calls = await this.db.getCallsByStatus('ringing')
    const activeCalls = await this.db.getCallsByStatus('answered')
    const allCalls = [...calls, ...activeCalls]
    
    const call = allCalls.find(c => c.twilioSid === CallSid)
    if (!call) {
      console.log('Call not found for Twilio SID:', CallSid)
      return
    }
    
    // Map Twilio status to our status
    let newStatus: CallStatus
    const updates: Partial<Call> = {}
    
    switch (CallStatus) {
      case 'ringing':
        newStatus = 'ringing'
        break
      case 'in-progress':
        newStatus = 'answered'
        break
      case 'completed':
        newStatus = 'completed'
        updates.endedAt = new Date()
        if (Duration) {
          updates.duration = parseInt(Duration)
        }
        break
      case 'busy':
      case 'no-answer':
      case 'failed':
        newStatus = 'failed'
        updates.endedAt = new Date()
        updates.errorMessage = CallStatus
        break
      case 'canceled':
        newStatus = 'cancelled'
        updates.endedAt = new Date()
        break
      default:
        return
    }
    
    await this.db.updateCallStatus(call.id, newStatus, updates)
    
    // Handle call completion
    if (newStatus === 'completed') {
      await this.handleCallCompletion(call.id)
    } else if (newStatus === 'failed') {
      await this.handleCallFailure(call.id)
    }
  }
  
  /**
   * Handle completed call
   */
  private async handleCallCompletion(callId: string): Promise<void> {
    const context = this.activeCalls.get(callId)
    if (!context) return
    
    try {
      // Generate call summary
      const summary = await this.openaiClient.generateCallSummary(context)
      
      // Update call with summary
      await this.db.updateCallStatus(callId, 'completed', {
        transcript: this.formatTranscript(context.conversationHistory),
        summary: summary.summary,
        sentiment: summary.sentiment,
        keyIssues: summary.keyIssues
      })
      
      // Get recording and transcription from Twilio
      const call = await this.db.getCallsByCampaign(context.campaignId)
      const currentCall = call.find(c => c.id === callId)
      
      if (currentCall?.twilioSid) {
        // Fetch recording URL
        const recordingUrl = await this.twilioClient.getCallRecording(currentCall.twilioSid)
        console.log('Recording URL:', recordingUrl)
        
        // Fetch Twilio transcription
        const twilioTranscription = await this.twilioClient.getCallTranscription(currentCall.twilioSid)
        if (twilioTranscription) {
          console.log('Twilio transcription:', twilioTranscription)
        }
      }
      
    } catch (error) {
      console.error('Error handling call completion:', error)
    } finally {
      this.activeCalls.delete(callId)
    }
  }
  
  /**
   * Handle failed call with retry logic
   */
  private async handleCallFailure(callId: string): Promise<void> {
    const calls = await this.db.getCallsByCampaign('')
    const call = calls.find(c => c.id === callId)
    
    if (!call) return
    
    const campaign = await this.db.getCampaignById(call.campaignId)
    if (!campaign) return
    
    // Check if we should retry
    if (call.retryCount < call.maxRetries) {
      const shouldRetry = this.shouldRetryCall(call.errorMessage || '', campaign.retrySettings)
      
      if (shouldRetry) {
        // Schedule retry
        const retryDelay = campaign.retrySettings.retryDelay * 60 * 1000 // Convert to milliseconds
        
        setTimeout(async () => {
          await this.db.updateCallStatus(callId, 'pending')
          // The campaign processor will pick this up
        }, retryDelay)
        
        console.log(`Scheduling retry for call ${callId} in ${campaign.retrySettings.retryDelay} minutes`)
      }
    }
    
    this.activeCalls.delete(callId)
  }
  
  /**
   * Determine if a call should be retried based on error and settings
   */
  private shouldRetryCall(errorMessage: string, retrySettings: any): boolean {
    const error = errorMessage.toLowerCase()
    
    if (error.includes('busy') && retrySettings.retryOnBusy) return true
    if (error.includes('no-answer') && retrySettings.retryOnNoAnswer) return true
    if (error.includes('failed') && retrySettings.retryOnFailed) return true
    
    return false
  }
  
  /**
   * Handle incoming audio stream from customer
   */
  async handleCustomerInput(callId: string, audioInput: string): Promise<string> {
    const context = this.activeCalls.get(callId)
    if (!context) {
      return "I'm sorry, there seems to be a technical issue. Could you please repeat that?"
    }
    
    try {
      // Process customer input with OpenAI
      const aiResponse = await this.openaiClient.generateResponse(audioInput, context)
      
      // Check if call should end
      if (aiResponse.shouldEndCall) {
        const closingMessage = this.openaiClient.generateClosingMessage(context, aiResponse.summary)
        
        // Schedule call completion
        setTimeout(async () => {
          await this.handleCallCompletion(callId)
        }, 5000) // Give time for closing message
        
        return closingMessage
      }
      
      return this.openaiClient.optimizeForSpeech(aiResponse.message)
      
    } catch (error) {
      console.error('Error processing customer input:', error)
      return "I apologize for the technical difficulty. Could you please continue with what you were saying?"
    }
  }
  
  /**
   * Get campaign status and statistics
   */
  async getCampaignStatus(campaignId: string): Promise<any> {
    const campaign = await this.db.getCampaignById(campaignId)
    if (!campaign) return null
    
    const calls = await this.db.getCallsByCampaign(campaignId)
    
    const statusCounts = calls.reduce((acc, call) => {
      acc[call.status] = (acc[call.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    return {
      campaign,
      calls: calls.length,
      statusCounts,
      completed: statusCounts.completed || 0,
      failed: statusCounts.failed || 0,
      inProgress: (statusCounts.calling || 0) + (statusCounts.ringing || 0) + (statusCounts.answered || 0),
      pending: statusCounts.pending || 0
    }
  }
  
  /**
   * Cancel a campaign
   */
  async cancelCampaign(campaignId: string): Promise<void> {
    await this.db.updateCampaignStatus(campaignId, 'cancelled')
    
    // Cancel active calls
    const activeCalls = await this.db.getCallsByCampaign(campaignId)
    for (const call of activeCalls) {
      if (['calling', 'ringing', 'answered'].includes(call.status)) {
        if (call.twilioSid) {
          await this.twilioClient.cancelCall(call.twilioSid)
        }
        await this.db.updateCallStatus(call.id, 'cancelled')
      }
    }
  }
  
  /**
   * Format conversation history as transcript
   */
  private formatTranscript(history: ConversationContext['conversationHistory']): string {
    return history
      .filter(msg => msg.role !== 'system')
      .map(msg => `${msg.role === 'user' ? 'Customer' : 'AI Assistant'}: ${msg.content}`)
      .join('\n\n')
  }
}