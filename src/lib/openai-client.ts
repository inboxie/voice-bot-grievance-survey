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
        model: 'gpt-4-turbo-preview',
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
    
    return `You are ${botName}, an empathetic and professional customer service AI from ${bankName}. You are conducting a voice call with ${customerName}. ${reasonContext}

Your primary goals:
1. Listen empathetically and make the customer feel heard
2. Understand their specific concerns and issues - discover the real reasons behind their actions
3. Gather detailed feedback about their experience
4. DO NOT try to solve problems or offer solutions - just listen and understand
5. Keep responses conversational and natural for voice interaction
6. Be concise - responses should be 1-3 sentences maximum
7. Ask follow-up questions to get deeper insights

Services context: ${services.join(', ')}

Guidelines:
- Always be empathetic and understanding
- Use natural, conversational language suitable for voice
- Ask one question at a time
- Acknowledge their feelings before asking follow-ups
- If they seem upset, validate their emotions first
- Keep responses under 50 words when possible
- Use pauses and natural speech patterns
- Don't be overly formal or robotic

Example responses:
- "I'm really sorry to hear about that experience. That must have been frustrating."
- "Thank you for sharing that with me. Can you tell me more about what happened?"
- "I understand completely. How did that make you feel?"
- "What was it that led you to make that decision?"

Remember: Your job is to LISTEN, UNDERSTAND, and DISCOVER the reasons - not to fix or solve anything.`
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
      
      const analysisPrompt = `Analyze this customer service conversation and provide:

1. Overall sentiment (positive/negative/neutral)
2. Key issues mentioned by the customer (list of specific problems)
3. Whether the call should end (true if customer seems satisfied with being heard, or conversation has gone on too long)
4. If call should end, provide a brief summary
5. Any resolution or next steps mentioned

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
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.1,
        max_tokens: 500
      })
      
      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No analysis response')
      
      const analysis = JSON.parse(response)
      
      return {
        sentiment: analysis.sentiment || 'neutral',
        keyIssues: analysis.keyIssues || [],
        shouldEndCall: analysis.shouldEndCall || false,
        summary: analysis.summary,
        resolution: analysis.resolution
      }
      
    } catch (error) {
      console.error('Conversation analysis failed:', error)
      return {
        sentiment: 'neutral',
        keyIssues: [],
        shouldEndCall: context.conversationHistory.length > 20, // End after 20 exchanges
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
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        max_tokens: 800
      })
      
      const response = completion.choices[0]?.message?.content
      if (!response) throw new Error('No summary response')
      
      const summary = JSON.parse(response)
      
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
    
    // Rotate through different closing messages
    const messageIndex = Math.floor(Math.random() * closingMessages.length)
    return closingMessages[messageIndex]
  }
  
  /**
   * Convert text to speech-optimized format
   */
  optimizeForSpeech(text: string): string {
    return text
      // Add pauses for better speech flow
      .replace(/\. /g, '. <break time="0.5s"/> ')
      .replace(/\? /g, '? <break time="0.3s"/> ')
      .replace(/! /g, '! <break time="0.3s"/> ')
      // Ensure proper pronunciation of common banking terms
      .replace(/\bAPI\b/g, 'A P I')
      .replace(/\bATM\b/g, 'A T M')
      .replace(/\bID\b/g, 'I D')
      // Slow down phone numbers and account numbers
      .replace(/(\d{3,})/g, '<prosody rate="slow">$1</prosody>')
  }
}

export default OpenAIClient