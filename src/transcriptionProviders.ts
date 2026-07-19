import { getAsrHealth, getAsrTask, submitAsrTask } from './asrClient';
import type { AsrTask } from './asrClient';

export interface TranscriptionProvider {
  id: string;
  name: string;
  kind: '本地' | '云端';
  health(): Promise<{ ready: boolean; message: string }>;
  submit(file: File, options?: { diarization?: boolean }): Promise<{ taskId: string }>;
  getTask(taskId: string): Promise<AsrTask>;
}

export class LocalAgentProvider implements TranscriptionProvider {
  id = 'local-agent'; name = '本地 ASR Agent'; kind = '本地' as const;
  async health() { try { const value = await getAsrHealth(); return { ready: value.model.asr_ready, message: value.model.asr_ready ? '本地模型已就绪' : `缺少：${value.model.missing.join('、')}` }; } catch { return { ready: false, message: '本地 Agent 未连接' }; } }
  async submit(file: File, options?: { diarization?: boolean }) { const task = await submitAsrTask(file, Boolean(options?.diarization)); return { taskId: task.id }; }
  getTask(taskId: string) { return getAsrTask(taskId); }
}

export class CloudHttpProvider implements TranscriptionProvider {
  id: string; name: string; kind = '云端' as const;
  constructor(name: string, private endpoint: string, private token?: string) { this.id = `cloud-${name.toLowerCase().replace(/\s+/g, '-')}`; this.name = name; }
  private headers(): Record<string, string> { return this.token ? { Authorization: `Bearer ${this.token}` } : {}; }
  async health() { try { const response = await fetch(`${this.endpoint}/health`, { headers: this.headers() }); return { ready: response.ok, message: response.ok ? '云端服务已连接' : `服务返回 ${response.status}` }; } catch { return { ready: false, message: '无法连接云端转写服务' }; } }
  async submit(file: File, options?: { diarization?: boolean }) { const body = new FormData(); body.append('file', file); body.append('enable_diarization', String(Boolean(options?.diarization))); const response = await fetch(`${this.endpoint}/transcribe`, { method: 'POST', headers: this.headers(), body }); if (!response.ok) throw new Error(await response.text()); const task = await response.json(); return { taskId: task.id as string }; }
  async getTask(taskId: string) { const response = await fetch(`${this.endpoint}/tasks/${taskId}`, { headers: this.headers() }); if (!response.ok) throw new Error(await response.text()); return response.json(); }
}

export const transcriptionProviders: TranscriptionProvider[] = [new LocalAgentProvider()];
