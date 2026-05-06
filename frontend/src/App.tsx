import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Brain,
  Car,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Database,
  Gauge,
  Layers,
  Map,
  Mountain,
  Pause,
  Play,
  Radar,
  RefreshCcw,
  Route,
  Save,
  Sun,
  Tag,
  Upload,
  Wand2,
} from 'lucide-react'
import { api } from './api'
import type {
  DatasetSummary,
  DatasetSourceCard,
  JobRecord,
  Provenance,
  ModelCatalogItem,
  ModelLaunchAction,
  ReconstructionResponse,
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

const terrains = [
  { label: '荒漠', value: 'sand' },
  { label: '森林', value: 'forest' },
  { label: '山地', value: 'mountain' },
  { label: '泥泞', value: 'mud' },
  { label: '雪地', value: 'snow' },
]

const soils = [
  { label: '沙土', value: 'sand' },
  { label: '黏土', value: 'clay' },
  { label: '砾石', value: 'gravel' },
  { label: '冰面', value: 'ice' },
  { label: '腐殖土', value: 'loam' },
]

const weathers = [
  { label: '晴天', value: 'sunny', icon: Sun },
  { label: '雨天', value: 'rain', icon: CloudRain },
  { label: '雾霾', value: 'fog', icon: CloudRain },
]

const tasks = [
  { label: '越野小径', value: 'trail' },
  { label: '林间穿行', value: 'forest-pass' },
  { label: '坡道', value: 'slope' },
  { label: '障碍绕行', value: 'obstacle-avoid' },
]

const algorithms = [
  { name: 'WM-RL v2.1', sub: '世界模型强化学习', score: Number.NaN, color: '#176b48' },
  { name: 'MPC-Topo', sub: '拓扑地形风险预测', score: Number.NaN, color: '#47687d' },
  { name: 'E2E-Transformer', sub: '端到端 Transformer', score: Number.NaN, color: '#7a5a92' },
  { name: 'SLAM-RRT*', sub: '地图重建+随机树', score: Number.NaN, color: '#9a7a47' },
  { name: 'Hybrid-WM', sub: '混合世界模型', score: Number.NaN, color: '#a05058' },
]

const sourceFilters: Array<{ label: string; value: 'all' | Provenance['source'] }> = [
  { label: 'All', value: 'all' },
  { label: 'Real', value: 'real_data' },
  { label: 'Synth', value: 'synthetic' },
  { label: 'Mock', value: 'mock' },
  { label: 'Toy', value: 'toy_env' },
  { label: 'Placeholder', value: 'placeholder' },
]

const compareKinds = [
  { label: 'All kinds', value: 'all' },
  { label: 'Terrain train', value: 'traversability_train' },
  { label: 'Terrain pred', value: 'traversability_predict' },
  { label: 'Traj train', value: 'trajectory_train' },
  { label: 'Traj pred', value: 'trajectory_predict' },
  { label: 'WM train', value: 'world_model_train' },
  { label: 'WM pred', value: 'world_model_predict' },
  { label: 'Recon', value: 'reconstruction' },
  { label: 'RL train', value: 'rl_train' },
]

type AppPage = 'dashboard' | 'scene-lab' | 'dataset' | 'runs'

const pageTabs: Array<{ label: string; value: AppPage }> = [
  { label: 'Dashboard', value: 'dashboard' },
  { label: 'Scene Lab', value: 'scene-lab' },
  { label: 'Dataset', value: 'dataset' },
  { label: 'Runs', value: 'runs' },
]

const fallbackVehicle: Vehicle = {
  id: 'ugv_default',
  name: 'Offroad UGV',
  wheelbase: 2.8,
  width: 1.6,
  length: 4.2,
  max_steer: 35,
  max_speed: 12,
  mass: 1200,
  tire_type: 'all-terrain',
}

function isFiniteNumber(value: number | undefined | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatNumber(value: number | undefined | null, digits = 1, suffix = ''): string {
  return isFiniteNumber(value) ? `${value.toFixed(digits)}${suffix}` : 'NaN'
}

function formatPercent(value: number | undefined | null): string {
  return isFiniteNumber(value) ? `${Math.round(value * 1000) / 10}%` : 'NaN'
}

function displayScore(value: number): string {
  return isFiniteNumber(value) ? `${value}%` : 'NaN'
}

function barWidth(value: number): string {
  return isFiniteNumber(value) ? `${value}%` : '0%'
}

function sourceLabel(source: Provenance['source']): string {
  return {
    real_data: 'REAL',
    synthetic: 'SYNTH',
    mock: 'MOCK',
    toy_env: 'TOY',
    placeholder: 'PLACEHOLDER',
  }[source]
}

function SourceBadge({ provenance }: { provenance?: Provenance | null }) {
  if (!provenance) return <span className="source-badge empty">NaN source</span>
  const detail = [provenance.label, ...provenance.notes].filter(Boolean).join(' · ')
  return (
    <span className={`source-badge ${provenance.source}`} title={detail}>
      {sourceLabel(provenance.source)}
    </span>
  )
}

function statusText(status: string): string {
  return {
    ok: 'OK',
    warning: 'WARN',
    missing: 'MISSING',
    placeholder: 'PLACEHOLDER',
    queued: 'QUEUED',
    completed: 'DONE',
    cancel_requested: 'CANCEL?',
    cancelled: 'CANCELLED',
    failed: 'FAILED',
    running: 'RUNNING',
    ready: 'READY',
    blocked: 'BLOCKED',
    mock: 'MOCK',
  }[status] ?? status
}

function JsonBlock({ value }: { value: unknown }) {
  return <pre className="json-block">{JSON.stringify(value ?? {}, null, 2)}</pre>
}

function artifactKind(url: string): 'image' | 'json' | 'file' {
  const clean = url.split('?')[0].toLowerCase()
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(clean)) return 'image'
  if (/\.(json|csv|txt)$/.test(clean)) return 'json'
  return 'file'
}

function formatUnknownValue(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value, Math.abs(value) < 10 ? 3 : 1)
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `${value.length} items`
  if (value && typeof value === 'object') return `${Object.keys(value).length} fields`
  return 'NaN'
}

function MetricSummary({ metrics }: { metrics: Record<string, unknown> }) {
  const entries = Object.entries(metrics).slice(0, 8)
  if (entries.length === 0) return <div className="empty-run">No metrics</div>
  return (
    <div className="metric-summary">
      {entries.map(([key, value]) => (
        <div className="metric-summary-row" key={key}>
          <span>{key}</span>
          <strong>{formatUnknownValue(value)}</strong>
        </div>
      ))}
    </div>
  )
}

function ArtifactPreviewGrid({ artifacts }: { artifacts: Record<string, string> }) {
  const entries = Object.entries(artifacts)
  if (entries.length === 0) return <div className="empty-run">NaN artifacts</div>
  return (
    <div className="artifact-preview-grid">
      {entries.map(([key, value]) => {
        const kind = artifactKind(value)
        return (
          <figure className={`artifact-preview ${kind}`} key={key}>
            <figcaption>
              <span>{key}</span>
              <a href={value} target="_blank" rel="noreferrer">open</a>
            </figcaption>
            {kind === 'image' ? (
              <img src={value} alt={key} />
            ) : (
              <div className="artifact-file">
                <strong>{kind.toUpperCase()}</strong>
                <small>{value.split('/').slice(-2).join('/')}</small>
              </div>
            )}
          </figure>
        )
      })}
    </div>
  )
}

function usePlayback(frameCount: number, active: boolean) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!active || frameCount < 2) return undefined
    const timer = window.setInterval(() => {
      setFrame((current) => (current + 1) % frameCount)
    }, 900)
    return () => window.clearInterval(timer)
  }, [active, frameCount])
  return [frame, setFrame] as const
}

function PillGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ label: string; value: string; icon?: typeof Sun }>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <section className="control-block">
      <div className="section-title">{label}</div>
      <div className="pill-grid">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.value}
              className={`control-pill ${value === option.value ? 'active' : ''}`}
              onClick={() => onChange(option.value)}
              title={option.label}
              type="button"
            >
              {Icon ? <Icon size={13} /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function MetricTile({ label, value, tone = 'green' }: { label: string; value: string; tone?: 'green' | 'red' | 'blue' }) {
  return (
    <div className={`metric-tile ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function MiniCurve({ data, field, color }: { data: Array<Record<string, number>>; field: string; color: string }) {
  const points = useMemo(() => {
    if (data.length === 0) return ''
    const values = data.map((row) => row[field] ?? 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return values
      .map((value, index) => {
        const x = data.length === 1 ? 0 : (index / (data.length - 1)) * 100
        const y = 34 - ((value - min) / Math.max(0.001, max - min)) * 30
        return `${x},${y}`
      })
      .join(' ')
  }, [data, field])

  return (
    <svg className="mini-curve" viewBox="0 0 100 36" role="img" aria-label={field}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ReplayMap({ replay }: { replay: ReplayResponse | null }) {
  const points = replay?.states ?? []
  const path = points.map((point) => `${point.x},${point.y}`).join(' ')
  return (
    <div className="replay-map">
      <svg viewBox="0 0 256 256" role="img" aria-label="policy replay">
        <defs>
          <linearGradient id="trailGradient" x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor="#7a5a3b" />
            <stop offset="100%" stopColor="#d7be8a" />
          </linearGradient>
        </defs>
        <path d="M35 248 C74 202 86 173 112 140 C134 112 154 88 214 18" stroke="url(#trailGradient)" strokeWidth="38" fill="none" strokeLinecap="round" />
        <path d="M39 245 C83 204 98 171 120 139 C143 106 166 78 218 20" stroke="#e3d8bb" strokeWidth="4" fill="none" strokeDasharray="8 8" />
        {path ? <polyline points={path} fill="none" stroke="#1d8fc5" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}
        {points.slice(0, 1).map((point) => (
          <circle key="start" cx={point.x} cy={point.y} r="6" fill="#0f6b45" />
        ))}
        {points.slice(-1).map((point) => (
          <circle key="end" cx={point.x} cy={point.y} r="7" fill="#d9a441" />
        ))}
      </svg>
    </div>
  )
}

function RunRegistryPanel({
  runs,
  source,
  onSourceChange,
  onSelectRun,
}: {
  runs: RunRecord[]
  source: 'all' | Provenance['source']
  onSourceChange: (source: 'all' | Provenance['source']) => void
  onSelectRun: (run: RunRecord) => void
}) {
  return (
    <div className="runs-panel">
      <div className="source-filter">
        {sourceFilters.map((option) => (
          <button
            key={option.value}
            className={source === option.value ? 'active' : ''}
            onClick={() => onSourceChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="runs-list">
        {runs.length === 0 ? <div className="empty-run">No runs</div> : null}
        {runs.slice(0, 8).map((run) => (
          <button className="run-row" key={run.run_id} onClick={() => onSelectRun(run)} type="button">
            <div>
              <strong>{run.name}</strong>
              <small>{run.kind} · {run.sequence_id ?? 'NaN sequence'}</small>
              <small>{new Date(run.created_at).toLocaleString()}</small>
            </div>
            <SourceBadge provenance={run.provenance} />
          </button>
        ))}
      </div>
    </div>
  )
}

function RunComparisonPanel({
  comparison,
  kind,
  onKindChange,
}: {
  comparison: RunComparisonResponse | null
  kind: string
  onKindChange: (kind: string) => void
}) {
  const keys = comparison?.metric_keys.slice(0, 3) ?? []
  const rows = comparison?.rows.slice(0, 5) ?? []
  return (
    <div className="comparison-panel">
      <select className="select compact-select" value={kind} onChange={(event) => onKindChange(event.target.value)}>
        {compareKinds.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {rows.length === 0 ? <div className="empty-run">No comparable runs</div> : null}
      {rows.map((row) => (
        <div className="comparison-row" key={row.run_id}>
          <div>
            <strong>{row.name}</strong>
            <small>{row.kind} · {row.source}</small>
          </div>
          <div className="comparison-metrics">
            {keys.map((key) => (
              <span key={key}>{key}: <b>{formatUnknownValue(row.metrics[key])}</b></span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function JobQueuePanel({ jobs, onRefresh, onCancel }: { jobs: JobRecord[]; onRefresh: () => void; onCancel: (jobId: string) => void }) {
  return (
    <div className="jobs-panel">
      <button className="mini-refresh" onClick={onRefresh} type="button">
        <RefreshCcw size={13} />
        Refresh
      </button>
      {jobs.length === 0 ? <div className="empty-run">No jobs</div> : null}
      {jobs.slice(0, 8).map((job) => (
        <div className="job-row" key={job.job_id}>
          <div>
            <strong>{job.label}</strong>
            <small>{job.kind} / {job.sequence_id ?? 'NaN sequence'}</small>
            <span className="job-progress" title={`${Math.round(job.progress * 100)}%`}>
              <i style={{ width: `${Math.max(0, Math.min(100, job.progress * 100))}%` }} />
            </span>
            <small>{job.logs.at(-1) ?? 'No logs'}</small>
            <small>{new Date(job.updated_at).toLocaleString()}</small>
          </div>
          <div className="job-actions">
            <span className={`quality-pill ${job.status}`}>{statusText(job.status)}</span>
            <button
              disabled={['completed', 'failed', 'cancelled'].includes(job.status)}
              onClick={() => onCancel(job.job_id)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

function DatasetQualityPanel({ quality }: { quality?: SequenceQuality }) {
  if (!quality) {
    return <div className="quality-empty">Quality: NaN</div>
  }
  return (
    <div className="quality-panel">
      <div className="quality-head">
        <strong>{quality.sequence_id}</strong>
        <span className={`quality-pill ${quality.overall_status}`}>{statusText(quality.overall_status)}</span>
      </div>
      <small>{quality.summary}</small>
      <div className="quality-list">
        {quality.items.map((item) => (
          <div className="quality-row" key={item.key} title={item.notes.join(' · ')}>
            <span>{item.label}</span>
            <b className={item.status}>{item.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}

function DatasetSourceCardPanel({ card }: { card?: DatasetSourceCard }) {
  if (!card) {
    return <div className="source-card empty-card">Source card: NaN</div>
  }
  return (
    <div className="source-card">
      <div className="source-card-head">
        <strong>{card.dataset_name}</strong>
        <span className={`dataset-type ${card.source_type}`}>{card.source_type}</span>
      </div>
      <small>{card.importer} · {card.importer_version}</small>
      <div className="sensor-chips">
        {card.sensors.slice(0, 6).map((sensor) => <span key={sensor}>{sensor}</span>)}
      </div>
      <details>
        <summary>license / citation</summary>
        <p>{card.license}</p>
        <p>{card.citation}</p>
      </details>
      {card.known_limitations.length > 0 ? (
        <details>
          <summary>known limitations</summary>
          {card.known_limitations.slice(0, 4).map((item) => <p key={item}>{item}</p>)}
        </details>
      ) : null}
    </div>
  )
}

function tryParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function parseFrameIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed))
  }
  return null
}

function ModelCatalogPanel({ items, onLaunch }: { items: ModelCatalogItem[]; onLaunch: (action: ModelLaunchAction) => void }) {
  const [bodyDrafts, setBodyDrafts] = useState<Record<string, string>>({})

  if (items.length === 0) return <div className="quality-empty">Model catalog: NaN</div>
  return (
    <div className="model-catalog">
      {items.map((item) => (
        <div className="model-row" key={item.id}>
          <div className="model-row-main">
            <strong>{item.name}</strong>
            <small>{item.task} · {item.adapter}</small>
          </div>
          <div className="model-row-side">
            <span className={`quality-pill ${item.status}`}>{statusText(item.status)}</span>
            <SourceBadge provenance={{ source: item.source, label: item.source, notes: item.blockers, components: {}, data_sources: [] }} />
          </div>
          <div className="stream-chips">
            {item.required_streams.map((stream) => <span key={stream}>{stream}</span>)}
          </div>
          <div className="launch-actions">
            {item.launch_actions.map((action) => {
              const key = `${item.id}-${action.id}`
              const bodyText = bodyDrafts[key] ?? JSON.stringify(action.body, null, 2)
              const parsedBody = tryParseJsonObject(bodyText)
              return (
                <div className="launch-action-editor" key={key}>
                  <button
                    disabled={!action.enabled || parsedBody === null}
                    onClick={() => parsedBody && onLaunch({ ...action, body: parsedBody })}
                    title={parsedBody === null ? 'Invalid JSON body' : action.disabled_reason ?? JSON.stringify(parsedBody)}
                    type="button"
                  >
                    {action.label}
                  </button>
                  <details>
                    <summary>params</summary>
                    <textarea
                      value={bodyText}
                      onChange={(event) => setBodyDrafts((current) => ({ ...current, [key]: event.target.value }))}
                      spellCheck={false}
                    />
                    {parsedBody === null ? <small className="model-blocker">Invalid JSON object</small> : null}
                  </details>
                </div>
              )
            })}
          </div>
          {item.blockers.length > 0 ? <small className="model-blocker">{item.blockers[0]}</small> : null}
        </div>
      ))}
    </div>
  )
}

function RunDetailDrawer({
  run,
  exported,
  onClose,
}: {
  run: RunRecord | null
  exported: RunExportResponse | null
  onClose: () => void
}) {
  if (!run) return null
  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside className="run-drawer" role="dialog" aria-label="Run detail" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <strong>{run.name}</strong>
            <small>{run.run_id} · {run.kind}</small>
          </div>
          <button className="icon-button" onClick={onClose} title="Close" type="button">×</button>
        </div>
        <div className="drawer-meta">
          <SourceBadge provenance={run.provenance} />
          <span className={`quality-pill ${run.status}`}>{statusText(run.status)}</span>
          <span>{new Date(run.created_at).toLocaleString()}</span>
        </div>
        <section>
          <div className="section-title">Provenance</div>
          <p>{run.provenance.label}</p>
          {run.provenance.notes.map((note) => <small className="model-note" key={note}>{note}</small>)}
        </section>
        <section>
          <div className="section-title">Artifacts</div>
          <ArtifactPreviewGrid artifacts={run.artifacts} />
        </section>
        <section>
          <div className="section-title">Metric Summary</div>
          <MetricSummary metrics={run.metrics} />
        </section>
        <section>
          <div className="section-title">Raw Metrics</div>
          <JsonBlock value={run.metrics} />
        </section>
        <section>
          <div className="section-title">Config</div>
          <JsonBlock value={run.config} />
        </section>
        <section>
          <div className="section-title">Export Bundle</div>
          <JsonBlock value={exported?.bundle ?? { status: 'loading' }} />
        </section>
      </aside>
    </div>
  )
}

function App() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [sequence, setSequence] = useState<SequenceDetail | null>(null)
  const [activePage, setActivePage] = useState<AppPage>('dashboard')
  const [terrain, setTerrain] = useState('mountain')
  const [soil, setSoil] = useState('gravel')
  const [weather, setWeather] = useState('sunny')
  const [task, setTask] = useState('trail')
  const [prompt, setPrompt] = useState('heavy rain on shale, fog at dawn, rocks on a narrow trail')
  const [rugdPath, setRugdPath] = useState('')
  const [tartanPath, setTartanPath] = useState('')
  const [activeView, setActiveView] = useState<'front' | 'bev' | 'terrain' | 'trajectory' | 'recon' | 'predict' | 'replay'>('front')
  const [autopilot, setAutopilot] = useState(true)
  const [loading, setLoading] = useState<string | null>(null)
  const [notice, setNotice] = useState('API connecting...')
  const [scene, setScene] = useState<SceneGenerateResponse | null>(null)
  const [reconstruction, setReconstruction] = useState<ReconstructionResponse | null>(null)
  const [wmTrain, setWmTrain] = useState<WorldModelTrainResponse | null>(null)
  const [prediction, setPrediction] = useState<WorldModelPredictResponse | null>(null)
  const [travTrain, setTravTrain] = useState<TraversabilityTrainResponse | null>(null)
  const [travPrediction, setTravPrediction] = useState<TraversabilityPredictResponse | null>(null)
  const [travPredictionFrame, setTravPredictionFrame] = useState<number | null>(null)
  const [terrainLayerMode, setTerrainLayerMode] = useState<'semantic' | 'segment'>('semantic')
  const [trajTrain, setTrajTrain] = useState<TrajectoryTrainResponse | null>(null)
  const [trajPrediction, setTrajPrediction] = useState<TrajectoryPredictResponse | null>(null)
  const [rugdImport, setRugdImport] = useState<RUGDImportResponse | null>(null)
  const [tartanImport, setTartanImport] = useState<TartanDriveImportResponse | null>(null)
  const [rlTrain, setRlTrain] = useState<RlTrainResponse | null>(null)
  const [replay, setReplay] = useState<ReplayResponse | null>(null)
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [jobs, setJobs] = useState<JobRecord[]>([])
  const [runSource, setRunSource] = useState<'all' | Provenance['source']>('all')
  const [compareKind, setCompareKind] = useState('all')
  const [comparison, setComparison] = useState<RunComparisonResponse | null>(null)
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null)
  const [runExport, setRunExport] = useState<RunExportResponse | null>(null)
  const [qualities, setQualities] = useState<SequenceQuality[]>([])
  const [sourceCards, setSourceCards] = useState<DatasetSourceCard[]>([])
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogItem[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleDraft, setVehicleDraft] = useState<Vehicle>(fallbackVehicle)
  const frameCount = sequence?.frames.length ?? 0
  const [frame, setFrame] = usePlayback(frameCount, autopilot)

  useEffect(() => {
    async function boot() {
      try {
        const loadedDatasets = await api.datasets()
        setDatasets(loadedDatasets)
        const firstSequence = loadedDatasets[0]?.sequences[0]
        if (firstSequence) {
          const detail = await api.sequence(firstSequence)
          setSequence(detail)
          setTerrain(detail.metadata.terrain)
          setWeather(detail.metadata.weather)
        }
        const loadedVehicles = await api.vehicles()
        setVehicles(loadedVehicles)
        setVehicleDraft(loadedVehicles[0] ?? fallbackVehicle)
        await refreshQuality()
        await refreshSourceCards()
        await refreshJobs()
        if (firstSequence) await refreshModelCatalog(firstSequence)
        setNotice('Ready')
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'API unavailable')
      }
    }
    void boot()
  }, [])

  useEffect(() => {
    void refreshRuns(runSource)
  }, [runSource])

  useEffect(() => {
    void refreshComparison(compareKind, runSource)
  }, [compareKind, runSource])

  useEffect(() => {
    if (sequence?.id) void refreshModelCatalog(sequence.id)
  }, [sequence?.id])

  const mainImage = scene?.assets.front_view ?? sequence?.frames[frame] ?? ''
  const occupancyImage = reconstruction?.assets.occupancy ?? scene?.assets.occupancy ?? sequence?.occupancy[0] ?? ''
  const heightmapImage = reconstruction?.assets.heightmap ?? scene?.assets.heightmap ?? sequence?.occupancy.find((item) => item.includes('heightmap')) ?? ''
  const riskImage = prediction?.assets.risk ?? reconstruction?.assets.risk ?? scene?.assets.risk ?? sequence?.occupancy.find((item) => item.includes('risk')) ?? ''
  const datasetSemanticImage = sequence?.labels?.[frame] ?? ''
  const segmentMatchesFrame = travPrediction !== null && travPredictionFrame === frame
  const showSegmentResult = terrainLayerMode === 'segment' && segmentMatchesFrame
  const terrainSecondaryImage = showSegmentResult ? travPrediction?.assets.overlay ?? '' : datasetSemanticImage
  const terrainTraversabilityImage = showSegmentResult ? travPrediction?.assets.traversability ?? '' : ''
  const terrainRiskImage = showSegmentResult ? travPrediction?.assets.risk ?? '' : ''
  const trajectoryImage = trajPrediction?.assets.trajectory ?? ''
  const predictionImage = prediction?.assets.future_trajectory ?? prediction?.assets.occupancy ?? ''
  const successRate = rlTrain?.metrics.success_rate ?? Number.NaN
  const collisionRate = rlTrain?.metrics.collision_rate ?? Number.NaN
  const pathLength = rlTrain?.metrics.path_length_m ?? Number.NaN
  const uncertainty = prediction?.uncertainty ?? Number.NaN
  const traversableRatio = showSegmentResult ? travPrediction?.metrics.traversable_ratio ?? Number.NaN : Number.NaN
  const terrainRisk = showSegmentResult ? travPrediction?.metrics.risk_score ?? Number.NaN : Number.NaN
  const trajectoryAde = trajPrediction?.metrics.ade ?? Number.NaN
  const trajectoryFde = trajPrediction?.metrics.fde ?? Number.NaN
  const trainCurveData = trajTrain?.training_curve ?? travTrain?.training_curve ?? wmTrain?.metrics ?? []
  const trainCurveField = trajTrain ? 'ade' : travTrain ? 'pixel_acc' : wmTrain ? 'bev_iou' : 'loss'
  const semanticProvenance: Provenance | null = datasetSemanticImage
    ? {
        source: 'real_data',
        label: 'Dataset semantic labels',
        notes: [`frame ${frame + 1}`],
        components: { semantic_mask: 'dataset label mask' },
        data_sources: sequence?.id ? [sequence.id] : [],
      }
    : null
  const viewProvenance =
    activeView === 'terrain'
      ? showSegmentResult
        ? travPrediction?.provenance
        : semanticProvenance
      : activeView === 'trajectory'
        ? trajPrediction?.provenance ?? trajTrain?.provenance
        : activeView === 'recon'
          ? reconstruction?.provenance
          : activeView === 'predict'
            ? prediction?.provenance ?? wmTrain?.provenance
            : activeView === 'replay'
              ? replay?.provenance ?? rlTrain?.provenance
              : activeView === 'bev'
                ? reconstruction?.provenance ?? scene?.provenance
                : scene?.provenance
  const metricProvenance = rlTrain?.provenance ?? (showSegmentResult ? travPrediction?.provenance : undefined)
  const currentQuality = qualities.find((item) => item.sequence_id === sequence?.id)
  const currentSourceCard = sourceCards.find((item) => item.sequence_id === sequence?.id)
  const runtimeModelCatalog = useMemo(
    () =>
      modelCatalog.map((item) => ({
        ...item,
        launch_actions: item.launch_actions.map((action) => {
          if (action.endpoint !== '/api/traversability/predict') return action
          return {
            ...action,
            body: {
              ...action.body,
              sequence_id: sequence?.id ?? action.body.sequence_id,
              frame_index: frame,
            },
          }
        }),
      })),
    [frame, modelCatalog, sequence?.id],
  )

  async function refreshRuns(source = runSource) {
    try {
      const loadedRuns = await api.runs(source)
      setRuns(loadedRuns)
    } catch {
      setRuns([])
    }
  }

  async function refreshComparison(kind = compareKind, source = runSource) {
    try {
      const loadedComparison = await api.compareRuns(kind, source)
      setComparison(loadedComparison)
    } catch {
      setComparison(null)
    }
  }

  async function refreshJobs() {
    try {
      const loadedJobs = await api.jobs()
      setJobs(loadedJobs)
    } catch {
      setJobs([])
    }
  }

  function mergeJob(job: JobRecord) {
    setJobs((current) => [job, ...current.filter((item) => item.job_id !== job.job_id)].slice(0, 50))
  }

  async function waitForJob(jobId: string): Promise<JobRecord> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 180000) {
      const job = await api.job(jobId)
      mergeJob(job)
      if (job.status === 'completed') return job
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.error ?? `${job.label} ${job.status}`)
      }
      await new Promise((resolve) => window.setTimeout(resolve, 700))
    }
    throw new Error(`Job timed out: ${jobId}`)
  }

  async function cancelJob(jobId: string) {
    try {
      const job = await api.cancelJob(jobId)
      mergeJob(job)
      setNotice(`${job.label}: ${statusText(job.status)}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Cancel failed')
    }
  }

  async function refreshQuality() {
    try {
      const loadedQuality = await api.datasetQuality()
      setQualities(loadedQuality)
    } catch {
      setQualities([])
    }
  }

  async function refreshSourceCards() {
    try {
      const loadedCards = await api.datasetSourceCards()
      setSourceCards(loadedCards)
    } catch {
      setSourceCards([])
    }
  }

  async function refreshModelCatalog(sequenceId = sequence?.id ?? 'seq_0001') {
    try {
      const catalog = await api.modelCatalog(sequenceId)
      setModelCatalog(catalog)
    } catch {
      setModelCatalog([])
    }
  }

  async function openRunDetail(run: RunRecord) {
    setSelectedRun(run)
    setRunExport(null)
    try {
      const [detail, exported] = await Promise.all([api.run(run.run_id), api.exportRun(run.run_id)])
      setSelectedRun(detail)
      setRunExport(exported)
    } catch {
      setRunExport(null)
    }
  }

  function applyLaunchResult(action: ModelLaunchAction, result: Record<string, unknown>, replayData?: ReplayResponse) {
    switch (action.endpoint) {
      case '/api/reconstruction/run':
        setReconstruction(result as ReconstructionResponse)
        setActiveView('recon')
        break
      case '/api/world-model/train':
        setWmTrain(result as WorldModelTrainResponse)
        break
      case '/api/world-model/predict':
        setPrediction(result as WorldModelPredictResponse)
        setActiveView('predict')
        break
      case '/api/traversability/train':
        setTravTrain(result as TraversabilityTrainResponse)
        break
      case '/api/traversability/predict':
        setTravPrediction(result as TraversabilityPredictResponse)
        setTravPredictionFrame(parseFrameIndex(action.body.frame_index) ?? frame)
        setTerrainLayerMode('segment')
        setActiveView('terrain')
        break
      case '/api/trajectory/train':
        setTrajTrain(result as TrajectoryTrainResponse)
        break
      case '/api/trajectory/predict':
        setTrajPrediction(result as TrajectoryPredictResponse)
        setActiveView('trajectory')
        break
      case '/api/rl/train':
        setRlTrain(result as RlTrainResponse)
        if (replayData) setReplay(replayData)
        setActiveView('replay')
        break
      default:
        break
    }
  }

  async function launchCatalogAction(action: ModelLaunchAction) {
    const normalizedAction =
      action.endpoint === '/api/traversability/predict' && parseFrameIndex(action.body.frame_index) === null
        ? { ...action, body: { ...action.body, frame_index: frame } }
        : action
    await runAction(
      normalizedAction.label,
      async () => {
        const launched = await api.launchAction(normalizedAction)
        mergeJob(launched.job)
        const completedJob = launched.result ? launched.job : await waitForJob(launched.job.job_id)
        const result = launched.result ?? completedJob.result ?? {}
        if (normalizedAction.endpoint === '/api/rl/train' && typeof result.run_id === 'string') {
          const replayData = await api.replay(result.run_id)
          return { result, replayData }
        }
        return { result }
      },
      ({ result, replayData }) => applyLaunchResult(normalizedAction, result, replayData),
    )
  }

  async function runAction<T>(label: string, action: () => Promise<T>, onDone: (value: T) => void) {
    setLoading(label)
    try {
      const value = await action()
      onDone(value)
      await refreshRuns()
      await refreshComparison()
      await refreshJobs()
      await refreshQuality()
      await refreshSourceCards()
      await refreshModelCatalog()
      setNotice(`${label} complete`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : `${label} failed`)
    } finally {
      setLoading(null)
    }
  }

  const generateScene = (focus: 'front' | 'bev' | 'recon' = 'front') =>
    runAction(
      'Generate scene',
      async () => {
        const body = {
          terrain,
          weather,
          task,
          prompt,
          seed: 42 + prompt.length + terrain.length,
          obstacle_density: soil === 'gravel' ? 0.42 : 0.34,
          slope: terrain === 'mountain' ? 0.55 : 0.38,
        }
        const launched = await api.launchJob('Generate scene', '/api/scenes/generate', body)
        mergeJob(launched.job)
        const completedJob = launched.result ? launched.job : await waitForJob(launched.job.job_id)
        return (launched.result ?? completedJob.result) as SceneGenerateResponse
      },
      (value) => {
        setScene(value)
        setActiveView(focus)
      },
    )

  const reconstruct = () =>
    runAction(
      'Reconstruct',
      () => api.reconstruct({ sequence_id: sequence?.id ?? 'seq_0001', method: 'mock-bev', seed: 17 }),
      (value) => {
        setReconstruction(value)
        setActiveView('recon')
      },
    )

  const trainWorldModel = () =>
    runAction(
      'Train world model',
      () => api.trainWorldModel({ sequence_id: sequence?.id ?? 'seq_0001', model: 'tiny-bev-cnn', epochs: 8, seed: 13 }),
      (value) => setWmTrain(value),
    )

  const predictWorldModel = () =>
    runAction(
      'Predict future',
      () =>
        api.predictWorldModel({
          sequence_id: sequence?.id ?? 'seq_0001',
          checkpoint_id: wmTrain?.run_id,
          action: { steer: -0.16, throttle: 0.48, brake: 0 },
          horizon: 7,
          seed: 21,
        }),
      (value) => {
        setPrediction(value)
        setActiveView('predict')
      },
    )

  const trainTraversability = () =>
    runAction(
      'Train traversability',
      () =>
        api.trainTraversability({
          sequence_id: sequence?.id ?? 'seq_0001',
          source_format: 'orwm-demo',
          trainer: 'tiny-mlp',
          max_samples: 32,
          max_pixels: 24000,
          epochs: 12,
        }),
      (value) => setTravTrain(value),
    )

  const importRugd = () =>
    runAction(
      'Import RUGD',
      async () => {
        const result = await api.importRugd({
          root_path: rugdPath,
          sequence_id: 'rugd_mini',
          max_samples: 24,
          overwrite: true,
        })
        const detail = await api.sequence(result.sequence_id)
        return { result, detail }
      },
      ({ result, detail }) => {
        setRugdImport(result)
        setDatasets([result.dataset])
        setSequence(detail)
        setFrame(0)
        setTravPrediction(null)
        setTravPredictionFrame(null)
        setTerrainLayerMode('semantic')
        setTerrain(detail.metadata.terrain)
        setWeather(detail.metadata.weather)
        setActiveView('front')
      },
    )

  const importTartanDrive = () =>
    runAction(
      'Import TartanDrive',
      async () => {
        const result = await api.importTartanDrive({
          root_path: tartanPath,
          sequence_id: 'tartandrive_mini',
          max_samples: 64,
          overwrite: true,
        })
        const detail = await api.sequence(result.sequence_id)
        return { result, detail }
      },
      ({ result, detail }) => {
        setTartanImport(result)
        setDatasets([result.dataset])
        setSequence(detail)
        setFrame(0)
        setTravPrediction(null)
        setTravPredictionFrame(null)
        setTerrainLayerMode('semantic')
        setTerrain(detail.metadata.terrain)
        setWeather(detail.metadata.weather)
        setActiveView('front')
      },
    )

  const predictTraversability = () =>
    runAction(
      'Predict traversability',
      () =>
        api.predictTraversability({
          sequence_id: sequence?.id ?? 'seq_0001',
          model_id: travTrain?.run_id,
          frame_index: frame,
        }),
      (value) => {
        setTravPrediction(value)
        setTravPredictionFrame(frame)
        setTerrainLayerMode('segment')
        setActiveView('terrain')
      },
    )

  const trainTrajectory = () =>
    runAction(
      'Train trajectory',
      () =>
        api.trainTrajectory({
          sequence_id: sequence?.id ?? 'rugd_mini',
          model: 'tiny-traj-gru',
          history: 6,
          horizon: 8,
          epochs: 60,
          hidden_dim: 48,
          augment: 96,
          seed: 23,
        }),
      (value) => setTrajTrain(value),
    )

  const predictTrajectory = () =>
    runAction(
      'Predict trajectory',
      () =>
        api.predictTrajectory({
          sequence_id: sequence?.id ?? 'rugd_mini',
          model_id: trajTrain?.run_id,
          history: 6,
          horizon: 8,
          frame_index: 8,
        }),
      (value) => {
        setTrajPrediction(value)
        setActiveView('trajectory')
      },
    )

  const trainRl = () =>
    runAction(
      'Run policy',
      async () => {
        const train = await api.trainRl({ scene_id: scene?.scene_id, algorithm: 'ppo-fallback', episodes: 10, seed: 31 })
        const replayData = await api.replay(train.run_id)
        return { train, replayData }
      },
      ({ train, replayData }) => {
        setRlTrain(train)
        setReplay(replayData)
        setActiveView('replay')
      },
    )

  const saveAnnotation = () =>
    runAction(
      'Save annotation',
      () =>
        api.annotate({
          sequence_id: sequence?.id ?? 'seq_0001',
          frame_id: `frame_${frame.toString().padStart(4, '0')}`,
          terrain,
          weather,
          task,
          labels: [soil, task, terrain],
          note: prompt,
        }),
      () => undefined,
    )

  const saveVehicle = () =>
    runAction(
      'Save vehicle',
      () => api.saveVehicle(vehicleDraft),
      (value) => setVehicles((current) => [value, ...current.filter((vehicle) => vehicle.id !== value.id)]),
    )

  const viewLabel = {
    front: 'Front View',
    bev: 'BEV Map',
    terrain: 'Terrain Perception',
    trajectory: 'Trajectory Prediction',
    recon: 'Reconstruction',
    predict: 'World Model',
    replay: 'Policy Replay',
  }[activeView]

  const sequenceOptions = datasets[0]?.sequences ?? ['seq_0001']
  const showExperimentViewport = activePage === 'dashboard' || activePage === 'scene-lab'
  const promptLower = prompt.toLowerCase()
  const promptWeatherConflict =
    (weather === 'sunny' && /(rain|fog|snow|storm|night|dawn)/.test(promptLower)) ||
    (weather === 'rain' && /(sunny|clear|dry)/.test(promptLower)) ||
    (weather === 'fog' && /(clear|sunny)/.test(promptLower))
  const centerTitle =
    activePage === 'scene-lab'
      ? 'Scene Lab Preview'
      : activePage === 'dataset'
        ? 'Dataset Workspace'
        : activePage === 'runs'
          ? 'Run Registry'
          : viewLabel
  const centerSubtitle =
    activePage === 'scene-lab'
      ? `${terrain} / ${soil} / ${weather} / ${task}`
      : activePage === 'dataset'
        ? `${sequence?.id ?? 'NaN sequence'} / source card / quality / import`
        : activePage === 'runs'
          ? `${runs.length} loaded runs / ${runSource}`
          : `${sequence?.metadata.scene_id ?? 'NaN'} / NaN x NaN / NaNfps / ${sequence?.metadata.difficulty ?? 'NaN'}`

  function loadSequence(id: string) {
    void runAction('Load sequence', () => api.sequence(id), (value) => {
      setSequence(value)
      setFrame(0)
      setTravPrediction(null)
      setTravPredictionFrame(null)
      setTerrainLayerMode('semantic')
      setTerrain(value.metadata.terrain)
      setWeather(value.metadata.weather)
    })
  }

  function stepFrame(delta: number) {
    if (frameCount < 1) return
    setAutopilot(false)
    setFrame((current) => (current + delta + frameCount) % frameCount)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <strong>OR-WM Studio</strong>
          <span>越野世界模型自动驾驶</span>
          <span className="status-pill">
            <CheckCircle2 size={14} />
            {notice}
          </span>
        </div>
        <nav className="top-nav" aria-label="Workspace views">
          {pageTabs.map((page) => (
            <button
              key={page.value}
              className={activePage === page.value ? 'active' : ''}
              onClick={() => setActivePage(page.value)}
              type="button"
            >
              {page.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <span>{terrain} · {weather} · {sequence?.metadata.time_of_day ?? 'NaN'}</span>
          <div className="playback-controls" aria-label="Frame playback controls">
            <button className="icon-button" disabled={frameCount < 2} onClick={() => stepFrame(-1)} title="Previous frame" type="button">
              <ChevronLeft size={17} />
            </button>
            <button className="icon-button" onClick={() => setAutopilot((value) => !value)} title={autopilot ? 'Pause' : 'Play'} type="button">
              {autopilot ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <button className="icon-button" disabled={frameCount < 2} onClick={() => stepFrame(1)} title="Next frame" type="button">
              <ChevronRight size={17} />
            </button>
            <span className="frame-readout">{frameCount ? `${frame + 1}/${frameCount}` : 'NaN'}</span>
          </div>
        </div>
      </header>

      <div className={`workspace ${activePage}`}>
        <aside className="left-panel">
          <div className="dashboard-left">
            <section className="control-block">
              <div className="section-title">
                <Database size={14} />
                Data Workspace
              </div>
              <select className="select" value={sequence?.id ?? ''} onChange={(event) => loadSequence(event.target.value)}>
                {sequenceOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <div className="workspace-summary">
                <span>Current frame</span>
                <strong>{sequence?.frames.length ? `${frame + 1} / ${sequence.frames.length}` : 'NaN'}</strong>
              </div>
              <div className="workspace-summary">
                <span>Source</span>
                <strong>{currentSourceCard?.source_type ?? 'NaN'}</strong>
              </div>
              <button className="secondary-button" onClick={() => setActivePage('dataset')} type="button">
                <Database size={15} />
                Open Dataset
              </button>
              <button className="secondary-button" onClick={() => setActivePage('scene-lab')} type="button">
                <Wand2 size={15} />
                Open Scene Lab
              </button>
            </section>
            <section className="control-block annotation-card">
              <div className="section-title">
                <Tag size={14} />
                Current Labels
              </div>
              <div className="label-summary">
                <span>terrain</span><b>{terrain}</b>
                <span>soil</span><b>{soil}</b>
                <span>weather</span><b>{weather}</b>
                <span>task</span><b>{task}</b>
              </div>
              <textarea className="prompt-box compact-note" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              <button className="secondary-button" onClick={saveAnnotation} disabled={loading !== null} type="button">
                <Tag size={15} />
                Save label
              </button>
            </section>
            <DatasetQualityPanel quality={currentQuality} />
          </div>

          <div className="dataset-left">
            <section className="control-block">
              <div className="section-title">
                <Database size={14} />
                Dataset Import
              </div>
              <select className="select" value={sequence?.id ?? ''} onChange={(event) => loadSequence(event.target.value)}>
                {sequenceOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <input className="path-input" value={rugdPath} onChange={(event) => setRugdPath(event.target.value)} placeholder="RUGD root path" />
              <button className="secondary-button" onClick={importRugd} disabled={loading !== null || rugdPath.trim() === ''} type="button">
                <Upload size={15} />
                Import RUGD
              </button>
              {rugdImport ? <small className="model-note">Imported {rugdImport.imported_frames} frames as {rugdImport.sequence_id}</small> : null}
              <input className="path-input" value={tartanPath} onChange={(event) => setTartanPath(event.target.value)} placeholder="TartanDrive mini root path" />
              <button className="secondary-button" onClick={importTartanDrive} disabled={loading !== null || tartanPath.trim() === ''} type="button">
                <Upload size={15} />
                Import TartanDrive
              </button>
              {tartanImport ? <small className="model-note">Imported {tartanImport.imported_frames} frames as {tartanImport.sequence_id}</small> : null}
            </section>
            <DatasetSourceCardPanel card={currentSourceCard} />
            <DatasetQualityPanel quality={currentQuality} />
          </div>

          <div className="runs-left">
            <section className="control-block scene-lab-intro">
              <div className="section-title">
                <Gauge size={14} />
                Experiment Runs
              </div>
              <p>Filter, compare, inspect, and export model or data-generation runs.</p>
              <button className="secondary-button" onClick={() => void refreshRuns()} type="button">
                <RefreshCcw size={15} />
                Refresh runs
              </button>
              <button className="secondary-button" onClick={() => void refreshJobs()} type="button">
                <RefreshCcw size={15} />
                Refresh jobs
              </button>
            </section>
          </div>

          <div className="scene-lab-left-head">
            <section className="control-block scene-lab-intro">
              <div className="section-title">
                <Wand2 size={14} />
                Scene Lab
              </div>
              <p>Structured controls create synthetic BEV, front-view previews, and future video-generation requests.</p>
              <small>Diffusion video is planned here and remains separate from real-data metrics.</small>
            </section>
          </div>

          <div className="legacy-left-controls">
          <section className="control-block">
            <div className="section-title">
              <Database size={14} />
              数据集
            </div>
            <select
              className="select"
              value={sequence?.id ?? ''}
              onChange={(event) => {
                const id = event.target.value
                void runAction('Load sequence', () => api.sequence(id), (value) => {
                  setSequence(value)
                  setFrame(0)
                  setTravPrediction(null)
                  setTravPredictionFrame(null)
                  setTerrainLayerMode('semantic')
                })
              }}
            >
              {(datasets[0]?.sequences ?? ['seq_0001']).map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <input
              className="path-input"
              value={rugdPath}
              onChange={(event) => setRugdPath(event.target.value)}
              placeholder="RUGD root path"
            />
            <button className="secondary-button" onClick={importRugd} disabled={loading !== null || rugdPath.trim() === ''} type="button">
              <Upload size={15} />
              Import RUGD
            </button>
            {rugdImport ? <small className="model-note">Imported {rugdImport.imported_frames} frames as {rugdImport.sequence_id}</small> : null}
            <input
              className="path-input"
              value={tartanPath}
              onChange={(event) => setTartanPath(event.target.value)}
              placeholder="TartanDrive mini root path"
            />
            <button className="secondary-button" onClick={importTartanDrive} disabled={loading !== null || tartanPath.trim() === ''} type="button">
              <Upload size={15} />
              Import TartanDrive
            </button>
            {tartanImport ? <small className="model-note">Imported {tartanImport.imported_frames} frames as {tartanImport.sequence_id}</small> : null}
            <DatasetSourceCardPanel card={currentSourceCard} />
            <DatasetQualityPanel quality={currentQuality} />
          </section>

          <PillGroup label="地形" options={terrains} value={terrain} onChange={setTerrain} />
          <PillGroup label="土壤" options={soils} value={soil} onChange={setSoil} />
          <PillGroup label="天气" options={weathers} value={weather} onChange={setWeather} />
          <PillGroup label="场景" options={tasks} value={task} onChange={setTask} />

          <section className="control-block">
            <div className="section-title">
              <Wand2 size={14} />
              Prompt 生成
            </div>
            <textarea className="prompt-box" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            {promptWeatherConflict ? <small className="warning-note">Prompt and selected weather may conflict. Keep this output under synthetic provenance.</small> : null}
            <button className="primary-button" onClick={() => generateScene('front')} disabled={loading !== null} type="button">
              <Wand2 size={16} />
              Generate Image
            </button>
            <div className="scene-action-grid">
              <button className="secondary-button" onClick={() => generateScene('bev')} disabled={loading !== null} type="button">
                <Map size={15} />
                Generate BEV
              </button>
              <button className="secondary-button planned" disabled title="Planned diffusion adapter; no real video model is wired yet." type="button">
                <Route size={15} />
                Generate Video
              </button>
            </div>
          </section>

          <section className="button-stack compact-actions">
            <button onClick={saveAnnotation} disabled={loading !== null} type="button">
              <Tag size={15} />
              Save label
            </button>
            <small className="action-hint">Model and reconstruction actions are launched from Model Catalog.</small>
          </section>
          </div>
        </aside>

        <section className={`center-panel ${activePage}`}>
          <div className="view-toolbar">
            <div>
              <h1>{centerTitle}</h1>
              <span>{centerSubtitle}</span>
            </div>
            <SourceBadge provenance={viewProvenance} />
            {showExperimentViewport ? (
              <div className="view-tabs">
                {(['front', 'bev', 'terrain', 'trajectory', 'recon', 'predict', 'replay'] as const).map((view) => (
                  <button key={view} className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)} type="button">
                    {view}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="main-viewport">
            {activePage === 'dataset' ? (
              <div className="page-viewport dataset-workspace">
                <section className="page-card">
                  <div className="section-title">
                    <Database size={14} />
                    Source Card
                  </div>
                  <DatasetSourceCardPanel card={currentSourceCard} />
                </section>
                <section className="page-card">
                  <div className="section-title">
                    <Gauge size={14} />
                    Dataset Quality
                  </div>
                  <DatasetQualityPanel quality={currentQuality} />
                </section>
                <section className="page-card">
                  <div className="section-title">
                    <Layers size={14} />
                    Sequence Metadata
                  </div>
                  <JsonBlock value={sequence?.metadata ?? { status: 'NaN' }} />
                </section>
              </div>
            ) : null}
            {activePage === 'runs' ? (
              <div className="page-viewport runs-workspace">
                <section className="page-card wide">
                  <div className="section-title">
                    <Database size={14} />
                    Runs
                  </div>
                  <RunRegistryPanel runs={runs} source={runSource} onSourceChange={setRunSource} onSelectRun={openRunDetail} />
                </section>
                <section className="page-card">
                  <div className="section-title">
                    <Gauge size={14} />
                    Compare
                  </div>
                  <RunComparisonPanel comparison={comparison} kind={compareKind} onKindChange={setCompareKind} />
                </section>
                <section className="page-card">
                  <div className="section-title">
                    <RefreshCcw size={14} />
                    Jobs
                  </div>
                  <JobQueuePanel jobs={jobs} onRefresh={() => void refreshJobs()} onCancel={(jobId) => void cancelJob(jobId)} />
                </section>
              </div>
            ) : null}
            {showExperimentViewport && activeView === 'front' ? (
              mainImage ? <img src={mainImage} alt="front camera view" /> : <div className="empty-view">No frame</div>
            ) : null}
            {showExperimentViewport && activeView === 'bev' ? (
              <div className="map-grid">
                <MapImage title="Occupancy" src={occupancyImage} />
                <MapImage title="Risk" src={riskImage} />
              </div>
            ) : null}
            {showExperimentViewport && activeView === 'terrain' ? (
              <div className="terrain-stack">
                <div className="layer-switch">
                  <button className={!showSegmentResult ? 'active' : ''} onClick={() => setTerrainLayerMode('semantic')} type="button">
                    Dataset semantic
                  </button>
                  <button
                    className={showSegmentResult ? 'active' : ''}
                    disabled={!travPrediction}
                    onClick={() => setTerrainLayerMode('segment')}
                    title={travPredictionFrame !== null ? `Segment result belongs to frame ${travPredictionFrame + 1}` : 'No segment result yet'}
                    type="button"
                  >
                    Model segment {travPredictionFrame !== null ? `f${travPredictionFrame + 1}` : ''}
                  </button>
                  <span>
                    {terrainLayerMode === 'segment' && travPrediction && !segmentMatchesFrame
                      ? `Segment is single-frame: f${travPredictionFrame !== null ? travPredictionFrame + 1 : 'NaN'}, current f${frame + 1}. Showing dataset labels.`
                      : datasetSemanticImage
                        ? `Dataset label frame ${frame + 1}`
                        : 'No semantic label for this frame'}
                  </span>
                </div>
                <div className="map-grid four">
                  <MapImage title="Live frame" src={mainImage} />
                  <MapImage title={showSegmentResult ? `Segment overlay f${frame + 1}` : 'Semantic groups'} src={terrainSecondaryImage} />
                  <MapImage title={showSegmentResult ? `Traversability f${frame + 1}` : 'Traversability'} src={terrainTraversabilityImage} />
                  <MapImage title={showSegmentResult ? `Risk f${frame + 1}` : 'Risk'} src={terrainRiskImage} />
                </div>
              </div>
            ) : null}
            {showExperimentViewport && activeView === 'trajectory' ? (
              <div className="prediction-grid">
                <MapImage title="TinyTrajGRU prediction" src={trajectoryImage} />
                <div className="prediction-table">
                  <div className="section-title">Future trajectory</div>
                  <div className="motion-row">
                    <span>ADE</span>
                    <strong>{formatNumber(trajectoryAde, 2, 'm')}</strong>
                    <span>FDE</span>
                    <strong>{formatNumber(trajectoryFde, 2, 'm')}</strong>
                  </div>
                  {(trajPrediction?.predicted ?? []).slice(0, 8).map((row) => (
                    <div className="motion-row" key={row.step}>
                      <span>t+{row.step}</span>
                      <strong>x {row.x}</strong>
                      <strong>y {row.y}</strong>
                      <strong>v {row.speed}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {showExperimentViewport && activeView === 'recon' ? (
              <div className="map-grid three">
                <MapImage title="Heightmap" src={heightmapImage} />
                <MapImage title="Traversability" src={reconstruction?.assets.traversability ?? scene?.assets.traversability ?? ''} />
                <MapImage title="Risk" src={riskImage} />
              </div>
            ) : null}
            {showExperimentViewport && activeView === 'predict' ? (
              <div className="prediction-grid">
                <MapImage title="Future trajectory" src={predictionImage} />
                <div className="prediction-table">
                  <div className="section-title">Ego motion</div>
                  {(prediction?.ego_motion ?? []).slice(0, 7).map((row) => (
                    <div className="motion-row" key={row.step}>
                      <span>t+{row.step}</span>
                      <strong>x {row.x}</strong>
                      <strong>y {row.y}</strong>
                      <strong>yaw {row.yaw}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {showExperimentViewport && activeView === 'replay' ? <ReplayMap replay={replay} /> : null}

            {showExperimentViewport ? <div className="hud-strip">
              <span>Speed <b>NaN</b></span>
              <span>Steer <b>NaN</b></span>
              <span>Pitch <b>NaN</b></span>
              <span>Algo <b>NaN</b></span>
              <span>Traversable <b>{formatPercent(traversableRatio)}</b></span>
              <span>Uncertainty <b>{formatPercent(uncertainty)}</b></span>
            </div> : null}
          </div>

          {showExperimentViewport ? <div className="status-bar">
            <StatusGauge label="俯仰角" value="NaN" percent={0} color="#19724d" />
            <StatusGauge label="横滚角" value="NaN" percent={0} color="#a97822" />
            <StatusGauge label="可穿越性" value={formatPercent(traversableRatio)} percent={isFiniteNumber(traversableRatio) ? traversableRatio * 100 : 0} color="#0f7a54" />
            <StatusGauge label="LiDAR" value="NaN" percent={0} color="#174c96" />
            <StatusGauge label="Battery" value="NaN" percent={0} color="#207448" />
          </div> : null}
        </section>

        <aside className="right-panel">
          <div className="scene-lab-right">
            <section className="right-section">
              <div className="section-title">
                <Wand2 size={14} />
                Generation Outputs
                <SourceBadge provenance={scene?.provenance} />
              </div>
              <MetricSummary metrics={scene?.metrics ?? { bev: Number.NaN, image: Number.NaN, video: Number.NaN }} />
              <small className="model-note">Video diffusion is an explicit planned adapter. Until wired, video output stays NaN and produces no run.</small>
            </section>
            <section className="right-section">
              <div className="section-title">
                <Layers size={14} />
                Scene Spec
              </div>
              <JsonBlock value={{ terrain, soil, weather, task, prompt, video_generation: 'planned' }} />
            </section>
          </div>

          <div className="dataset-right">
            <section className="right-section">
              <div className="section-title">
                <Brain size={14} />
                Dataset-Enabled Models
              </div>
              <ModelCatalogPanel items={runtimeModelCatalog} onLaunch={launchCatalogAction} />
            </section>
          </div>

          <div className="runs-right">
            <section className="right-section">
              <div className="section-title">
                <Gauge size={14} />
                Compare
              </div>
              <RunComparisonPanel comparison={comparison} kind={compareKind} onKindChange={setCompareKind} />
            </section>
          </div>

          <div className="dashboard-right">
          <section className="right-section">
            <div className="section-title">
              <Brain size={14} />
              算法选择
            </div>
            <ModelCatalogPanel items={runtimeModelCatalog} onLaunch={launchCatalogAction} />
          </section>

          <section className="right-section">
            <div className="section-title">
              <Database size={14} />
              Runs
            </div>
            <RunRegistryPanel runs={runs} source={runSource} onSourceChange={setRunSource} onSelectRun={openRunDetail} />
          </section>

          <section className="right-section">
            <div className="section-title">
              <RefreshCcw size={14} />
              Jobs
            </div>
            <JobQueuePanel jobs={jobs} onRefresh={() => void refreshJobs()} onCancel={(jobId) => void cancelJob(jobId)} />
          </section>

          <section className="right-section">
            <div className="section-title">
              <Gauge size={14} />
              Compare
            </div>
            <RunComparisonPanel comparison={comparison} kind={compareKind} onKindChange={setCompareKind} />
          </section>

          <section className="right-section">
            <div className="section-title">
              <Activity size={14} />
              任务统计
              <SourceBadge provenance={metricProvenance} />
            </div>
            <div className="metric-grid">
              <MetricTile label="成功率" value={formatPercent(successRate)} />
              <MetricTile label="碰撞率" value={formatPercent(collisionRate)} tone="red" />
              <MetricTile label="里程" value={formatNumber(pathLength, 1, 'm')} tone="blue" />
              <MetricTile label="地形风险" value={formatPercent(terrainRisk)} tone="red" />
            </div>
          </section>

          <section className="right-section">
            <div className="section-title">
              <Gauge size={14} />
              训练曲线
              <SourceBadge provenance={trajTrain?.provenance ?? travTrain?.provenance ?? wmTrain?.provenance} />
            </div>
            <MiniCurve data={trainCurveData} field={trainCurveField} color="#176b48" />
            {travTrain ? <small className="model-note">Terrain model {travTrain.run_id} · {travTrain.backend} · {travTrain.sample_count} samples · {travTrain.provenance.label}</small> : null}
            {trajTrain ? <small className="model-note">Trajectory model {trajTrain.run_id} · {trajTrain.backend} · {trajTrain.sample_count} windows · {trajTrain.provenance.label}</small> : null}
            <div className="bar-list">
              {algorithms.map((item) => (
                <div className="bar-row" key={item.name}>
                  <span>{item.name}</span>
                  <div>
                    <i style={{ width: barWidth(item.score), background: item.color }} />
                  </div>
                  <b>{displayScore(item.score)}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="right-section">
            <div className="section-title">
              <Layers size={14} />
              事件日志
            </div>
            <div className="event-list">
              {(replay?.events ?? []).map((event, index) => (
                <div className={`event ${event.severity ?? 'info'}`} key={`${event.message}-${index}`}>
                  <span>{event.message}</span>
                  <b>{event.severity ?? 'info'}</b>
                </div>
              ))}
            </div>
          </section>

          <section className="right-section vehicle-section">
            <div className="section-title">
              <Car size={14} />
              车辆导入
            </div>
            <input value={vehicleDraft.name} onChange={(event) => setVehicleDraft({ ...vehicleDraft, name: event.target.value })} />
            <div className="vehicle-grid">
              <NumberInput label="轴距" value={vehicleDraft.wheelbase} onChange={(wheelbase) => setVehicleDraft({ ...vehicleDraft, wheelbase })} />
              <NumberInput label="质量" value={vehicleDraft.mass} onChange={(mass) => setVehicleDraft({ ...vehicleDraft, mass })} />
              <NumberInput label="转角" value={vehicleDraft.max_steer} onChange={(max_steer) => setVehicleDraft({ ...vehicleDraft, max_steer })} />
              <NumberInput label="速度" value={vehicleDraft.max_speed} onChange={(max_speed) => setVehicleDraft({ ...vehicleDraft, max_speed })} />
            </div>
            <button className="secondary-button" onClick={saveVehicle} disabled={loading !== null} type="button">
              <Save size={15} />
              Save vehicle
            </button>
            <small>{vehicles.length} configs</small>
          </section>
          </div>
        </aside>
      </div>

      {loading ? (
        <div className="run-indicator">
          <RefreshCcw size={15} />
          {loading}
        </div>
      ) : null}
      <RunDetailDrawer run={selectedRun} exported={runExport} onClose={() => setSelectedRun(null)} />
    </main>
  )
}

function MapImage({ title, src }: { title: string; src: string }) {
  return (
    <figure className="map-image">
      <figcaption>{title}</figcaption>
      {src ? <img src={src} alt={title} /> : <div className="empty-view">No map</div>}
    </figure>
  )
}

function StatusGauge({ label, value, percent, color }: { label: string; value: string; percent: number; color: string }) {
  const width = isFiniteNumber(percent) ? Math.max(0, Math.min(100, percent)) : 0
  return (
    <div className="status-gauge">
      <span>{label}</span>
      <strong>{value}</strong>
      <div>
        <i style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="number-input">
      <span>{label}</span>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

export default App
