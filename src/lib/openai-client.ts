import OpenAI from 'openai'

export interface ConversationContext {
  callId: string
  campaignId: string
  customerName: string
  customerReason: string
  services: string[]
  bankName: string
  botName: string
  conversationHistory: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
    timestamp: Date
  }>
}

export interface AIResponse {
  message: string
  sentiment: 'positive' | 'negative' | 'neutral'
  keyIssues: string[]
  shouldEndCall: boolean
  summary?: string
  resolution?: string
}

export class OpenAIClient {
  private client: OpenAI
  
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key is required')
    }
    
    this.client = new OpenAI({ apiKey })
  }
  
  /**
   * Generate AI response for voice conversation
   */
  async generateResponse(
    customerInput: string,
    context: ConversationContext
  ): Promise<AIResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt(context)
      
      // Add customer input to conversation history
      context.conversationHistory.push({
        role: 'user',
        content: customerInput,
        timestamp: new Date()
      })
      
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...context.conversationHistory.map(msg => ({
          role: msg.role as 'system' | 'user' | 'assistant',
          content: msg.content
        }))
      ]
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 300,
        presence_penalty: 0.3,
        frequency_penalty: 0.3
      })
      
      const aiMessage = completion.choices[0]?.message?.content || "I understand. Could you tell me more about that?"
      
      // Add AI response to conversation history
      context.conversationHistory.push({
        role: 'assistant',
        content: aiMessage,
        timestamp: new Date()
      })
      
      // Analyze the conversation
      const analysis = await this.analyzeConversation(context)
      
      return {
        message: aiMessage,
        sentiment: analysis.sentiment,
        keyIssues: analysis.keyIssues,
        shouldEndCall: analysis.shouldEndCall,
        summary: analysis.shouldEndCall ? analysis.summary : undefined,
        resolution: analysis.resolution
      }
      
    } catch (error) {
      console.error('OpenAI API error:', error)
      return {
        message: "I apologize, I'm having some technical difficulties. Could you please repeat what you just said?",
        sentiment: 'neutral',
        keyIssues: [],
        shouldEndCall: false
      }
    }
  }
  
  /**
   * Build system prompt for the AI assistant
   */
  private buildSystemPrompt(context: ConversationContext): string {
    const { customerName, customerReason, bankName, botName, services } = context
    
    let reasonContext = ''
    if (customerReason && customerReason.trim()) {
      reasonContext = `You are calling because: "${customerReason}".`
    } else {
      reasonContext = `You are calling because they recently made changes to their account (related to: ${services.join(', ')}). Your goal is to discover WHY they made these changes.`
    }
    
    // Count customer messages (excluding system messages)
    const customerMessageCount = context.conversationHistory.filter(msg => msg.role === 'user').length
    
    return `You are ${botName}, an empathetic and professional customer service AI from ${bankName}. You are conducting a voice call with ${customerName}. ${reasonContext}

CONVERSATION STATUS: Customer has responded ${customerMessageCount} time(s). You should ask a MAXIMUM of 2 follow-up questions, then wrap up the call.

Your primary goals:
1. Listen empathetically and make the customer feel heard
2. Understand their specific concerns and issues - discover the real reasons behind their actions
3. Gather detailed feedback about their experience
4. DO NOT try to solve problems or offer solutions - just listen and understand
5. Keep responses conversational and natural for voice interaction
6. Be concise - responses should be 1-3 sentences maximum
7. Ask follow-up questions to get deeper insights (MAX 2 follow-ups)
8. After 2 follow-up questions, thank them warmly and end the call

Services context: ${services.join(', ')}

CALL FLOW:
- First customer response: Acknowledge and ask 1 clarifying question
- Second customer response: Ask 1 more follow-up question if needed
- Third customer response: Thank them and wrap up the call - DO NOT ask more questions

CRITICAL GUARDRAILS:
- ONLY discuss topics related to: banking, customer service experience, account changes, financial services, and the reason for this call
- If asked about ANYTHING unrelated (recipes, general knowledge, personal advice, technical help, etc.), politely redirect: "I appreciate the question, but I'm here specifically to understand your experience with ${bankName}. Is there anything about your banking experience you'd like to share?"
- DO NOT provide information, advice, or answers on topics outside of banking and customer feedback
- If the customer is being hostile, abusive, or inappropriate, remain professional and end the call gracefully: "I understand you're frustrated. I want to make sure we can have a productive conversation. If now isn't a good time, we can always reconnect later."
- Never provide: personal advice, medical information, legal advice, technical support unrelated to banking, recipes, general knowledge, or entertainment

Guidelines:
- Always be empathetic and understanding
- Use natural, conversational language suitable for voice
- Ask ONE question at a time maximum
- Acknowledge their feelings before asking follow-ups
- If they seem upset, validate their emotions first
- Keep responses under 50 words when possible
- Stay strictly on topic - this is a banking feedback call
- Don't be overly formal or robotic
- Keep calls brief and respectful of their time

Example responses:
- "I'm really sorry to hear about that experience. That must have been frustrating. Can you tell me what specifically went wrong?"
- "Thank you for sharing that with me. What would have made that experience better for you?"
- "I understand completely. Thank you so much for taking the time to share this feedback with me today, ${customerName}. Your insights are incredibly valuable to us."

Example off-topic redirects:
Customer: "Can you give me a recipe for cheesecake?"
You: "I appreciate the question, but I'm here specifically to understand your experience with ${bankName}. Is there anything about your banking services you'd like to discuss?"

Remember: Your ONLY job is to LISTEN, UNDERSTAND, and DISCOVER reasons related to their banking experience. Keep it brief - maximum 2 follow-up questions, then end the call gracefully.`
  }
  
  /**
   * Analyze conversation for sentiment, issues, and completion
   */
  private async analyzeConversation(context: ConversationContext): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral'
    keyIssues: string[]
    shouldEndCall: boolean
    summary?: string
    resolution?: string
  }> {
    try {
      const conversationText = context.conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n')
      
      // Count customer responses
      const customerResponseCount = context.conversationHistory.filter(msg => msg.role === 'user').length
      
      const analysisPrompt = `Analyze this customer service conversation and provide:

1. Overall sentiment (positive/negative/neutral)
2. Key issues mentioned by the customer (list of specific problems)
3. Whether the call should end (true if customer has responded 3+ times OR seems satisfied with being heard)
4. If call should end, provide a brief summary
5. Any resolution or next steps mentioned

Customer has responded ${customerResponseCount} times. If this is 3 or more, shouldEndCall MUST be true.

Conversation:
${conversationText}

Respond in JSON format:
{
  "sentiment": "positive|negative|neutral",
  "keyIssues": ["issue1", "issue2"],
  "shouldEndCall": true|false,
  "summary": "brief summary if ending",
  "resolution": "any resolution mentioned"
}`
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.1,
        max_tokens: 500
      })
      
      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No analysis response')
      
      // Remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()
      
      const analysis = JSON.parse(cleanedResponse)
      
      // Force end call after 3 customer responses
      const shouldEndCall = analysis.shouldEndCall || customerResponseCount >= 3
      
      return {
        sentiment: analysis.sentiment || 'neutral',
        keyIssues: analysis.keyIssues || [],
        shouldEndCall,
        summary: analysis.summary,
        resolution: analysis.resolution
      }
      
    } catch (error) {
      console.error('Conversation analysis failed:', error)
      // Force end if too many messages
      const customerResponseCount = context.conversationHistory.filter(msg => msg.role === 'user').length
      return {
        sentiment: 'neutral',
        keyIssues: [],
        shouldEndCall: customerResponseCount >= 3,
        summary: 'Conversation completed'
      }
    }
  }
  
  /**
   * Generate call summary after completion
   */
  async generateCallSummary(context: ConversationContext): Promise<{
    summary: string
    sentiment: 'positive' | 'negative' | 'neutral'
    keyIssues: string[]
    recommendations: string[]
  }> {
    try {
      const conversationText = context.conversationHistory
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n')
      
      const summaryPrompt = `Create a comprehensive summary of this customer feedback call:

Customer: ${context.customerName}
${context.customerReason ? `Original Reason for Leaving: ${context.customerReason}` : 'Purpose: Discover why customer left'}
Services Affected: ${context.services.join(', ')}

Conversation:
${conversationText}

Provide a detailed analysis in JSON format:
{
  "summary": "2-3 paragraph summary of the key points discussed",
  "sentiment": "overall customer sentiment (positive/negative/neutral)",
  "keyIssues": ["specific issues mentioned by customer"],
  "recommendations": ["actionable recommendations for the bank based on feedback"]
}

Focus on:
- What the customer's main concerns were
- How they felt about their experience
- Specific problems they encountered
- What could have been done better
- Any positive feedback they shared`
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        max_tokens: 800
      })
      
      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No summary response')
      
      // Remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim()
      
      const summary = JSON.parse(cleanedResponse)
      
      return {
        summary: summary.summary || 'Call completed successfully',
        sentiment: summary.sentiment || 'neutral',
        keyIssues: summary.keyIssues || [],
        recommendations: summary.recommendations || []
      }
      
    } catch (error) {
      console.error('Summary generation failed:', error)
      return {
        summary: `Customer ${context.customerName} provided feedback about their experience.${context.customerReason ? ` Reason mentioned: ${context.customerReason}` : ''}`,
        sentiment: 'neutral',
        keyIssues: context.customerReason ? [context.customerReason] : [],
        recommendations: ['Follow up with customer service improvements']
      }
    }
  }
  
  /**
   * Generate closing message for the call
   */
  generateClosingMessage(context: ConversationContext, summary?: string): string {
    const { customerName, bankName } = context
    
    const closingMessages = [
      `Thank you so much for taking the time to speak with me today, ${customerName}. Your feedback is incredibly valuable to us at ${bankName}, and I want you to know that we've heard everything you've shared. We truly appreciate your honesty.`,
      
      `${customerName}, I really appreciate you sharing your experience with me. Your feedback helps us understand where we can do better. Thank you for giving us this opportunity to listen.`,
      
      `Thank you, ${customerName}, for being so open about your experience. We value your feedback tremendously, and I want you to know that everything you've shared will be passed along to help us improve our services.`
    ]
    
    const messageIndex = Math.floor(Math.random() * closingMessages.length)
    return closingMessages[messageIndex]
  }
  
  /**
   * Convert text to speech-optimized format
   */
  optimizeForSpeech(text: string): string {
    // Polly Neural voice handles natural speech well, return text as-is
    return text
  }
}

export default OpenAIClient