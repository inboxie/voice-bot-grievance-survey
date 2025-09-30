import { NextRequest, NextResponse } from 'next/server'
import { CallOrchestrator } from '@/lib/call-orchestrator'
import { TwilioWebhookPayload } from '@/types/api'

/**
 * Twilio webhook handler for call status updates
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body
    const body = await request.text()
    const contentType = request.headers.get('content-type')
    
    console.log('Twilio webhook received')
    
    // Parse form data from Twilio
    let webhookData: TwilioWebhookPayload
    
    if (contentType?.includes('application/x-www-form-urlencoded')) {
      const formData = new URLSearchParams(body)
      webhookData = parseFormData(formData)
    } else {
      // Fallback to JSON parsing
      webhookData = JSON.parse(body)
    }
    
    // Log webhook for debugging
    console.log('Twilio webhook data:', {
      CallSid: webhookData.CallSid,
      CallStatus: webhookData.CallStatus,
      From: webhookData.From,
      To: webhookData.To,
      Duration: webhookData.Duration,
      Direction: webhookData.Direction
    })
    
    // Validate required fields
    if (!webhookData.CallSid || !webhookData.CallStatus) {
      return NextResponse.json({
        error: 'Missing required webhook data'
      }, { status: 400 })
    }
    
    // Handle the webhook using CallOrchestrator
    const orchestrator = new CallOrchestrator()
    await orchestrator.handleTwilioWebhook(webhookData)
    
    // Handle specific call events
    await handleSpecificCallEvents(webhookData)
    
    // Return TwiML response based on call status
    const twimlResponse = generateTwiMLResponse(webhookData)
    
    return new NextResponse(twimlResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml'
      }
    })
    
  } catch (error) {
    console.error('Webhook handler error:', error)
    
    // Return empty TwiML response on error
    const errorTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`
    
    return new NextResponse(errorTwiML, {
      status: 200, // Always return 200 to Twilio to prevent retries
      headers: {
        'Content-Type': 'application/xml'
      }
    })
  }
}

/**
 * Parse form data from Twilio webhook
 */
function parseFormData(formData: URLSearchParams): TwilioWebhookPayload {
  return {
    AccountSid: formData.get('AccountSid') || '',
    CallSid: formData.get('CallSid') || '',
    CallStatus: formData.get('CallStatus') as any || 'completed',
    From: formData.get('From') || '',
    To: formData.get('To') || '',
    Direction: formData.get('Direction') as 'inbound' | 'outbound' || 'outbound',
    Duration: formData.get('Duration') || undefined,
    CallDuration: formData.get('CallDuration') || undefined,
    RecordingUrl: formData.get('RecordingUrl') || undefined,
    RecordingSid: formData.get('RecordingSid') || undefined,
    TranscriptionText: formData.get('TranscriptionText') || undefined,
    TranscriptionStatus: formData.get('TranscriptionStatus') || undefined,
    campaignId: formData.get('campaignId') || undefined,
    customerId: formData.get('customerId') || undefined
  }
}

/**
 * Handle specific call events
 */
async function handleSpecificCallEvents(webhookData: TwilioWebhookPayload): Promise<void> {
  const { CallSid, CallStatus, TranscriptionText, RecordingUrl } = webhookData
  
  try {
    // Handle completed calls with recordings
    if (CallStatus === 'completed' && (RecordingUrl || TranscriptionText)) {
      console.log(`Call ${CallSid} completed with recording/transcription`)
      
      if (TranscriptionText) {
        console.log('Twilio transcription:', TranscriptionText.substring(0, 200) + '...')
      }
      
      if (RecordingUrl) {
        console.log('Recording available:', RecordingUrl)
      }
    }
    
    // Handle failed calls
    if (['failed', 'busy', 'no-answer', 'canceled'].includes(CallStatus)) {
      console.log(`Call ${CallSid} failed with status: ${CallStatus}`)
    }
    
    // Handle answered calls
    if (CallStatus === 'in-progress') {
      console.log(`Call ${CallSid} was answered`)
    }
    
  } catch (error) {
    console.error('Error handling specific call events:', error)
  }
}

/**
 * Generate TwiML response based on call status
 */
function generateTwiMLResponse(webhookData: TwilioWebhookPayload): string {
  // For status callbacks, return empty response
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
}

/**
 * Handle machine detection webhook
 */
async function handleMachineDetection(request: NextRequest) {
  try {
    const body = await request.text()
    const formData = new URLSearchParams(body)
    
    const answeredBy = formData.get('AnsweredBy') // 'human' or 'machine'
    const callSid = formData.get('CallSid')
    
    console.log(`Machine detection result for ${callSid}: ${answeredBy}`)
    
    if (answeredBy === 'machine') {
      // Handle voicemail
      const voicemailTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">
        Hello, this is a message from ${process.env.BANK_NAME || 'your bank'} 
        regarding your recent feedback. We would love to speak with you personally 
        about your banking experience. Please call us back at your convenience 
        at your earliest opportunity. Thank you for your time.
    </Say>
    <Hangup />
</Response>`
      
      return new NextResponse(voicemailTwiML, {
        headers: { 'Content-Type': 'application/xml' }
      })
    } else {
      // Continue with human conversation
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'application/xml' }
      })
    }
    
  } catch (error) {
    console.error('Machine detection error:', error)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'application/xml' }
    })
  }
}

// Handle GET requests (for webhook verification)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge')
  
  if (challenge) {
    return NextResponse.json({ challenge })
  }
  
  return NextResponse.json({
    message: 'Twilio webhook endpoint',
    timestamp: new Date().toISOString(),
    status: 'active'
  })
}

// Reject other methods
export async function PUT() {
  return NextResponse.json({
    error: 'Method not allowed'
  }, { status: 405 })
}

export async function DELETE() {
  return NextResponse.json({
    error: 'Method not allowed'
  }, { status: 405 })
}