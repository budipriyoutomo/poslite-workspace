from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from poslite.shared.presentation.schemas import Email, Name


class OutletOut(BaseModel):
    id: str
    code: str
    name: str


class DeviceOut(BaseModel):
    id: str
    code: str
    name: str
    outlet: OutletOut


class ActivateRequest(BaseModel):
    email: Email
    password: str
    outlet_id: Annotated[str, StringConstraints(pattern=r"^[0-9A-HJKMNP-TV-Z]{26}$")]
    device_name: Name
    platform: Annotated[str, StringConstraints(max_length=30)] = ""


class ActivationResult(BaseModel):
    device: DeviceOut
    token: str
    server_time: datetime


class DeviceMe(BaseModel):
    device: DeviceOut
