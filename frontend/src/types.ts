export type DatasetSummary = {
  id: string
  name: string
  root: string
  sequence_count: number
  terrain_types: string[]
  sequences: string[]
}

export type SequenceMetadata = {
  scene_id: string
  terrain: string
  weather: string
  time_of_day: string
  difficulty: string
  tags: string[]
  has_lidar: boolean
  has_occupancy: boolean
  vehicle_id: string
}

export type SequenceDetail = {
  id: string
  metadata: SequenceMetadata
  frames: string[]
  occupancy: string[]
  labels: string[]
  poses_url: string
  calibration_url: string
}

export type AssetMap = Record<string, string>

export type Provenance = {
  source: 'real_data' | 'synthetic' | 'mock' | 'toy_env' | 'placeholder'
  label: string
  notes: string[]
  components: Record<string, string>
  data_sources: string[]
}

export type RunRecord = {
  run_id: string
  kind: string
  name: string
  status: 'completed' | 'failed' | 'running'
  sequence_id: string | null
  source: Provenance['source']
  provenance: Provenance
  metrics: Record<string, unknown>
  artifacts: Record<string, string>
  config: Record<string, unknown>
  created_at: string
}

export type RunExportResponse = {
  run: RunRecord
  bundle: Record<string, unknown>
}

export type RunComparisonRow = {
  run_id: string
  name: string
  kind: string
  source: Provenance['source']
  created_at: string
  metrics: Record<string, number | string | null>
}

export type RunComparisonResponse = {
  kind: string | null
  source: string | null
  metric_keys: string[]
  rows: RunComparisonRow[]
}

export type JobRecord = {
  job_id: string
  kind: string
  label: string
  endpoint: string
  method: 'POST' | 'GET'
  status: 'queued' | 'running' | 'completed' | 'failed'
  sequence_id: string | null
  source: Provenance['source'] | null
  run_id: string | null
  request: Record<string, unknown>
  result: Record<string, unknown> | null
  error: string | null
  created_at: string
  updated_at: string
}

export type JobLaunchResponse = {
  job: JobRecord
  result: Record<string, unknown> | null
}

export type QualityItem = {
  key: string
  label: string
  status: 'ok' | 'warning' | 'missing' | 'placeholder'
  value: string
  required_for: string[]
  notes: string[]
}

export type SequenceQuality = {
  sequence_id: string
  overall_status: 'ok' | 'warning' | 'missing' | 'placeholder'
  summary: string
  items: QualityItem[]
}

export type DatasetSourceCard = {
  sequence_id: string
  dataset_name: string
  source_type: 'public' | 'synthetic' | 'custom' | 'unknown'
  license: string
  citation: string
  homepage: string | null
  importer: string
  importer_version: string
  source_root: string | null
  target_root: string
  manifest_path: string | null
  sensors: string[]
  tags: string[]
  known_limitations: string[]
  recommended_next: string[]
}

export type ModelLaunchAction = {
  id: string
  label: string
  endpoint: string | null
  method: 'POST' | 'GET'
  body: Record<string, unknown>
  enabled: boolean
  disabled_reason: string | null
}

export type ModelCatalogItem = {
  id: string
  name: string
  task: string
  adapter: string
  status: 'ready' | 'blocked' | 'placeholder' | 'mock'
  source: Provenance['source']
  required_streams: string[]
  optional_streams: string[]
  outputs: string[]
  blockers: string[]
  recommended_next: string[]
  launch_actions: ModelLaunchAction[]
}

export type SceneGenerateResponse = {
  scene_id: string
  seed: number
  terrain: string
  weather: string
  task: string
  prompt: string
  assets: AssetMap
  metrics: Record<string, number>
  provenance: Provenance
}

export type ReconstructionResponse = {
  run_id: string
  sequence_id: string
  method: string
  assets: AssetMap
  metrics: Record<string, number>
  provenance: Provenance
}

export type WorldModelTrainResponse = {
  run_id: string
  model: string
  checkpoint_url: string
  metrics: Array<Record<string, number>>
  backend: string
  provenance: Provenance
}

export type WorldModelPredictResponse = {
  prediction_id: string
  assets: AssetMap
  ego_motion: Array<Record<string, number>>
  uncertainty: number
  provenance: Provenance
}

export type TraversabilityTrainResponse = {
  run_id: string
  model: string
  source_format: string
  backend: string
  model_url: string
  sample_count: number
  prototypes: Record<string, number[]>
  groups: Record<string, string[]>
  metrics: Record<string, number>
  training_curve: Array<Record<string, number>>
  provenance: Provenance
}

export type TraversabilityPredictResponse = {
  prediction_id: string
  model_id: string
  frame_url: string
  assets: AssetMap
  metrics: Record<string, number>
  counts: Record<string, number>
  provenance: Provenance
}

export type TrajectoryTrainResponse = {
  run_id: string
  model: string
  backend: string
  checkpoint_url: string
  history: number
  horizon: number
  sample_count: number
  training_curve: Array<Record<string, number>>
  provenance: Provenance
}

export type TrajectoryPredictResponse = {
  prediction_id: string
  model_id: string
  assets: AssetMap
  observed: Array<Record<string, number>>
  predicted: Array<Record<string, number>>
  ground_truth: Array<Record<string, number>>
  metrics: Record<string, number>
  provenance: Provenance
}

export type RlTrainResponse = {
  run_id: string
  algorithm: string
  metrics: Record<string, number>
  replay_url: string
  training_curve: Array<Record<string, number>>
  provenance: Provenance
}

export type ReplayResponse = {
  run_id: string
  states: Array<Record<string, number>>
  events: Array<Record<string, string | number>>
  metrics: Record<string, number>
  provenance: Provenance
}

export type Vehicle = {
  id: string
  name: string
  wheelbase: number
  width: number
  length: number
  max_steer: number
  max_speed: number
  mass: number
  tire_type: string
}

export type RUGDImportResponse = {
  sequence_id: string
  source_root: string
  target_root: string
  imported_frames: number
  manifest: string
  dataset: DatasetSummary
}

export type TartanDriveImportResponse = {
  sequence_id: string
  source_root: string
  target_root: string
  imported_frames: number
  manifest: string
  dataset: DatasetSummary
}
