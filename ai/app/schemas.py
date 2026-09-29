"""Request bodies for the worker API (validated, extra fields forbidden)."""

from typing import Literal
from datetime import date
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class Payload(BaseModel):
    model_config = ConfigDict(extra='forbid')


class TestLogin(Payload):
    role: Literal['officer', 'head_of_department', 'director', 'admin']


class LegalQuestion(Payload):
    question: str = Field(min_length=5, max_length=2000)
    useModel: bool = True


class CatalogMutation(Payload):
    revision: int = Field(default=1, ge=1)
    values: dict = Field(max_length=30)


class CreateCase(Payload):
    name: str = Field(min_length=3, max_length=300)
    province: str = Field(min_length=2, max_length=100)
    legalDate: date
    projectId: str | None = None
    procedure: Literal['bcnckt', 'gpxd', 'nghiem_thu'] = 'bcnckt'
    projectName: str | None = Field(default=None, max_length=500)
    projectCode: str | None = Field(default=None, max_length=100)


class CreateProject(Payload):
    code: str = Field(min_length=3, max_length=100)
    title: str = Field(min_length=3, max_length=500)
    field: str = Field(min_length=2, max_length=100)
    group_type: Literal['A', 'B', 'C', 'QG']
    grade: Literal['I', 'II', 'III', 'IV', 'DB']
    investment_cost: int = Field(ge=0, le=9_000_000_000_000_000)
    investor_id: str | None = Field(default=None, max_length=100)
    location: str = Field(min_length=2, max_length=300)


class AddProjectImage(Payload):
    revision: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=240)
    category: Literal['phoi_canh', 'hien_trang', 'ban_ve', 'tien_do']
    description: str = Field(default='', max_length=2000)
    url: str = Field(default='', max_length=2000)
    contentBase64: str | None = Field(default=None, max_length=7_000_000)


class Mutation(Payload):
    revision: int = Field(ge=1)


class Supplement(Mutation):
    requestId: UUID
    name: str = Field(min_length=3, max_length=300)
    legalDate: date
    reason: str = Field(min_length=10, max_length=3000)


class ProjectLink(Mutation):
    projectId: str = Field(min_length=1, max_length=100)
    projectName: str = Field(min_length=3, max_length=500)
    projectCode: str = Field(min_length=1, max_length=100)


class Upload(Mutation):
    requirementId: str = Field(max_length=80)
    name: str = Field(min_length=1, max_length=240)
    contentBase64: str = Field(max_length=26_000_000)
    role: Literal['submission', 'reference'] = 'submission'


class PrepareUpload(Mutation):
    requirementId: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=240)
    size: int = Field(ge=1, le=18 * 1024 * 1024)
    sha256: str = Field(pattern='^[a-f0-9]{64}$')
    role: Literal['submission', 'reference'] = 'submission'


class FactReview(Mutation):
    decision: Literal['confirmed', 'rejected']
    value: str = Field(max_length=500)
    note: str = Field(min_length=1, max_length=1500)


class RunRequest(Mutation):
    mode: Literal['intake', 'comparison'] = 'intake'
    useModel: bool = False


class Review(Mutation):
    decision: Literal['accept', 'reject', 'defer']
    note: str = Field(min_length=3, max_length=3000)


class RequirementReview(Mutation):
    status: Literal['submitted', 'verified', 'needs_supplement']
    note: str = Field(min_length=3, max_length=2000)


class AddRequirement(Mutation):
    name: str = Field(min_length=3, max_length=200)
    category: str = Field(min_length=2, max_length=80)


class AcceptChecklist(Mutation):
    candidateId: str = Field(max_length=80)


class Consultation(Mutation):
    text: str = Field(min_length=3, max_length=3000)
    response: str = Field(max_length=4000, default='')


class FinalReview(Mutation):
    decision: Literal['request_supplement', 'reviewed']
    note: str = Field(min_length=3, max_length=3000)


class ReopenReview(Mutation):
    note: str = Field(min_length=10, max_length=3000)


class WorkflowCommand(Mutation):
    action: Literal[
        'start',
        'request_supplement',
        'suspend',
        'resume',
        'extend',
        'reject_intake',
        'stop',
        'submit_review',
        'return',
        'approve',
        'schedule_visit',
        'require_correction',
        'confirm_correction',
    ]
    note: str = Field(min_length=10, max_length=3000)
    visitDate: date | None = None


class Assignment(Mutation):
    assigneeId: UUID
    note: str = Field(min_length=10, max_length=3000)
    deadline: date | None = None


class LegalContextReview(Mutation):
    submissionDate: date
    scope: Literal['construction', 'decision_maker', 'concurrent', 'unknown']
    stage: Literal['original', 'amendment', 'remaining_phase']
    priorStatus: Literal['unknown', 'eligible_pending', 'ineligible', 'result_ineligible', 'result_eligible']
    note: str = Field(min_length=10, max_length=3000)


class LegalRequirementReview(Mutation):
    applicability: Literal['applicable', 'not_applicable', 'unknown']
    requirementIds: list[str] = Field(max_length=30)
    note: str = Field(min_length=10, max_length=3000)
