from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import ARTIFACT_ROOT, DATA_ROOT, REPO_ROOT, ensure_runtime_dirs
from .schemas import (
    AnnotationRecord,
    AnnotationRequest,
    DatasetImportRequest,
    DatasetSummary,
    EvaluationResponse,
    JobLaunchRequest,
    JobLaunchResponse,
    JobRecord,
    ReconstructionRequest,
    ReconstructionResponse,
    ReplayResponse,
    RunComparisonResponse,
    RlTrainRequest,
    RlTrainResponse,
    RUGDImportRequest,
    RUGDImportResponse,
    RunExportResponse,
    RunRecord,
    SceneGenerateRequest,
    SceneGenerateResponse,
    DatasetSourceCard,
    SequenceDetail,
    SequenceQuality,
    ModelCatalogItem,
    TraversabilityPredictRequest,
    TraversabilityPredictResponse,
    TraversabilityTrainRequest,
    TraversabilityTrainResponse,
    TrajectoryPredictRequest,
    TrajectoryPredictResponse,
    TrajectoryTrainRequest,
    TrajectoryTrainResponse,
    TartanDriveImportRequest,
    TartanDriveImportResponse,
    Vehicle,
    WorldModelPredictRequest,
    WorldModelPredictResponse,
    WorldModelTrainRequest,
    WorldModelTrainResponse,
)
from .services.annotations import save_annotation
from .services.datasets import dataset_quality, dataset_source_cards, get_sequence, scan_dataset, sequence_quality, sequence_source_card
from .services.evaluation import evaluate_run
from .services.jobs import cancel_job_record, get_job_record, launch_job, list_job_records
from .services.model_catalog import model_catalog
from .services.public_datasets import import_rugd_dataset, import_tartandrive_dataset
from .services.reconstruction import run_reconstruction
from .services.rl import get_replay, train_rl
from .services.runs import compare_run_records, export_run_record, get_run_record, list_run_records
from .services.scenes import generate_scene
from .services.trajectory import predict_trajectory, train_trajectory
from .services.traversability import predict_sequence_traversability, train_traversability
from .services.vehicles import get_vehicles, save_vehicle
from .services.world_model import predict_world_model, train_world_model
from .storage import init_db

if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.scene_generation import generate_demo_sequence  # noqa: E402


def ensure_demo_dataset() -> None:
    metadata = DATA_ROOT / "sequences" / "seq_0001" / "metadata.json"
    semantic = DATA_ROOT / "sequences" / "seq_0001" / "labels" / "semantic_0000.png"
    if not metadata.exists() or not semantic.exists():
        generate_demo_sequence(DATA_ROOT)


app = FastAPI(title="OR-WM Studio API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    ensure_runtime_dirs()
    ensure_demo_dataset()
    init_db()


ensure_runtime_dirs()
ensure_demo_dataset()
app.mount("/assets", StaticFiles(directory=DATA_ROOT), name="assets")
app.mount("/artifacts", StaticFiles(directory=ARTIFACT_ROOT), name="artifacts")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "data_root": str(DATA_ROOT), "artifact_root": str(ARTIFACT_ROOT)}


@app.get("/api/datasets", response_model=list[DatasetSummary])
def list_datasets() -> list[DatasetSummary]:
    ensure_demo_dataset()
    return [scan_dataset()]


@app.get("/api/runs", response_model=list[RunRecord])
def list_runs(source: str | None = None, kind: str | None = None, limit: int = 50) -> list[RunRecord]:
    return list_run_records(source=source, kind=kind, limit=max(1, min(limit, 200)))


@app.get("/api/runs/compare", response_model=RunComparisonResponse)
def compare_runs(source: str | None = None, kind: str | None = None, limit: int = 30) -> RunComparisonResponse:
    return compare_run_records(source=source, kind=kind, limit=max(1, min(limit, 200)))


@app.get("/api/runs/{run_id}", response_model=RunRecord)
def read_run(run_id: str) -> RunRecord:
    return get_run_record(run_id)


@app.get("/api/runs/{run_id}/export", response_model=RunExportResponse)
def export_run(run_id: str) -> RunExportResponse:
    return export_run_record(run_id)


@app.get("/api/jobs", response_model=list[JobRecord])
def list_jobs(status: str | None = None, kind: str | None = None, limit: int = 50) -> list[JobRecord]:
    return list_job_records(status=status, kind=kind, limit=max(1, min(limit, 200)))


@app.get("/api/jobs/{job_id}", response_model=JobRecord)
def read_job(job_id: str) -> JobRecord:
    return get_job_record(job_id)


@app.post("/api/jobs/{job_id}/cancel", response_model=JobRecord)
def cancel_job(job_id: str) -> JobRecord:
    return cancel_job_record(job_id)


@app.post("/api/jobs/launch", response_model=JobLaunchResponse)
def create_job_launch(payload: JobLaunchRequest) -> JobLaunchResponse:
    return launch_job(payload)


@app.post("/api/datasets", response_model=DatasetSummary)
def import_dataset(payload: DatasetImportRequest) -> DatasetSummary:
    root = Path(payload.root_path).resolve() if payload.root_path else DATA_ROOT
    if not root.exists():
        raise HTTPException(status_code=404, detail=f"Dataset root not found: {root}")
    return scan_dataset(root=root, dataset_id=payload.name.lower().replace(" ", "_"), name=payload.name)


@app.post("/api/public-datasets/rugd/import", response_model=RUGDImportResponse)
def import_rugd(payload: RUGDImportRequest) -> RUGDImportResponse:
    try:
        return import_rugd_dataset(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/public-datasets/tartandrive/import", response_model=TartanDriveImportResponse)
def import_tartandrive(payload: TartanDriveImportRequest) -> TartanDriveImportResponse:
    try:
        return import_tartandrive_dataset(payload)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/sequences/{sequence_id}", response_model=SequenceDetail)
def read_sequence(sequence_id: str) -> SequenceDetail:
    try:
        return get_sequence(sequence_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/sequences/{sequence_id}/quality", response_model=SequenceQuality)
def read_sequence_quality(sequence_id: str) -> SequenceQuality:
    try:
        return sequence_quality(sequence_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/sequences/{sequence_id}/source-card", response_model=DatasetSourceCard)
def read_sequence_source_card(sequence_id: str) -> DatasetSourceCard:
    try:
        return sequence_source_card(sequence_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/datasets/quality", response_model=list[SequenceQuality])
def read_dataset_quality() -> list[SequenceQuality]:
    return dataset_quality()


@app.get("/api/datasets/source-cards", response_model=list[DatasetSourceCard])
def read_dataset_source_cards() -> list[DatasetSourceCard]:
    return dataset_source_cards()


@app.get("/api/model-catalog", response_model=list[ModelCatalogItem])
def read_model_catalog(sequence_id: str = "seq_0001") -> list[ModelCatalogItem]:
    try:
        return model_catalog(sequence_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/annotations", response_model=AnnotationRecord)
def create_annotation(payload: AnnotationRequest) -> AnnotationRecord:
    return save_annotation(payload)


@app.post("/api/scenes/generate", response_model=SceneGenerateResponse)
def create_scene(payload: SceneGenerateRequest) -> SceneGenerateResponse:
    return generate_scene(payload)


@app.post("/api/reconstruction/run", response_model=ReconstructionResponse)
def create_reconstruction(payload: ReconstructionRequest) -> ReconstructionResponse:
    try:
        return run_reconstruction(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/world-model/train", response_model=WorldModelTrainResponse)
def create_world_model_training(payload: WorldModelTrainRequest) -> WorldModelTrainResponse:
    return train_world_model(payload)


@app.post("/api/world-model/predict", response_model=WorldModelPredictResponse)
def create_world_model_prediction(payload: WorldModelPredictRequest) -> WorldModelPredictResponse:
    return predict_world_model(payload)


@app.post("/api/traversability/train", response_model=TraversabilityTrainResponse)
def create_traversability_training(payload: TraversabilityTrainRequest) -> TraversabilityTrainResponse:
    try:
        return train_traversability(payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/traversability/predict", response_model=TraversabilityPredictResponse)
def create_traversability_prediction(payload: TraversabilityPredictRequest) -> TraversabilityPredictResponse:
    return predict_sequence_traversability(payload)


@app.post("/api/trajectory/train", response_model=TrajectoryTrainResponse)
def create_trajectory_training(payload: TrajectoryTrainRequest) -> TrajectoryTrainResponse:
    try:
        return train_trajectory(payload)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/trajectory/predict", response_model=TrajectoryPredictResponse)
def create_trajectory_prediction(payload: TrajectoryPredictRequest) -> TrajectoryPredictResponse:
    try:
        return predict_trajectory(payload)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/rl/train", response_model=RlTrainResponse)
def create_rl_training(payload: RlTrainRequest) -> RlTrainResponse:
    return train_rl(payload)


@app.get("/api/rl/replay/{run_id}", response_model=ReplayResponse)
def read_replay(run_id: str) -> ReplayResponse:
    return get_replay(run_id)


@app.get("/api/vehicles", response_model=list[Vehicle])
def list_vehicle_configs() -> list[Vehicle]:
    return get_vehicles()


@app.post("/api/vehicles", response_model=Vehicle)
def create_vehicle_config(payload: Vehicle) -> Vehicle:
    return save_vehicle(payload)


@app.get("/api/evaluate/{run_id}", response_model=EvaluationResponse)
def read_evaluation(run_id: str) -> EvaluationResponse:
    return evaluate_run(run_id)
