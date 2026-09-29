"""Building permit consultation, issuance, register, revocation (NĐ 217/2026 Điều 49, 54, 63–66)."""

from fastapi import APIRouter, Depends

from ..deps import edit, save, store
from ..permits import ConsultationCommand, PermitCommand
from ..store import MODE, Store

router = APIRouter()


def _register(s):
    from ..permits import register

    return register(s.permit_records(), s.calendar())


@router.get('/v1/permits')
def permit_register(s: Store = Depends(store)):
    return {'items': _register(s)}


@router.get('/v1/cases/{id}/permit')
def permit_state(id: str, s: Store = Depends(store)):
    from ..permits import view

    case = s.get(id)
    result = view(case, s.calendar())
    if 'issue' in result['actions'] and result['subtype'] in ('amendment', 'extension', 'reissue'):
        result['basePermits'] = [
            {'number': p['number'], 'projectName': p['projectName'], 'status': p['statusLabel']}
            for p in _register(s)
            if p['projectId'] == case.get('projectId')
        ]
    return result


@router.post('/v1/cases/{id}/consultations/permit')
def permit_consultation(id: str, body: ConsultationCommand, s: Store = Depends(store)):
    from ..permits import consult

    case = edit(s, id, body.revision)
    label = consult(case, s.actor, body, s.calendar())
    return save(s, case, body.revision, label, body.subject or body.response)


@router.post('/v1/cases/{id}/permit')
def permit_action(id: str, body: PermitCommand, s: Store = Depends(store)):
    from ..permits import act

    case = edit(s, id, body.revision)
    registry = _register(s) if body.action == 'issue' else []
    label = act(case, s.actor, body, registry, s.calendar(), MODE == 'demo')
    detail = ' — '.join(x for x in (body.reference, body.note) if x) or label
    return save(s, case, body.revision, label, detail)
