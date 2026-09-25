from typing import Annotated

from pydantic import BaseModel, StringConstraints

from poslite.shared.presentation.schemas import Email, Name, Password, TimeZone


class NewOutlet(BaseModel):
    code: Annotated[
        str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Z0-9]{2,10}$")
    ]
    name: Name
    timezone: TimeZone = "Asia/Jakarta"


class SignupRequest(BaseModel):
    business_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)
    ]
    slug: Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, to_lower=True, pattern=r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$"
        ),
    ]
    owner_name: Name
    email: Email
    password: Password
    outlet: NewOutlet
