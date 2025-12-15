import axios from "axios"

export interface DifyChatRequest {
  conversation_id?: string
  message: string
  metadata?: Record<string, unknown>
}

export interface DifyChatResponse {
  // Dify返回结构可能较复杂，这里保留为通用结构
  [key: string]: unknown
}

export class DifyClient {
  constructor(private readonly baseUrl: string) {}

  async chat(body: DifyChatRequest): Promise<DifyChatResponse> {
    const url = `${this.baseUrl}/dify/chat`
    const { data } = await axios.post(url, body)
    return data
  }
}


