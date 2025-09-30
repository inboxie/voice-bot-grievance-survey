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
    
    console.log('TwiML request:', {
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
    
    if (callId) {
      const calls = await db.getCallsByCampaign(campaignId || '')
      const call = calls.find(c => c.id === callId)
      
      if (call) {
        const customer = await db.getCustomerById(call.customerId)
        if (customer) {
          customerName = customer.name
          customerReason = customer.reason || ''
        }
      }
    }
    
    // Handle different stages of the conversation
    if (!speechResult && !digits) {
      // Initial call - generate opening message
      const openingTwiML = generateOpeningTwiML(customerName, customerReason)
      return new NextResponse(openingTwiML, {
        headers: { 'Content-Type': 'application/xml' }
      })
    }
    
    // Handle customer response
    if (speechResult && callId) {
      const conversationTwiML = await handleCustomerResponse(
        callId, 
        speechResult, 
        customerName,
        customerReason
      )
      
      return new NextResponse(conversationTwiML, {
        headers: { 'Content-Type': 'application/xml' }
      })
    }
    
    // Handle DTMF digits (if customer presses keys)
    if (digits) {
      const dtmfTwiML = handleDTMFResponse(digits, customerName)
      return new NextResponse(dtmfTwiML, {
        headers: { 'Content-Type': 'application/xml' }
      })
    }
    
    // Fallback TwiML
    const fallbackTwiML = generateFallbackTwiML()
    return new NextResponse(fallbackTwiML, {
      headers: { 'Content-Type': 'application/xml' }
    })
    
  } catch (error) {
    console.error('TwiML generation error:', error)
    
    const errorTwiML = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">
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
function generateOpeningTwiML(customerName: string, customerReason: string): string {
  const bankName = process.env.BANK_NAME || 'Your Bank'
  const botName = process.env.BOT_NAME || 'Customer Care Assistant'
  
  // Generate opening based on whether we have a reason or not
  let openingMessage: string
  
  if (customerReason && customerReason.trim()) {
    // We have a reason - customize based on it
    let contextualMessage = 'regarding your recent experience with our bank'
    const lowerReason = customerReason.toLowerCase()
    
    if (lowerReason.includes('credit card') || lowerReason.includes('card')) {
      contextualMessage = 'regarding your recent credit card experience'
    } else if (lowerReason.includes('account') || lowerReason.includes('banking')) {
      contextualMessage = 'regarding your account experience with us'
    } else if (lowerReason.includes('loan') || lowerReason.includes('mortgage')) {
      contextualMessage = 'regarding your lending experience'
    } else if (lowerReason.includes('service') || lowerReason.includes('staff')) {
      contextualMessage = 'regarding your service experience'
    }
    
    openingMessage = `Hello ${customerName}, this is ${botName} calling from ${bankName}. 
      I hope I'm reaching you at a good time. I'm calling ${contextualMessage}. 
      We truly value your feedback and would love to understand your experience better 
      so we can improve our services. Do you have a few minutes to share your thoughts with me?`
  } else {
    // No reason provided - general outreach
    openingMessage = `Hello ${customerName}, this is ${botName} calling from ${bankName}. 
      I hope I'm reaching you at a good time. We noticed you recently made some changes to your account with us, 
      and we truly value your feedback. We'd love to understand your experience and hear your thoughts 
      so we can continue to improve our services. Do you have a few minutes to chat with me?`
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">${openingMessage}</Say>
    
    <!-- Listen for customer response -->
    <Gather 
        input="speech" 
        timeout="10" 
        speechTimeout="3"
        language="en-US"
        hints="yes,no,sure,okay,not now,busy,call later"
        action="/api/calls/twiml"
        method="POST">
        <Say voice="alice" language="en-US">Please go ahead and share your thoughts.</Say>
    </Gather>
    
    <!-- If no response, try again -->
    <Say voice="alice" language="en-US">
        I didn't hear a response. If now isn't a good time, I completely understand. 
        Please feel free to call us back when it's more convenient. Thank you.
    </Say>
    <Hangup />
</Response>`
}

/**
 * Handle customer speech response using AI
 */
async function handleCustomerResponse(
  callId: string, 
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
    <Say voice="alice" language="en-US">${aiResponse}</Say>
    
    <!-- Continue listening -->
    <Gather 
        input="speech" 
        timeout="15" 
        speechTimeout="3"
        language="en-US"
        action="/api/calls/twiml"
        method="POST">
        <Say voice="alice" language="en-US">Please continue.</Say>
    </Gather>
    
    <!-- Handle silence -->
    <Say voice="alice" language="en-US">
        Thank you so much for sharing your feedback with me today, ${customerName}. 
        Your input is incredibly valuable to us. Have a wonderful day.
    </Say>
    <Hangup />
</Response>`
    
  } catch (error) {
    console.error('Error handling customer response:', error)
    
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">
        I understand completely. Thank you for taking the time to speak with me, ${customerName}. 
        Your feedback is very important to us.
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
    <Say voice="alice" language="en-US">
        Great! I'd love to hear about your experience. Please tell me what happened.
    </Say>
    <Gather 
        input="speech" 
        timeout="30" 
        speechTimeout="3"
        language="en-US"
        action="/api/calls/twiml"
        method="POST">
    </Gather>
    <Hangup />
</Response>`
    
    case '2':
    case '9':
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">
        I completely understand, ${customerName}. Thank you for your time. 
        Please feel free to call us back when it's more convenient.
    </Say>
    <Hangup />
</Response>`
    
    default:
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">
        I'm sorry, I didn't understand that selection. 
        If you'd like to continue, just start speaking. Otherwise, I'll end the call.
    </Say>
    <Gather 
        input="speech" 
        timeout="10" 
        speechTimeout="2"
        language="en-US"
        action="/api/calls/twiml"
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
         speechResult.trim().length < 10 // Very short responses might indicate disinterest
}

/**
 * Generate closing TwiML
 */
function generateClosingTwiML(message: string, customerName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="alice" language="en-US">${message}</Say>
    <Say voice="alice" language="en-US">
        Have a wonderful day, ${customerName}, and thank you again for your valuable feedback.
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
    <Say voice="alice" language="en-US">
        Thank you for your time today. If you'd like to share feedback about your banking experience, 
        please feel free to call our customer service line directly. Have a great day.
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
    <Say voice="alice" language="en-US">
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