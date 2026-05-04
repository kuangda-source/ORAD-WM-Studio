import type {
  DatasetSummary,
  DatasetSourceCard,
  JobLaunchResponse,
  JobRecord,
  ReconstructionResponse,
  ModelCatalogItem,
  ModelLaunchAction,
  ReplayResponse,
  RlTrainResponse,
  RUGDImportResponse,
  RunComparisonResponse,
  RunExportResponse,
  RunRecord,
  SceneGenerateResponse,
  SequenceDetail,
  SequenceQuality,
  TrajectoryPredictResponse,
  TrajectoryTrainResponse,
  TartanDriveImportResponse,
  TraversabilityPredictResponse,
  TraversabilityTrainResponse,
  Vehicle,
  WorldModelPredictResponse,
  WorldModelTrainResponse,
} from './types'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  })
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  datasets: () => request<DatasetSummary[]>('/api/datasets'),
  runs: (source?: string) => request<RunRecord[]>(source && source !== 'all' ? `/api/runs?source=${encodeURIComponent(source)}` : '/api/runs'),
  compareRuns: (kind?: string, source?: string) => {
    const params = new URLSearchParams()
    if (kind && kind !== 'all') params.set('kind', kind)
    if (source && source !== 'all') params.set('source', source)
    const query = params.toString()
    return request<RunComparisonResponse>(`/api/runs/compare${query ? `?${query}` : ''}`)
  },
  run: (runId: string) => request<RunRecord>(`/api/runs/${runId}`),
  exportRun: (runId: string) => request<RunExportResponse>(`/api/runs/${runId}/export`),
  jobs: () => request<JobRecord[]>('/api/jobs'),
  job: (jobId: string) => request<JobRecord>(`/api/jobs/${jobId}`),
  cancelJob: (jobId: string) => request<JobRecord>(`/api/jobs/${jobId}/cancel`, { method: 'POST' }),
  datasetQuality: () => request<SequenceQuality[]>('/api/datasets/quality'),
  datasetSourceCards: () => request<DatasetSourceCard[]>('/api/datasets/source-cards'),
  sequenceSourceCard: (id: string) => request<DatasetSourceCard>(`/api/sequences/${id}/source-card`),
  modelCatalog: (sequenceId: string) => request<ModelCatalogItem[]>(`/api/model-catalog?sequence_id=${encodeURIComponent(sequenceId)}`),
  launchAction: (action: ModelLaunchAction) => {
    if (!action.endpoint) throw new Error(action.disabled_reason ?? 'Launch endpoint is not available')
    return request<JobLaunchResponse>('/api/jobs/launch', {
      method: 'POST',
      body: JSON.stringify({
        label: action.label,
        endpoint: action.endpoint,
        method: action.method,
        body: action.body,
        run_async: true,
      }),
    })
  },
  launchJob: (label: string, endpoint: string, body: Record<string, unknown>, method: 'POST' | 'GET' = 'POST') =>
    request<JobLaunchResponse>('/api/jobs/launch', {
      method: 'POST',
      body: JSON.stringify({ label, endpoint, method, body, run_async: true }),
    }),
  importRugd: (body: unknown) =>
    request<RUGDImportResponse>('/api/public-datasets/rugd/import', { method: 'POST', body: JSON.stringify(body) }),
  importTartanDrive: (body: unknown) =>
    request<TartanDriveImportResponse>('/api/public-datasets/tartandrive/import', { method: 'POST', body: JSON.stringify(body) }),
  sequence: (id: string) => request<SequenceDetail>(`/api/sequences/${id}`),
  annotate: (body: unknown) => request('/api/annotations', { method: 'POST', body: JSON.stringify(body) }),
  generateScene: (body: unknown) =>
    request<SceneGenerateResponse>('/api/scenes/generate', { method: 'POST', body: JSON.stringify(body) }),
  reconstruct: (body: unknown) =>
    request<ReconstructionResponse>('/api/reconstruction/run', { method: 'POST', body: JSON.stringify(body) }),
  trainWorldModel: (body: unknown) =>
    request<WorldModelTrainResponse>('/api/world-model/train', { method: 'POST', body: JSON.stringify(body) }),
  predictWorldModel: (body: unknown) =>
    request<WorldModelPredictResponse>('/api/world-model/predict', { method: 'POST', body: JSON.stringify(body) }),
  trainTraversability: (body: unknown) =>
    request<TraversabilityTrainResponse>('/api/traversability/train', { method: 'POST', body: JSON.stringify(body) }),
  predictTraversability: (body: unknown) =>
    request<TraversabilityPredictResponse>('/api/traversability/predict', { method: 'POST', body: JSON.stringify(body) }),
  trainTrajectory: (body: unknown) =>
    request<TrajectoryTrainResponse>('/api/trajectory/train', { method: 'POST', body: JSON.stringify(body) }),
  predictTrajectory: (body: unknown) =>
    request<TrajectoryPredictResponse>('/api/trajectory/predict', { method: 'POST', body: JSON.stringify(body) }),
  trainRl: (body: unknown) => request<RlTrainResponse>('/api/rl/train', { method: 'POST', body: JSON.stringify(body) }),
  replay: (runId: string) => request<ReplayResponse>(`/api/rl/replay/${runId}`),
  vehicles: () => request<Vehicle[]>('/api/vehicles'),
  saveVehicle: (body: Vehicle) => request<Vehicle>('/api/vehicles', { method: 'POST', body: JSON.stringify(body) }),
}
