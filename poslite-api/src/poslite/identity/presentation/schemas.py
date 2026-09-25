from datetime import datetime

from pydantic import BaseModel

from poslite.shared.presentation.schemas import Email


class LoginRequest(BaseModel):
    email: Email
    password: str


class TenantOut(BaseModel):
    id: str
    slug: str
    name: str
    status: str


class UserOut(BaseModel):
    id: str
    name: str
    role: str


class AuthResult(BaseModel):
    token: str
    expires_at: datetime
    user: UserOut
    tenant: TenantOut
