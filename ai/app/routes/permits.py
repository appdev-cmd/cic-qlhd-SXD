"""Building permit consultation, issuance, register, revocation (NĐ 217/2026 Điều 49, 54, 63–66)."""

from fastapi import APIRouter, Depends

from ..deps import edit, save, store
from ..permits import ConsultationCommand, PermitCommand
from ..store import MODE, Store

router = APIRouter()


def _register(s):
    from ..permits import register

    return register(s.permit_records(), s.calendar(), starts=s.start_dates())


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

    detail = ' — '.join(x for x in (body.reference, body.note) if x)
    if body.action != 'issue':
        case = edit(s, id, body.revision, after_review=True)
        label = act(case, s.actor, body, [], s.calendar(), MODE == 'demo')
        return save(s, case, body.revision, label, detail or label)
    # Issuing allocates the next permit number: the register is read and the case saved under one lock so two
    # concurrent issues cannot both take the same number.
    with s.permit_issue_lock():
        case = edit(s, id, body.revision, after_review=True)
        label = act(case, s.actor, body, _register(s), s.calendar(), MODE == 'demo')
        return save(s, case, body.revision, label, detail or label)
