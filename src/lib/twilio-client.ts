import twilio from 'twilio'
import { Call, CallStatus } from '@/types/call'

export class TwilioClient {
  private client: twilio.Twilio
  private fromNumber: string
  private webhookUrl: string
  
  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const phoneNumber = process.env.TWILIO_PHONE_NUMBER
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    
    if (!accountSid || !authToken || !phoneNumber || !appUrl) {
      throw new Error('Missing required Twilio environment variables')
    }
    
    this.client = twilio(accountSid, authToken)
    this.fromNumber = phoneNumber
    this.webhookUrl = `${appUrl}/api/calls/webhook`
  }
  
  /**
   * Initiate a voice call with AI bot
   */
  async makeCall(call: Call): Promise<{ success: boolean; twilioSid?: string; error?: string }> {
    try {
      // Create TwiML for the call
      const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/twiml?callId=${call.id}&campaignId=${call.campaignId}`
      
      const twilioCall = await this.client.calls.create({
        to: call.customerPhone,
        from: this.fromNumber,
        url: twimlUrl,
        method: 'POST',
        statusCallback: this.webhookUrl,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        timeout: 30, // Ring for 30 seconds
        record: true, // Record the call for transcription
        // Custom parameters to track our call
        machineDetection: 'Enable',
        machineDetectionTimeout: 5,
        // Add custom parameters
        sendDigits: undefined // We'll handle this in TwiML
      })
      
      return {
        success: true,
        twilioSid: twilioCall.sid
      }
      
    } catch (error) {
      console.error('Twilio call failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Twilio error'
      }
    }
  }
  
  /**
   * Generate TwiML for AI-powered conversation
   */
  generateTwiML(callId: string, campaignId: string, customerName: string, reason: string): string {
    const bankName = process.env.BANK_NAME || 'Your Bank'
    const botName = process.env.BOT_NAME || 'Customer Care Assistant'
    
    // Create opening script based on customer data
    const openingMessage = this.generateOpeningScript(customerName, reason, bankName, botName)
    
    // TwiML for AI conversation using Twilio's Voice Intelligence or connect to external AI
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">${openingMessage}</Say>
    
    <!-- Start conversation with AI -->
    <Connect>
        <Stream url="wss://${process.env.NEXT_PUBLIC_APP_URL?.replace('http://', '').replace('https://', '')}/api/calls/stream">
            <Parameter name="callId" value="${callId}" />
            <Parameter name="campaignId" value="${campaignId}" />
            <Parameter name="customerName" value="${customerName}" />
            <Parameter name="reason" value="${reason}" />
        </Stream>
    </Connect>
    
    <!-- Fallback if stream fails -->
    <Say voice="alice" language="en-US">
        I apologize, but we're experiencing technical difficulties. 
        Please call our customer service line directly, and we'll be happy to help you. 
        Thank you for your time.
    </Say>
    
    <Hangup />
</Response>`
    
    return twiml
  }
  
  /**
   * Generate opening script based on customer data
   */
  private generateOpeningScript(customerName: string, reason: string, bankName: string, botName: string): string {
    // Analyze reason to customize opening
    const lowerReason = reason.toLowerCase()
    
    let contextualMessage = ''
    
    if (lowerReason.includes('credit card') || lowerReason.includes('card')) {
      contextualMessage = 'regarding your recent credit card account closure'
    } else if (lowerReason.includes('account') || lowerReason.includes('banking')) {
      contextualMessage = 'regarding your recent account changes'
    } else if (lowerReason.includes('loan') || lowerReason.includes('mortgage')) {
      contextualMessage = 'regarding your lending experience with us'
    } else if (lowerReason.includes('service') || lowerReason.includes('staff')) {
      contextualMessage = 'regarding your recent service experience'
    } else {
      contextualMessage = 'regarding your recent experience with our bank'
    }
    
    return `Hello ${customerName}, this is ${botName} calling from ${bankName}. 
    I hope I'm reaching you at a good time. 
    I'm calling ${contextualMessage}. 
    We truly value your feedback and would love to understand your experience better 
    so we can improve our services. 
    Do you have a few minutes to share your thoughts with me?`
  }
  
  /**
   * Handle machine detection response
   */
  generateMachineDetectionTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">
        Hello, this is a call from ${process.env.BANK_NAME || 'your bank'} regarding your recent feedback. 
        We'd love to speak with you personally about your experience. 
        Please call us back at your convenience. Thank you.
    </Say>
    <Hangup />
</Response>`
  }
  
  /**
   * Get call details from Twilio
   */
  async getCallDetails(twilioSid: string): Promise<any> {
    try {
      const call = await this.client.calls(twilioSid).fetch()
      return {
        status: this.mapTwilioStatus(call.status),
        duration: call.duration ? parseInt(call.duration) : null,
        startTime: call.startTime,
        endTime: call.endTime,
        price: call.price,
        priceUnit: call.priceUnit
      }
    } catch (error) {
      console.error('Failed to fetch call details:', error)
      return null
    }
  }
  
  /**
   * Get call recording URL
   */
  async getCallRecording(twilioSid: string): Promise<string | null> {
    try {
      const recordings = await this.client.recordings.list({
        callSid: twilioSid,
        limit: 1
      })
      
      if (recordings.length > 0) {
        return `https://api.twilio.com${recordings[0].uri.replace('.json', '.mp3')}`
      }
      
      return null
    } catch (error) {
      console.error('Failed to fetch recording:', error)
      return null
    }
  }
  
  /**
   * Get call transcription
   */
  async getCallTranscription(twilioSid: string): Promise<string | null> {
    try {
      const transcriptions = await this.client.transcriptions.list({
        limit: 10
      })
      
      // Find transcription for this call
      const transcription = transcriptions.find(t => 
        t.recordingSid && t.recordingSid.includes(twilioSid.substring(2))
      )
      
      return transcription ? transcription.transcriptionText : null
    } catch (error) {
      console.error('Failed to fetch transcription:', error)
      return null
    }
  }
  
  /**
   * Cancel/hangup an active call
   */
  async cancelCall(twilioSid: string): Promise<boolean> {
    try {
      await this.client.calls(twilioSid).update({ status: 'completed' })
      return true
    } catch (error) {
      console.error('Failed to cancel call:', error)
      return false
    }
  }
  
  /**
   * Map Twilio call status to our internal status
   */
  private mapTwilioStatus(twilioStatus: string): CallStatus {
    switch (twilioStatus) {
      case 'queued':
        return 'pending'
      case 'ringing':
        return 'ringing'
      case 'in-progress':
        return 'answered'
      case 'completed':
        return 'completed'
      case 'busy':
        return 'failed'
      case 'no-answer':
        return 'failed'
      case 'failed':
        return 'failed'
      case 'canceled':
        return 'cancelled'
      default:
        return 'pending'
    }
  }
  
  /**
   * Validate phone number with Twilio Lookup
   */
  async validatePhoneNumber(phoneNumber: string): Promise<{ valid: boolean; formatted?: string; carrier?: string }> {
    try {
      const lookup = await this.client.lookups.v2.phoneNumbers(phoneNumber).fetch()
      
      return {
        valid: lookup.valid || false,
        formatted: lookup.phoneNumber,
        carrier: undefined // Carrier info requires additional API calls in v2
      }
    } catch (error) {
      return { valid: false }
    }
  }
  
  /**
   * Get account balance and usage
   */
  async getAccountInfo(): Promise<{ balance: string; currency: string } | null> {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      if (!accountSid) {
        console.error('TWILIO_ACCOUNT_SID not found')
        return null
      }
      
      const account = await this.client.api.accounts(accountSid).fetch()
      return {
        balance: account.balance,
        currency: account.currency || 'USD'
      }
    } catch (error) {
      console.error('Failed to fetch account info:', error)
      return null
    }
  }
  
  /**
   * Format phone number for Twilio
   */
  static formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '')
    
    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      // Assume Saudi Arabia if no country code
      if (cleaned.length === 9 && cleaned.startsWith('5')) {
        cleaned = '+966' + cleaned
      } else if (cleaned.length === 10 && cleaned.startsWith('05')) {
        cleaned = '+966' + cleaned.substring(1)
      } else if (cleaned.startsWith('966')) {
        cleaned = '+' + cleaned
      } else {
        cleaned = '+' + cleaned
      }
    }
    
    return cleaned
  }
}