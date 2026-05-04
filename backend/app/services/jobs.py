from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from ..schemas import (
    JobLaunchRequest,
    JobLaunchResponse,
    JobRecord,
    ReconstructionRequest,
    RlTrainRequest,
    SceneGenerateRequest,
    TrajectoryPredictRequest,
    TrajectoryTrainRequest,
    TraversabilityPredictRequest,
    TraversabilityTrainRequest,
    WorldModelPredictRequest,
    WorldModelTrainRequest,
)
from ..storage import get_job as storage_get_job
from ..storage import list_jobs as storage_list_jobs
from ..storage import put_job, utc_now
from .reconstruction import run_reconstruction
from .rl import train_rl
from .scenes import generate_scene
from .trajectory import predict_trajectory, train_trajectory
from .traversability import predict_sequence_traversability, train_traversability
from .world_model import predict_world_model, train_world_model


JobHandler = Callable[[dict[str, Any]], BaseModel]


def _call_scene(body: dict[str, Any]) -> BaseModel:
    return generate_scene(SceneGenerateRequest.model_validate(body))


def _call_reconstruction(body: dict[str, Any]) -> BaseModel:
    return run_reconstruction(ReconstructionRequest.model_validate(body))


def _call_world_model_train(body: dict[str, Any]) -> BaseModel:
    return train_world_model(WorldModelTrainRequest.model_validate(body))


def _call_world_model_predict(body: dict[str, Any]) -> BaseModel:
    return predict_world_model(WorldModelPredictRequest.model_validate(body))


def _call_traversability_train(body: dict[str, Any]) -> BaseModel:
    return train_traversability(TraversabilityTrainRequest.model_validate(body))


def _call_traversability_predict(body: dict[str, Any]) -> BaseModel:
    return predict_sequence_traversability(TraversabilityPredictRequest.model_validate(body))


def _call_trajectory_train(body: dict[str, Any]) -> BaseModel:
    return train_trajectory(TrajectoryTrainRequest.model_validate(body))


def _call_trajectory_predict(body: dict[str, Any]) -> BaseModel:
    return predict_trajectory(TrajectoryPredictRequest.model_validate(body))


def _call_rl_train(body: dict[str, Any]) -> BaseModel:
    return train_rl(RlTrainRequest.model_validate(body))


JOB_HANDLERS: dict[str, tuple[str, JobHandler]] = {
    "/api/scenes/generate": ("scene_generation", _call_scene),
    "/api/reconstruction/run": ("reconstruction", _call_reconstruction),
    "/api/world-model/train": ("world_model_train", _call_world_model_train),
    "/api/world-model/predict": ("world_model_predict", _call_world_model_predict),
    "/api/traversability/train": ("traversability_train", _call_traversability_train),
    "/api/traversability/predict": ("traversability_predict", _call_traversability_predict),
    "/api/trajectory/train": ("trajectory_train", _call_trajectory_train),
    "/api/trajectory/predict": ("trajectory_predict", _call_trajectory_predict),
    "/api/rl/train": ("rl_train", _call_rl_train),
}


def _job_id(label: str, endpoint: str, body: dict[str, Any]) -> str:
    now = utc_now()
    digest = hashlib.sha1(json.dumps({"label": label, "endpoint": endpoint, "body": body, "now": now}, sort_keys=True).encode("utf-8")).hexdigest()[:10]
    return f"job_{digest}"


def _extract_sequence_id(body: dict[str, Any], result: dict[str, Any] | None = None) -> str | None:
    if isinstance(body.get("sequence_id"), str):
        return body["sequence_id"]
    if result and isinstance(result.get("sequence_id"), str):
        return result["sequence_id"]
    return None


def _extract_run_id(result: dict[str, Any]) -> str | None:
    for key in ("run_id", "scene_id", "prediction_id"):
        value = result.get(key)
        if isinstance(value, str):
            return value
    return None


def _extract_source(result: dict[str, Any]) -> str | None:
    provenance = result.get("provenance")
    if isinstance(provenance, dict) and isinstance(provenance.get("source"), str):
        return provenance["source"]
    return None


def _update_job(job: JobRecord, **updates: Any) -> JobRecord:
    payload = job.model_dump()
    payload.update(updates)
    payload["updated_at"] = utc_now()
    updated = JobRecord(**payload)
    return put_job(updated)


def launch_job(payload: JobLaunchRequest) -> JobLaunchResponse:
    if payload.method != "POST":
        raise HTTPException(status_code=400, detail="Job launch currently supports POST actions only.")
    mapped = JOB_HANDLERS.get(payload.endpoint)
    if mapped is None:
        raise HTTPException(status_code=400, detail=f"Endpoint is not job-launchable: {payload.endpoint}")
    kind, handler = mapped
    now = utc_now()
    job = JobRecord(
        job_id=_job_id(payload.label, payload.endpoint, payload.body),
        kind=kind,
        label=payload.label,
        endpoint=payload.endpoint,
        method=payload.method,
        status="queued",
        sequence_id=_extract_sequence_id(payload.body),
        request=payload.body,
        created_at=now,
        updated_at=now,
    )
    job = put_job(job)
    job = _update_job(job, status="running")
    try:
        result_model = handler(payload.body)
        result = result_model.model_dump()
        job = _update_job(
            job,
            status="completed",
            result=result,
            run_id=_extract_run_id(result),
            sequence_id=_extract_sequence_id(payload.body, result),
            source=_extract_source(result),
        )
        return JobLaunchResponse(job=job, result=result)
    except Exception as exc:
        job = _update_job(job, status="failed", error=str(exc))
        raise HTTPException(status_code=400, detail={"job": job.model_dump(), "error": str(exc)}) from exc


def list_job_records(status: str | None = None, kind: str | None = None, limit: int = 50) -> list[JobRecord]:
    return storage_list_jobs(status=status, kind=kind, limit=limit)


def get_job_record(job_id: str) -> JobRecord:
    job = storage_get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return job
