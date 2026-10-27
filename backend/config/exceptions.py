"""Uniform JSON error shape for the API: {"detail": str, "errors"?: {...}}."""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error", exc_info=exc)
        return Response(
            {"detail": "Something went wrong on the server. Please try again."},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if isinstance(exc, ValidationError):
        data = response.data
        if isinstance(data, list):
            response.data = {"detail": " ".join(str(item) for item in data)}
        elif isinstance(data, dict) and "detail" not in data:
            response.data = {"detail": first_error_message(data), "errors": data}
    return response


def first_error_message(errors) -> str:
    if isinstance(errors, dict):
        for key, value in errors.items():
            message = first_error_message(value)
            if message:
                return message if key == "non_field_errors" else f"{key}: {message}"
    if isinstance(errors, list):
        for item in errors:
            message = first_error_message(item)
            if message:
                return message
    if errors:
        return str(errors)
    return ""
