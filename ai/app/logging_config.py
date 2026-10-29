"""One-line stdlib logging for the worker: timestamp, level, logger, message (plus traceback when present)."""

import logging
import os

FORMAT = '%(asctime)s %(levelname)s %(name)s: %(message)s'


def setup():
    """Attach a stderr handler to the ``app`` logger once; uvicorn keeps its own access/error loggers."""
    logger = logging.getLogger('app')
    if getattr(logger, '_appraisal_configured', False):
        return logger
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(FORMAT))
    logger.addHandler(handler)
    try:
        logger.setLevel(os.getenv('APPRAISAL_LOG_LEVEL', 'INFO').upper())
    except ValueError:
        logger.setLevel(logging.INFO)
    logger.propagate = False
    logger._appraisal_configured = True
    return logger
