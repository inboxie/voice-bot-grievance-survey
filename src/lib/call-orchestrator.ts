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
  
  constructor() {
    this.db = Database.getInstance()
    this.twilioClient = new TwilioClient()
    this.openaiClient = new OpenAIClient()
  }
  
  async startCampaign(config: CampaignConfig): Promise<{ campaignId: string; callsScheduled: number }> {
    await this.db.connect()
    
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
    await this.db.insertCustomers(config.customers)
    
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
    
    for (const call of calls) {
      await this.db.insertCall(call)
    }
    
    this.processCampaignCalls(campaign.id)
    
    return {
      campaignId: campaign.id,
      callsScheduled: calls.length
    }
  }
  
  private async processCampaignCalls(campaignId: string): Promise<void> {
    const campaign = await this.db.getCampaignById(campaignId)
    if (!campaign || campaign.status !== 'running') return
    
    const pendingCalls = await this.db.getCallsByStatus('pending')
    const campaignCalls = pendingCalls.filter(call => call.campaignId === campaignId)
    
    const concurrentLimit = campaign.maxConcurrentCalls
    let activeCount = 0
    
    for (const call of campaignCalls) {
      if (activeCount >= concurrentLimit) {
        setTimeout(() => {
          this.processCampaignCalls(campaignId)
        }, 10000)
        break
      }
      
      activeCount++
      this.processIndividualCall(call)
        .finally(() => {
          activeCount--
          setTimeout(() => {
            this.processCampaignCalls(campaignId)
          }, 2000)
        })
    }
  }
  
  private async processIndividualCall(call: Call): Promise<void> {
    try {
      await this.db.updateCallStatus(call.id, 'calling', {
        startedAt: new Date()
      })
      
      const customer = await this.db.getCustomerById(call.customerId)
      if (!customer) {
        await this.db.updateCallStatus(call.id, 'failed', {
          errorMessage: 'Customer data not found'
        })
        return
      }
      
      const formattedPhone = TwilioClient.formatPhoneNumber(call.customerPhone)
      
      // Create conversation context
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
      
      // Save context to database
      await this.db.insertConversation(context)
      console.log(`[processIndividualCall] Saved conversation context for callId: ${call.id}`)
      
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
        await this.db.deleteConversation(call.id)
      }
      
    } catch (error) {
      console.error(`Failed to process call ${call.id}:`, error)
      await this.db.updateCallStatus(call.id, 'failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
  
  async handleTwilioWebhook(payload: any): Promise<void> {
    const { CallSid, CallStatus, Duration } = payload
    
    const calls = await this.db.getCallsByStatus('ringing')
    const activeCalls = await this.db.getCallsByStatus('answered')
    const allCalls = [...calls, ...activeCalls]
    
    const call = allCalls.find(c => c.twilioSid === CallSid)
    if (!call) {
      console.log('Call not found for Twilio SID:', CallSid)
      return
    }
    
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
    
    if (newStatus === 'completed') {
      await this.handleCallCompletion(call.id)
    } else if (newStatus === 'failed') {
      await this.handleCallFailure(call.id)
    }
  }
  
  private async handleCallCompletion(callId: string): Promise<void> {
    try {
      // Load context from database
      const context = await this.db.getConversationByCallId(callId)
      if (!context) {
        console.log(`[handleCallCompletion] No conversation found for callId: ${callId}`)
        return
      }
      
      const summary = await this.openaiClient.generateCallSummary(context)
      
      await this.db.updateCallStatus(callId, 'completed', {
        transcript: this.formatTranscript(context.conversationHistory),
        summary: summary.summary,
        sentiment: summary.sentiment,
        keyIssues: summary.keyIssues
      })
      
      const call = await this.db.getCallById(callId)
      
      if (call?.twilioSid) {
        const recordingUrl = await this.twilioClient.getCallRecording(call.twilioSid)
        console.log('Recording URL:', recordingUrl)
        
        const twilioTranscription = await this.twilioClient.getCallTranscription(call.twilioSid)
        if (twilioTranscription) {
          console.log('Twilio transcription:', twilioTranscription)
        }
      }
      
      // Clean up conversation from database
      await this.db.deleteConversation(callId)
      console.log(`[handleCallCompletion] Deleted conversation for callId: ${callId}`)
      
    } catch (error) {
      console.error('Error handling call completion:', error)
    }
  }
  
  private async handleCallFailure(callId: string): Promise<void> {
    const call = await this.db.getCallById(callId)
    
    if (!call) return
    
    const campaign = await this.db.getCampaignById(call.campaignId)
    if (!campaign) return
    
    if (call.retryCount < call.maxRetries) {
      const shouldRetry = this.shouldRetryCall(call.errorMessage || '', campaign.retrySettings)
      
      if (shouldRetry) {
        const retryDelay = campaign.retrySettings.retryDelay * 60 * 1000
        
        setTimeout(async () => {
          await this.db.updateCallStatus(callId, 'pending')
        }, retryDelay)
        
        console.log(`Scheduling retry for call ${callId} in ${campaign.retrySettings.retryDelay} minutes`)
      }
    }
    
    // Clean up conversation
    await this.db.deleteConversation(callId)
  }
  
  private shouldRetryCall(errorMessage: string, retrySettings: any): boolean {
    const error = errorMessage.toLowerCase()
    
    if (error.includes('busy') && retrySettings.retryOnBusy) return true
    if (error.includes('no-answer') && retrySettings.retryOnNoAnswer) return true
    if (error.includes('failed') && retrySettings.retryOnFailed) return true
    
    return false
  }
  
  /**
   * Handle incoming audio stream from customer - WITH FORCED 3-RESPONSE LIMIT
   */
  async handleCustomerInput(callId: string, audioInput: string): Promise<string> {
    console.log(`[handleCustomerInput] START - callId: ${callId}`)
    console.log(`[handleCustomerInput] audioInput: ${audioInput.substring(0, 200)}`)
    
    try {
      // Try to load context from database
      let context = await this.db.getConversationByCallId(callId)
      
      // If NOT found, create it on-demand from call data
      if (!context) {
        console.log(`[handleCustomerInput] No conversation found in DB, creating on-demand for callId: ${callId}`)
        
        // Fetch call and customer data
        const call = await this.db.getCallById(callId)
        if (!call) {
          console.error(`[handleCustomerInput] Call not found in DB for callId: ${callId}`)
          return "I'm sorry, there seems to be a technical issue. Could you please repeat that?"
        }
        
        const customer = await this.db.getCustomerById(call.customerId)
        if (!customer) {
          console.error(`[handleCustomerInput] Customer not found for callId: ${callId}`)
          return "I'm sorry, there seems to be a technical issue. Could you please repeat that?"
        }
        
        // Create new context on-demand
        context = {
          callId: call.id,
          campaignId: call.campaignId,
          customerName: customer.name,
          customerReason: customer.reason || '',
          services: call.services,
          bankName: process.env.BANK_NAME || 'Your Bank',
          botName: process.env.BOT_NAME || 'Customer Care Assistant',
          conversationHistory: []
        }
        
        // Save it to database for future requests
        await this.db.insertConversation(context)
        console.log(`[handleCustomerInput] Created and saved new conversation context for ${customer.name}`)
      }
      
      console.log(`[handleCustomerInput] Context loaded for ${context.customerName}`)
      
      // Count customer responses BEFORE calling OpenAI
      const customerResponseCount = context.conversationHistory.filter(msg => msg.role === 'user').length
      console.log(`[handleCustomerInput] Customer has responded ${customerResponseCount} times`)
      
      // Force end call after 3 customer responses
      if (customerResponseCount >= 3) {
        console.log('[handleCustomerInput] Forcing call end - 3 responses reached')
        const closingMessage = this.openaiClient.generateClosingMessage(context, 'Call completed after 3 exchanges')
        
        // Save the closing message to history
        context.conversationHistory.push({
          role: 'assistant',
          content: closingMessage,
          timestamp: new Date()
        })
        
        await this.db.updateConversationHistory(callId, context.conversationHistory)
        
        setTimeout(async () => {
          await this.handleCallCompletion(callId)
        }, 5000)
        
        return closingMessage
      }
      
      console.log('[handleCustomerInput] Calling OpenAI generateResponse...')
      
      const startTime = Date.now()
      const aiResponse = await this.openaiClient.generateResponse(audioInput, context)
      const duration = Date.now() - startTime
      
      console.log(`[handleCustomerInput] OpenAI responded in ${duration}ms`)
      console.log(`[handleCustomerInput] AI message: ${aiResponse.message.substring(0, 200)}`)
      console.log(`[handleCustomerInput] shouldEndCall: ${aiResponse.shouldEndCall}`)
      
      // Save updated conversation history to database
      await this.db.updateConversationHistory(callId, context.conversationHistory)
      console.log(`[handleCustomerInput] Saved conversation history to DB`)
      
      if (aiResponse.shouldEndCall) {
        console.log('[handleCustomerInput] Ending call per OpenAI decision...')
        const closingMessage = this.openaiClient.generateClosingMessage(context, aiResponse.summary)
        
        setTimeout(async () => {
          await this.handleCallCompletion(callId)
        }, 5000)
        
        return closingMessage
      }
      
      const optimizedResponse = this.openaiClient.optimizeForSpeech(aiResponse.message)
      console.log(`[handleCustomerInput] Returning response: ${optimizedResponse.substring(0, 200)}`)
      
      return optimizedResponse
      
    } catch (error) {
      console.error('[handleCustomerInput] ERROR:', error)
      console.error('[handleCustomerInput] Error stack:', error instanceof Error ? error.stack : 'No stack')
      return "I apologize for the technical difficulty. Could you please continue with what you were saying?"
    }
  }
  
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
  
  async cancelCampaign(campaignId: string): Promise<void> {
    await this.db.updateCampaignStatus(campaignId, 'cancelled')
    
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
  
  private formatTranscript(history: ConversationContext['conversationHistory']): string {
    return history
      .filter(msg => msg.role !== 'system')
      .map(msg => `${msg.role === 'user' ? 'Customer' : 'AI Assistant'}: ${msg.content}`)
      .join('\n\n')
  }
}