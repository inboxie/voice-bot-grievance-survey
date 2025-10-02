import { NextRequest, NextResponse } from 'next/server'
import { CallOrchestrator } from '@/lib/call-orchestrator'
import Database from '@/lib/database'

/**
 * Generate TwiML for call conversation flow
 */
export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const callId = url.searchParams.get('callId')
    const campaignId = url.searchParams.get('campaignId')
    
    console.log('TwiML request received:', { callId, campaignId })
    
    // Parse form data from Twilio
    const body = await request.text()
    const formData = new URLSearchParams(body)
    
    const callSid = formData.get('CallSid')
    const callStatus = formData.get('CallStatus')
    const from = formData.get('From')
    const to = formData.get('To')
    const digits = formData.get('Digits')
    const speechResult = formData.get('SpeechResult')
    const confidence = formData.get('Confidence')
    
    console.log('TwiML parsed data:', {
      callId,
      campaignId,
      callSid,
      callStatus,
      from,
      to,
      digits,
      speechResult: speechResult?.substring(0, 100),
      confidence
    })
    
    // Get call and customer information
    const db = Database.getInstance()
    await db.connect()
    
    let customerName = 'Valued Customer'
    let customerReason = ''
    
    if (callId && campaignId) {
      try {
        const call = await db.getCallById(callId)
        
        if (call) {
          customerName = call.customerName
          const customer = await db.getCustomerById(call.customerId)
          if (customer) {
            customerReason = customer.reason || ''
          }
        } else {
          console.log(`Call not found for callId: ${callId}`)
        }
      } catch (error) {
        console.error('Error fetching call data:', error)
      }
    }
    
    // Handle different stages of the conversation
    if (!speechResult && !digits) {
      // Initial call - generate opening message
      console.log('Generating opening TwiML for:', customerName)
      const openingTwiML = generateOpeningTwiML(customerName, customerReason, callId || '', campaignId || '')
      return new NextResponse(openingTwiML, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }
    
    // Handle customer response
    if (speechResult && callId) {
      console.log('Handling customer response:', speechResult.substring(0, 100))
      const conversationTwiML = await handleCustomerResponse(
        callId,
        campaignId || '',
        speechResult, 
        customerName,
        customerReason
      )
      
      return new NextResponse(conversationTwiML, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }
    
    // Handle DTMF digits (if customer presses keys)
    if (digits) {
      console.log('Handling DTMF digits:', digits)
      const dtmfTwiML = handleDTMFResponse(digits, customerName)
      return new NextResponse(dtmfTwiML, {
        headers: { 'Content-Type': 'application/xml' }
      })
    }
    
    // Fallback TwiML
    console.log('Using fallback TwiML')
    const fallbackTwiML = generateFallbackTwiML()
    return new NextResponse(fallbackTwiML, {
      headers: { 'Content-Type': 'application/xml' }
    })
    
  } catch (error) {
    console.error('TwiML generation error:', error)
    
    const errorTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        I apologize, but we're experiencing technical difficulties. 
        Thank you for your time, and please feel free to call our customer service line directly.
    </Say>
    <Hangup />
</Response>`
    
    return new NextResponse(errorTwiML, {
      headers: { 'Content-Type': 'application/xml' }
    })
  }
}

/**
 * Generate opening TwiML for the call
 */
function generateOpeningTwiML(customerName: string, customerReason: string, callId: string, campaignId: string): string {
  const bankName = process.env.BANK_NAME || 'Your Bank'
  const botName = process.env.BOT_NAME || 'Customer Care Assistant'
  
  // Generate concise opening based on reason
  let openingMessage: string
  
  if (customerReason && customerReason.trim()) {
    const lowerReason = customerReason.toLowerCase()
    let serviceContext = 'your recent experience with us'
    
    // Make it specific to the service
    if (lowerReason.includes('credit card') || lowerReason.includes('card')) {
      serviceContext = 'your credit card experience'
    } else if (lowerReason.includes('account') || lowerReason.includes('checking') || lowerReason.includes('savings')) {
      serviceContext = 'your account with us'
    } else if (lowerReason.includes('loan') || lowerReason.includes('mortgage')) {
      serviceContext = 'your loan experience'
    } else if (lowerReason.includes('investment') || lowerReason.includes('wealth')) {
      serviceContext = 'your investment experience'
    }
    
    openingMessage = `Hello ${customerName}, this is ${botName} from ${bankName}. I'm calling about ${serviceContext}. We'd love to understand your feedback. Do you have a moment to share your thoughts?`
  } else {
    // No reason - very brief
    openingMessage = `Hello ${customerName}, this is ${botName} from ${bankName}. We noticed you recently made changes to your account, and we'd love to hear your feedback. Do you have a moment?`
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">${openingMessage}</Say>
    
    <Gather 
        input="speech" 
        timeout="30"
        speechTimeout="auto"
        language="en-US"
        hints="yes,no,sure,okay,not now,busy,call later"
        action="https://voice-bot-grievance-survey.vercel.app/api/calls/twiml?callId=${callId}&amp;campaignId=${campaignId}"
        method="POST">
    </Gather>
    
    <Say voice="Polly.Joanna-Neural" language="en-US">
        I didn't hear a response. If now isn't a good time, feel free to call us back. Thank you.
    </Say>
    <Hangup />
</Response>`
}

/**
 * Handle customer speech response using AI
 */
async function handleCustomerResponse(
  callId: string,
  campaignId: string,
  speechResult: string, 
  customerName: string,
  customerReason: string
): Promise<string> {
  try {
    // Use CallOrchestrator to process the response with OpenAI
    const orchestrator = new CallOrchestrator()
    const aiResponse = await orchestrator.handleCustomerInput(callId, speechResult)
    
    // Check if this response indicates the call should end
    const shouldEndCall = checkIfShouldEndCall(speechResult, aiResponse)
    
    if (shouldEndCall) {
      return generateClosingTwiML(aiResponse, customerName)
    }
    
    // Continue conversation
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">${aiResponse.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Say>
    
    <Gather 
        input="speech" 
        timeout="30"
        speechTimeout="auto"
        language="en-US"
        action="https://voice-bot-grievance-survey.vercel.app/api/calls/twiml?callId=${callId}&amp;campaignId=${campaignId}"
        method="POST">
    </Gather>
    
    <Say voice="Polly.Joanna-Neural" language="en-US">
        Thank you so much for sharing your feedback, ${customerName}. Have a wonderful day.
    </Say>
    <Hangup />
</Response>`
    
  } catch (error) {
    console.error('Error handling customer response:', error)
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        Thank you for your time, ${customerName}. Your feedback is very important to us.
    </Say>
    <Hangup />
</Response>`
  }
}

/**
 * Handle DTMF key press responses
 */
function handleDTMFResponse(digits: string, customerName: string): string {
  switch (digits) {
    case '1':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        Great! I'd love to hear about your experience. Please tell me what happened.
    </Say>
    <Gather 
        input="speech" 
        timeout="30" 
        speechTimeout="auto"
        language="en-US"
        action="https://voice-bot-grievance-survey.vercel.app/api/calls/twiml"
        method="POST">
    </Gather>
    <Hangup />
</Response>`
    
    case '2':
    case '9':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        I completely understand, ${customerName}. Thank you for your time.
    </Say>
    <Hangup />
</Response>`
    
    default:
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        I'm sorry, I didn't understand that. If you'd like to continue, just start speaking.
    </Say>
    <Gather 
        input="speech" 
        timeout="30"
        speechTimeout="auto"
        language="en-US"
        action="https://voice-bot-grievance-survey.vercel.app/api/calls/twiml"
        method="POST">
    </Gather>
    <Hangup />
</Response>`
  }
}

/**
 * Check if call should end based on customer response
 */
function checkIfShouldEndCall(speechResult: string, aiResponse: string): boolean {
  const lowerSpeech = speechResult.toLowerCase()
  const lowerAI = aiResponse.toLowerCase()
  
  // End call indicators
  const endIndicators = [
    'not now', 'call later', 'busy', 'can\'t talk', 'not a good time',
    'thank you', 'that\'s all', 'nothing else', 'goodbye', 'bye',
    'have to go', 'gotta go', 'need to run'
  ]
  
  // AI ending phrases
  const aiEndIndicators = [
    'thank you for your time', 'have a wonderful day', 'appreciate your feedback'
  ]
  
  return endIndicators.some(indicator => lowerSpeech.includes(indicator)) ||
         aiEndIndicators.some(indicator => lowerAI.includes(indicator)) ||
         speechResult.trim().length < 10
}

/**
 * Generate closing TwiML
 */
function generateClosingTwiML(message: string, customerName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">${message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Say>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        Have a wonderful day, ${customerName}.
    </Say>
    <Hangup />
</Response>`
}

/**
 * Generate fallback TwiML for unexpected scenarios
 */
function generateFallbackTwiML(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        Thank you for your time. Have a great day.
    </Say>
    <Hangup />
</Response>`
}

/**
 * Handle GET requests (for testing)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const test = url.searchParams.get('test')
  
  if (test === 'true') {
    const testTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">
        This is a test of the TwiML endpoint. The system is working correctly.
    </Say>
    <Hangup />
</Response>`
    
    return new NextResponse(testTwiML, {
      headers: { 'Content-Type': 'application/xml' }
    })
  }
  
  return NextResponse.json({
    message: 'TwiML generation endpoint',
    usage: 'POST with Twilio call data to generate conversation TwiML',
    test: 'Add ?test=true to get test TwiML'
  })
}