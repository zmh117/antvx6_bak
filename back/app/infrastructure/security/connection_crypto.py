"""数据库连接密码加解密封装。"""

from __future__ import annotations

import base64
import hashlib


class ConnectionCrypto:
    """优先使用 cryptography.Fernet；缺失依赖时提供开发环境兜底编码。"""

    def __init__(self, secret: str) -> None:
        self._secret = secret or "dev-connection-secret"

    def _fernet(self):
        try:
            from cryptography.fernet import Fernet
        except Exception:
            return None
        digest = hashlib.sha256(self._secret.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))

    def encrypt(self, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        fernet = self._fernet()
        if fernet:
            return "fernet:" + fernet.encrypt(value.encode("utf-8")).decode("utf-8")
        data = value.encode("utf-8")
        return "dev-b64:" + base64.urlsafe_b64encode(data).decode("utf-8")

    def decrypt(self, value: str | None) -> str | None:
        if not value:
            return None
        if value.startswith("fernet:"):
            fernet = self._fernet()
            if not fernet:
                raise RuntimeError("cryptography is required to decrypt this database password")
            return fernet.decrypt(value.removeprefix("fernet:").encode("utf-8")).decode("utf-8")
        if value.startswith("dev-b64:"):
            return base64.urlsafe_b64decode(value.removeprefix("dev-b64:")).decode("utf-8")
        return value
