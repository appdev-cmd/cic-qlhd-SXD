"""Backend-only PostgreSQL connections with transaction-scoped Auth identity and RLS.

Connections come from a small pool so each request does not pay a new TLS
handshake to the Supabase pooler. BEGIN and the transaction-local settings
(statement timeout, actor id) travel in one round trip; set_config(..., true)
is cleared at COMMIT/ROLLBACK, so a pooled connection never carries identity
over to the next request.
"""

from contextlib import contextmanager
import os
import threading
import uuid
import certifi
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool, PoolTimeout
from fastapi import HTTPException

_pools = {}
_lock = threading.Lock()


def _pool(url):
    with _lock:
        pool = _pools.get(url)
        if pool is None:
            pool = ConnectionPool(
                url,
                open=True,
                name='appraisal',
                min_size=int(os.getenv('APPRAISAL_DB_POOL_MIN', '1')),
                max_size=int(os.getenv('APPRAISAL_DB_POOL_MAX', '8')),
                timeout=15,
                max_idle=300,
                check=ConnectionPool.check_connection,
                kwargs={
                    'connect_timeout': 10,
                    'sslmode': 'verify-full',
                    'autocommit': True,
                    'sslrootcert': os.getenv('APPRAISAL_DATABASE_CA', certifi.where()),
                    'row_factory': dict_row,
                    'prepare_threshold': None,
                },
            )
            _pools[url] = pool
        return pool


def close_pools():
    with _lock:
        for pool in _pools.values():
            pool.close()
        _pools.clear()


@contextmanager
def connection(actor_id=None):
    url = os.getenv('APPRAISAL_DATABASE_URL')
    if not url:
        raise HTTPException(503, 'Chưa cấu hình kết nối database cho backend.')
    try:
        actor = str(uuid.UUID(str(actor_id))) if actor_id else None
    except ValueError:
        raise HTTPException(403, 'Danh tính tài khoản không hợp lệ.') from None
    # Parameters are not allowed in a multi-statement query; the actor is a validated UUID literal.
    begin = "begin; select set_config('statement_timeout','15000',true)"
    if actor:
        begin += f", set_config('request.jwt.claim.sub','{actor}',true)"
    try:
        with _pool(url).connection() as con:
            con.execute(begin)
            try:
                yield con
            except BaseException:
                try:
                    con.execute('rollback')
                except psycopg.Error:
                    pass  # broken connection: the pool discards it
                raise
            con.execute('commit')
    except PoolTimeout:
        raise HTTPException(503, 'Kết nối dữ liệu đang bận. Vui lòng thử lại.') from None
    except psycopg.errors.SerializationFailure:
        raise HTTPException(409, 'Hồ sơ đã thay đổi. Tải lại trước khi lưu.') from None
    except psycopg.errors.InsufficientPrivilege:
        raise HTTPException(403, 'Thao tác nằm ngoài phạm vi quyền của tài khoản.') from None
    except psycopg.errors.UniqueViolation:
        raise HTTPException(409, 'Mã đã tồn tại. Vui lòng dùng mã khác.') from None
    except (psycopg.errors.CheckViolation, psycopg.errors.InvalidParameterValue):
        raise HTTPException(422, 'Dữ liệu không đáp ứng điều kiện lưu hồ sơ.') from None
    except psycopg.Error:
        raise HTTPException(503, 'Không thể hoàn thành giao dịch dữ liệu. Vui lòng thử lại.') from None
