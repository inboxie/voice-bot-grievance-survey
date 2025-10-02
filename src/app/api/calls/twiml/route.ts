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
    let services: string[] = []
    
    if (callId && campaignId) {
      try {
        const call = await db.getCallById(callId)
        
        if (call) {
          customerName = call.customerName
          services = call.services || []
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
      console.log('Generating opening TwiML for:', customerName, 'Services:', services)
      const openingTwiML = generateOpeningTwiML(customerName, services, callId || '', campaignId || '')
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
        customerName
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
function generateOpeningTwiML(customerName: string, services: string[], callId: string, campaignId: string): string {
  const bankName = process.env.BANK_NAME || 'Your Bank'
  const botName = process.env.BOT_NAME || 'Customer Care Assistant'
  
  // Determine service context and question based on selected services
  let serviceContext = 'your experience with us'
  let question = 'Could you share your thoughts about your recent experience?'
  
  // Check the first service in the array (primary service)
  if (services && services.length > 0) {
    const primaryService = services[0].toLowerCase()
    
    if (primaryService.includes('credit card') || primaryService === 'credit card') {
      serviceContext = 'your credit card experience'
      question = 'Could you share what has been on your mind regarding your credit card?'
    } else if (primaryService.includes('personal banking') || primaryService === 'personal banking') {
      serviceContext = 'your personal banking experience'
      question = 'Could you tell me about your recent banking experience?'
    } else if (primaryService.includes('loan') || primaryService === 'loans') {
      serviceContext = 'your loan experience'
      question = 'Could you share your thoughts about your loan experience?'
    } else if (primaryService.includes('mortgage') || primaryService === 'mortgage') {
      serviceContext = 'your mortgage experience'
      question = 'Could you tell me about your mortgage experience with us?'
    } else if (primaryService.includes('business') || primaryService === 'business banking') {
      serviceContext = 'your business banking experience'
      question = 'Could you share your thoughts about our business banking services?'
    } else if (primaryService.includes('investment') || primaryService === 'investment services') {
      serviceContext = 'your investment experience'
      question = 'Could you tell me about your experience with our investment services?'
    } else if (primaryService.includes('mobile') || primaryService.includes('online') || primaryService === 'mobile & online banking') {
      serviceContext = 'your digital banking experience'
      question = 'Could you share your thoughts about our mobile or online banking?'
    } else if (primaryService.includes('customer service') || primaryService === 'customer service') {
      serviceContext = 'your customer service experience'
      question = 'Could you tell me about your recent experience with our customer service?'
    }
  }
  
  const openingMessage = `Hello ${customerName}, this is ${botName} from ${bankName}. I'm calling about ${serviceContext}. ${question}`
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">${openingMessage}</Say>
    <Pause length="1"/>
    <Gather 
        input="speech" 
        timeout="30"
        speechTimeout="auto"
        language="en-US"
        action="https://voice-bot-grievance-survey.vercel.app/api/calls/twiml?callId=${callId}&amp;campaignId=${campaignId}"
        method="POST">
    </Gather>
    
    <Say voice="Polly.Joanna-Neural" language="en-US">
        I didn't hear a response. Thank you for your time.
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
  customerName: string
): Promise<string> {
  try {
    // Use CallOrchestrator to process the response with OpenAI
    const orchestrator = new CallOrchestrator()
    const aiResponse = await orchestrator.handleCustomerInput(callId, speechResult)
    
    // Check if this response indicates the call should end
    const shouldEndCall = checkIfShouldEndCall(speechResult, aiResponse)
    
    if (shouldEndCall) {
      // End call immediately with ONLY the AI response and hangup - NO Gather
      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">${aiResponse.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Say>
    <Hangup />
</Response>`
    }
    
    // Continue conversation
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Joanna-Neural" language="en-US">${aiResponse.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Say>
    <Pause length="1"/>
    <Gather 
        input="speech" 
        timeout="30"
        speechTimeout="auto"
        language="en-US"
        action="https://voice-bot-grievance-survey.vercel.app/api/calls/twiml?callId=${callId}&amp;campaignId=${campaignId}"
        method="POST">
    </Gather>
    
    <Say voice="Polly.Joanna-Neural" language="en-US">
        Thank you for sharing your feedback, ${customerName}. Have a wonderful day.
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
  
  // AI ending phrases - expanded to catch all closing message variations
  const aiEndIndicators = [
    'thank you for your time',
    'have a wonderful day',
    'appreciate your feedback',
    'incredibly valuable',
    'pass on the feedback',
    'pass along',
    'passed along',
    'will be passed',
    'thank you so much for taking the time',
    'thank you for taking the time',
    'we value your feedback',
    'your feedback is valuable',
    'your insights are',
    'appreciate you sharing'
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