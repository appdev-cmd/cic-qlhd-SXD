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


def _settings(actor_id):
    """Transaction-local timeout and actor settings as one SQL statement (actor is a validated UUID literal)."""
    try:
        actor = str(uuid.UUID(str(actor_id))) if actor_id else None
    except ValueError:
        raise HTTPException(403, 'Danh tính tài khoản không hợp lệ.') from None
    sql = "select set_config('statement_timeout','15000',true)"
    if actor:
        sql += f", set_config('request.jwt.claim.sub','{actor}',true)"
    return sql


def _url():
    url = os.getenv('APPRAISAL_DATABASE_URL')
    if not url:
        raise HTTPException(503, 'Chưa cấu hình kết nối database cho backend.')
    return url


def _checkout(pool, first_statement):
    """Borrow a connection and run its first statement; retry once on a connection the pooler dropped.

    Replaces a per-checkout health probe, which cost one extra network round trip per request.
    """
    for attempt in range(2):
        con = pool.getconn()
        try:
            return con, con.execute(first_statement)
        except psycopg.OperationalError:
            pool.putconn(con)  # broken connections are discarded by the pool
            if attempt or not con.broken:
                raise


@contextmanager
def _errors():
    try:
        yield
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


@contextmanager
def connection(actor_id=None):
    """Read/write transaction: BEGIN and settings in one round trip, then COMMIT or ROLLBACK."""
    begin = 'begin; ' + _settings(actor_id)
    with _errors():
        pool = _pool(_url())
        con, _ = _checkout(pool, begin)
        try:
            yield con
        except BaseException:
            try:
                con.execute('rollback')
            except psycopg.Error:
                pass  # broken connection: the pool discards it
            raise
        else:
            con.execute('commit')
        finally:
            pool.putconn(con)


def read(actor_id, *statements):
    """Run read-only (sql, params) statements under the actor's RLS scope in ONE network round trip.

    Statements are sent as a single simple-query message, which PostgreSQL executes as one implicit
    transaction; set_config(..., true) therefore applies to every statement and is cleared afterwards.
    Parameters are bound client-side with psycopg's quoting. Returns one list of rows per statement.
    """
    with _errors():
        pool = _pool(_url())
        con = pool.getconn()
        try:
            cursor = psycopg.ClientCursor(con, row_factory=dict_row)
            text = ';\n'.join([_settings(actor_id)] + [cursor.mogrify(sql, params) for sql, params in statements])
            try:
                cursor.execute(text)
            except psycopg.OperationalError:
                if not con.broken:
                    raise  # e.g. statement timeout: do not run the statements twice
                pool.putconn(con)
                con = pool.getconn()
                cursor = psycopg.ClientCursor(con, row_factory=dict_row)
                cursor.execute(text)
            results = []
            while True:
                results.append(cursor.fetchall() if cursor.description else [])
                if not cursor.nextset():
                    break
            return results[1:]
        finally:
            pool.putconn(con)
