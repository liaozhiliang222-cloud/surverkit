// 对外部署时通过 VITE_ASR_API_URL 指向云端转写服务；本地开发自动回退到 Agent。
export const ASR_AGENT_BASE_URL = (import.meta.env.VITE_ASR_API_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');

export interface AsrSegmentResult {
  id: string;
  start: number;
  end: number;
  speaker_id: string;
  role: string;
  text: string;
  confidence: number;
}

export interface AsrTaskResult {
  audio_id: string;
  duration: number;
  language: string;
  engine: string;
  raw_text?: string;
  segments: AsrSegmentResult[];
  diarization?: {
    enabled: boolean;
    status: string;
    missing?: string[];
  };
}

export interface AsrTask {
  id: string;
  file_name: string;
  status: '等待中' | '正在转码' | '正在读取音频' | '正在识别语音' | '正在区分说话人' | '正在合并结果' | '已完成' | '失败' | '已取消';
  progress: number;
  error?: string;
  result?: AsrTaskResult;
}

export interface AsrHealth {
  ok: boolean;
  agent: string;
  model: {
    model_name: string;
    asr_ready: boolean;
    diarization_ready: boolean;
    punctuation_ready?: boolean;
    missing: string[];
    missing_diarization: string[];
    missing_punctuation?: string[];
    paths: Record<string, string>;
  };
  limits: {
    max_workers: number;
    num_threads: number;
  };
}

export async function getAsrHealth(signal?: AbortSignal): Promise<AsrHealth> {
  const response = await fetch(`${ASR_AGENT_BASE_URL}/health`, { signal });
  if (!response.ok) throw new Error('转写服务暂不可用');
  return response.json();
}

export async function submitAsrTask(file: File, enableDiarization = false): Promise<AsrTask> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('enable_diarization', String(enableDiarization));
  const response = await fetch(`${ASR_AGENT_BASE_URL}/transcribe`, {
    method: 'POST',
    body: formData
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getAsrTask(taskId: string): Promise<AsrTask> {
  const response = await fetch(`${ASR_AGENT_BASE_URL}/tasks/${taskId}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function cancelAsrTask(taskId: string): Promise<AsrTask> {
  const response = await fetch(`${ASR_AGENT_BASE_URL}/tasks/${taskId}/cancel`, {
    method: 'POST'
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
